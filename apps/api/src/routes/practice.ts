import { randomUUID } from 'node:crypto'

import { Router } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { z } from 'zod'

import { requireAuth } from '../auth.js'
import { db } from '../db.js'
import { answersMatch, normalizeLabels } from '../domain/answers.js'
import { nullableMessage } from '../domain/sql-values.js'
import { asyncHandler, HttpError, parseBody, parseId } from '../http.js'

type PracticeMode = 'subject' | 'chapter' | 'random' | 'wrong' | 'favorite'

interface SessionRow extends RowDataPacket {
  id: string
  subject_id: number
  mode: PracticeMode
  filters: string | Record<string, unknown>
  question_ids: string | number[]
  current_index: number
  completed_at: Date | null
}

interface QuestionRow extends RowDataPacket {
  id: number
  external_key: string
  question_no: number
  type: 'single' | 'multiple' | 'judge'
  stem: string
  explanation: string
  confidence: 'high' | 'medium' | 'low'
  is_defective: number
  chapter_id: number
  chapter_no: number
  chapter_title: string
  subject_name: string
  is_favorite: number
}

interface OptionRow extends RowDataPacket {
  label: string
  content: string
  is_correct: number
}

interface AnswerRow extends RowDataPacket {
  selected_labels: string | string[]
  correct_labels: string | string[]
  is_correct: number | null
}

interface AnswerSheetRow extends RowDataPacket {
  question_id: number
  is_correct: number | null
}

interface ChapterProgressRow extends SessionRow {
  answered: number
  updated_at: Date
}

const startSchema = z.object({
  subjectId: z.number().int().positive(),
  mode: z.enum(['subject', 'chapter', 'random', 'wrong', 'favorite']).default('subject'),
  chapterIds: z.array(z.number().int().positive()).max(20).default([]),
  types: z.array(z.enum(['single', 'multiple', 'judge'])).min(1).max(3).default(['single', 'multiple', 'judge']),
  knowledgePointIds: z.array(z.number().int().positive()).max(30).default([]),
  limit: z.number().int().min(5).max(300).default(30),
})

const answerSchema = z.object({
  selectedLabels: z.array(z.string().trim().min(1).max(8)).min(1).max(8),
})

const favoriteSchema = z.object({ favorite: z.boolean() })

const reportErrorSchema = z.object({
  category: z.enum(['stem', 'option', 'answer', 'explanation', 'other']),
  message: z.string().trim().max(1000).default(''),
})

function jsonArray<T>(value: string | T[]): T[] {
  return Array.isArray(value) ? value : (JSON.parse(value) as T[])
}

function jsonObject(value: string | Record<string, unknown>): Record<string, unknown> {
  return typeof value === 'string' ? (JSON.parse(value) as Record<string, unknown>) : value
}

function fullChapterId(filters: Record<string, unknown>): number | null {
  if (filters.fullChapter !== true || !Array.isArray(filters.chapterIds) || filters.chapterIds.length !== 1) {
    return null
  }
  const chapterId = Number(filters.chapterIds[0])
  return Number.isSafeInteger(chapterId) && chapterId > 0 ? chapterId : null
}

export const practiceRouter = Router()
practiceRouter.use(requireAuth)

practiceRouter.post(
  '/start',
  asyncHandler(async (request, response) => {
    const input = parseBody(startSchema, request.body)
    const isFullChapter = input.mode === 'chapter'
    if (isFullChapter && input.chapterIds.length !== 1) {
      throw new HttpError(400, '章节刷题请选择一个章节')
    }
    const chapterId = isFullChapter ? input.chapterIds[0]! : null

    if (chapterId) {
      const [existingRows] = await db.execute<SessionRow[]>(
        `SELECT id, subject_id, mode, filters, question_ids, current_index, completed_at
         FROM practice_sessions
         WHERE user_id = ? AND subject_id = ? AND mode = 'chapter' AND completed_at IS NULL
           AND JSON_UNQUOTE(JSON_EXTRACT(filters, '$.fullChapter')) = 'true'
           AND CAST(JSON_UNQUOTE(JSON_EXTRACT(filters, '$.chapterIds[0]')) AS UNSIGNED) = ?
         ORDER BY updated_at DESC LIMIT 1`,
        [request.user!.id, input.subjectId, chapterId],
      )
      const existing = existingRows[0]
      if (existing) {
        response.json({
          sessionId: existing.id,
          total: jsonArray<number>(existing.question_ids).length,
          currentIndex: existing.current_index,
          resumed: true,
        })
        return
      }
    }

    const joins: string[] = []
    const parameters: Array<string | number | boolean | null> = []
    const where = ['q.subject_id = ?', 'q.is_active = TRUE']

    if (input.mode === 'wrong') {
      joins.push('INNER JOIN wrong_questions w ON w.question_id = q.id AND w.user_id = ? AND w.resolved_at IS NULL')
      parameters.push(request.user!.id)
    } else if (input.mode === 'favorite') {
      joins.push('INNER JOIN favorites f ON f.question_id = q.id AND f.user_id = ?')
      parameters.push(request.user!.id)
    }

    parameters.push(input.subjectId)
    if (!isFullChapter) {
      where.push(`q.type IN (${input.types.map(() => '?').join(', ')})`)
      parameters.push(...input.types)
    }

    if (chapterId) {
      where.push('q.chapter_id = ?')
      parameters.push(chapterId)
    } else if (input.chapterIds.length) {
      where.push(`q.chapter_id IN (${input.chapterIds.map(() => '?').join(', ')})`)
      parameters.push(...input.chapterIds)
    }
    if (!isFullChapter && input.knowledgePointIds.length) {
      where.push(
        `EXISTS (
          SELECT 1 FROM question_knowledge_points qkp
          WHERE qkp.question_id = q.id
            AND qkp.knowledge_point_id IN (${input.knowledgePointIds.map(() => '?').join(', ')})
        )`,
      )
      parameters.push(...input.knowledgePointIds)
    }

    let orderBy = 'c.sort_order, q.sort_order, q.id'
    if (input.mode === 'random') orderBy = 'RAND()'
    if (input.mode === 'wrong') orderBy = 'w.last_wrong_at DESC'
    if (input.mode === 'favorite') orderBy = 'f.created_at DESC'
    const [rows] = await db.execute<(RowDataPacket & { id: number })[]>(
      `SELECT q.id
       FROM questions q
       INNER JOIN chapters c ON c.id = q.chapter_id
       ${joins.join('\n')}
       WHERE ${where.join(' AND ')}
       ORDER BY ${orderBy}
       ${isFullChapter ? '' : `LIMIT ${input.limit}`}`,
      parameters,
    )
    const questionIds = rows.map((row) => row.id)
    if (!questionIds.length) {
      throw new HttpError(404, '当前筛选条件下没有题目')
    }

    const sessionId = randomUUID()
    const storedFilters = isFullChapter
      ? {
          ...input,
          chapterIds: [chapterId],
          types: ['single', 'multiple', 'judge'],
          knowledgePointIds: [],
          limit: questionIds.length,
          fullChapter: true,
        }
      : input
    await db.execute(
      `INSERT INTO practice_sessions
        (id, user_id, subject_id, mode, filters, question_ids)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, request.user!.id, input.subjectId, input.mode, JSON.stringify(storedFilters), JSON.stringify(questionIds)],
    )
    response.status(201).json({ sessionId, total: questionIds.length, resumed: false })
  }),
)

practiceRouter.get(
  '/chapter-progress/:subjectId',
  asyncHandler(async (request, response) => {
    const subjectId = parseId(request.params.subjectId, '科目 ID')
    const [rows] = await db.execute<ChapterProgressRow[]>(
      `SELECT ps.id, ps.subject_id, ps.mode, ps.filters, ps.question_ids,
              ps.current_index, ps.completed_at, ps.updated_at,
              COUNT(DISTINCT pa.question_id) AS answered
       FROM practice_sessions ps
       LEFT JOIN practice_answers pa
         ON pa.session_id = ps.id AND pa.user_id = ps.user_id
       WHERE ps.user_id = ? AND ps.subject_id = ? AND ps.mode = 'chapter'
         AND JSON_UNQUOTE(JSON_EXTRACT(ps.filters, '$.fullChapter')) = 'true'
       GROUP BY ps.id, ps.subject_id, ps.mode, ps.filters, ps.question_ids,
                ps.current_index, ps.completed_at, ps.updated_at
       ORDER BY ps.updated_at DESC`,
      [request.user!.id, subjectId],
    )
    const latestByChapter = new Map<number, {
      chapterId: number
      sessionId: string
      answered: number
      total: number
      currentIndex: number
      completedAt: Date | null
    }>()
    for (const row of rows) {
      const chapterId = fullChapterId(jsonObject(row.filters))
      if (!chapterId || latestByChapter.has(chapterId)) continue
      latestByChapter.set(chapterId, {
        chapterId,
        sessionId: row.id,
        answered: Number(row.answered),
        total: jsonArray<number>(row.question_ids).length,
        currentIndex: row.current_index,
        completedAt: row.completed_at,
      })
    }
    response.json({ chapters: [...latestByChapter.values()] })
  }),
)

practiceRouter.get(
  '/sessions/:sessionId',
  asyncHandler(async (request, response) => {
    const [rows] = await db.execute<SessionRow[]>(
      `SELECT id, subject_id, mode, filters, question_ids, current_index, completed_at
       FROM practice_sessions WHERE id = ? AND user_id = ? LIMIT 1`,
      [String(request.params.sessionId ?? ''), request.user!.id],
    )
    const session = rows[0]
    if (!session) throw new HttpError(404, '练习记录不存在')
    const questionIds = jsonArray<number>(session.question_ids)
    const [answerRows] = await db.execute<AnswerSheetRow[]>(
      `SELECT question_id, is_correct
       FROM practice_answers
       WHERE session_id = ? AND user_id = ?
       ORDER BY id`,
      [session.id, request.user!.id],
    )
    const latestAnswerByQuestion = new Map<number, boolean | null>()
    for (const answer of answerRows) {
      latestAnswerByQuestion.set(
        answer.question_id,
        answer.is_correct === null ? null : Boolean(answer.is_correct),
      )
    }
    response.json({
      session: {
        id: session.id,
        subjectId: session.subject_id,
        mode: session.mode,
        filters: typeof session.filters === 'string' ? JSON.parse(session.filters) : session.filters,
        total: questionIds.length,
        currentIndex: session.current_index,
        completedAt: session.completed_at,
        answerSheet: questionIds.map((questionId, index) => ({
          index,
          questionId,
          answered: latestAnswerByQuestion.has(questionId),
          isCorrect: latestAnswerByQuestion.get(questionId) ?? null,
        })),
      },
    })
  }),
)

practiceRouter.get(
  '/sessions/:sessionId/questions/:index',
  asyncHandler(async (request, response) => {
    const index = Number(request.params.index)
    if (!Number.isInteger(index) || index < 0) throw new HttpError(400, '题目序号不正确')
    const [sessions] = await db.execute<SessionRow[]>(
      'SELECT * FROM practice_sessions WHERE id = ? AND user_id = ? LIMIT 1',
      [String(request.params.sessionId ?? ''), request.user!.id],
    )
    const session = sessions[0]
    if (!session) throw new HttpError(404, '练习记录不存在')
    const questionIds = jsonArray<number>(session.question_ids)
    const questionId = questionIds[index]
    if (!questionId) throw new HttpError(404, '题目不存在')

    const [[questions], [options], [answers]] = await Promise.all([
      db.execute<QuestionRow[]>(
        `SELECT q.id, q.external_key, q.question_no, q.type, q.stem, q.explanation,
                q.confidence, q.is_defective, q.chapter_id, c.chapter_no,
                c.title AS chapter_title, s.name AS subject_name,
                EXISTS(SELECT 1 FROM favorites f WHERE f.user_id = ? AND f.question_id = q.id) AS is_favorite
         FROM questions q
         INNER JOIN chapters c ON c.id = q.chapter_id
         INNER JOIN subjects s ON s.id = q.subject_id
         WHERE q.id = ? LIMIT 1`,
        [request.user!.id, questionId],
      ),
      db.execute<OptionRow[]>(
        `SELECT label, content, is_correct FROM question_options
         WHERE question_id = ? ORDER BY sort_order, label`,
        [questionId],
      ),
      db.execute<AnswerRow[]>(
        `SELECT selected_labels, correct_labels, is_correct
         FROM practice_answers
         WHERE session_id = ? AND user_id = ? AND question_id = ?
         ORDER BY answered_at DESC, id DESC LIMIT 1`,
        [session.id, request.user!.id, questionId],
      ),
    ])
    const question = questions[0]
    if (!question) throw new HttpError(404, '题目不存在')
    const answer = answers[0]
    await db.execute('UPDATE practice_sessions SET current_index = ? WHERE id = ?', [index, session.id])
    response.json({
      question: {
        id: question.id,
        externalKey: question.external_key,
        number: question.question_no,
        type: question.type,
        stem: question.stem,
        chapterId: question.chapter_id,
        chapterNumber: question.chapter_no,
        chapterTitle: question.chapter_title,
        subjectName: question.subject_name,
        isFavorite: Boolean(question.is_favorite),
        options: options.map((option) => ({ label: option.label, content: option.content })),
      },
      position: { index, total: questionIds.length },
      result: answer
        ? {
            selectedLabels: jsonArray<string>(answer.selected_labels),
            correctLabels: jsonArray<string>(answer.correct_labels),
            isCorrect: answer.is_correct === null ? null : Boolean(answer.is_correct),
            explanation: question.explanation,
            confidence: question.confidence,
            isDefective: Boolean(question.is_defective),
          }
        : null,
    })
  }),
)

practiceRouter.post(
  '/sessions/:sessionId/questions/:questionId/answer',
  asyncHandler(async (request, response) => {
    const questionId = parseId(request.params.questionId, '题目 ID')
    const input = parseBody(answerSchema, request.body)
    const [sessions] = await db.execute<SessionRow[]>(
      'SELECT * FROM practice_sessions WHERE id = ? AND user_id = ? LIMIT 1',
      [String(request.params.sessionId ?? ''), request.user!.id],
    )
    const session = sessions[0]
    if (!session) throw new HttpError(404, '练习记录不存在')
    const questionIds = jsonArray<number>(session.question_ids)
    if (!questionIds.includes(questionId)) throw new HttpError(400, '这道题不属于当前练习')

    const [[questions], [options]] = await Promise.all([
      db.execute<QuestionRow[]>(
        `SELECT q.*, c.chapter_no, c.title AS chapter_title, s.name AS subject_name,
                FALSE AS is_favorite
         FROM questions q
         INNER JOIN chapters c ON c.id = q.chapter_id
         INNER JOIN subjects s ON s.id = q.subject_id
         WHERE q.id = ? LIMIT 1`,
        [questionId],
      ),
      db.execute<OptionRow[]>(
        `SELECT label, content, is_correct FROM question_options
         WHERE question_id = ? ORDER BY sort_order, label`,
        [questionId],
      ),
    ])
    const question = questions[0]
    if (!question) throw new HttpError(404, '题目不存在')
    const availableLabels = new Set(options.map((option) => option.label))
    const selectedLabels = normalizeLabels(input.selectedLabels)
    if (selectedLabels.some((label) => !availableLabels.has(label))) {
      throw new HttpError(400, '提交了不存在的选项')
    }
    if (question.type !== 'multiple' && selectedLabels.length !== 1) {
      throw new HttpError(400, '单选题或判断题只能选择一个答案')
    }
    const correctLabels = options.filter((option) => option.is_correct).map((option) => option.label)
    const isDefective = Boolean(question.is_defective)
    const isCorrect = isDefective ? null : answersMatch(selectedLabels, correctLabels)

    await db.execute<ResultSetHeader>(
      `INSERT INTO practice_answers
        (session_id, user_id, question_id, selected_labels, correct_labels, is_correct)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [session.id, request.user!.id, questionId, JSON.stringify(selectedLabels), JSON.stringify(correctLabels), isCorrect],
    )

    if (isCorrect === false) {
      await db.execute(
        `INSERT INTO wrong_questions
          (user_id, question_id, wrong_count, correct_streak, last_wrong_at, last_answered_at, resolved_at)
         VALUES (?, ?, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
         ON DUPLICATE KEY UPDATE
           wrong_count = wrong_count + 1,
           correct_streak = 0,
           last_wrong_at = CURRENT_TIMESTAMP,
           last_answered_at = CURRENT_TIMESTAMP,
           resolved_at = NULL`,
        [request.user!.id, questionId],
      )
    } else if (isCorrect === true) {
      await db.execute(
        `UPDATE wrong_questions
         SET correct_streak = correct_streak + 1,
             last_answered_at = CURRENT_TIMESTAMP,
             resolved_at = IF(correct_streak + 1 >= 2, CURRENT_TIMESTAMP, resolved_at)
         WHERE user_id = ? AND question_id = ?`,
        [request.user!.id, questionId],
      )
    }

    const [progressRows] = await db.execute<(RowDataPacket & { answered: number })[]>(
      `SELECT COUNT(DISTINCT question_id) AS answered
       FROM practice_answers WHERE session_id = ? AND user_id = ?`,
      [session.id, request.user!.id],
    )
    const answered = progressRows[0]?.answered ?? 0
    if (answered >= questionIds.length) {
      await db.execute(
        'UPDATE practice_sessions SET completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP) WHERE id = ?',
        [session.id],
      )
    }

    response.json({
      result: {
        selectedLabels,
        correctLabels,
        isCorrect,
        explanation: question.explanation,
        confidence: question.confidence,
        isDefective,
      },
      progress: { answered, total: questionIds.length, completed: answered >= questionIds.length },
    })
  }),
)

practiceRouter.put(
  '/questions/:questionId/favorite',
  asyncHandler(async (request, response) => {
    const questionId = parseId(request.params.questionId, '题目 ID')
    const input = parseBody(favoriteSchema, request.body)
    if (input.favorite) {
      await db.execute(
        'INSERT IGNORE INTO favorites (user_id, question_id) VALUES (?, ?)',
        [request.user!.id, questionId],
      )
    } else {
      await db.execute(
        'DELETE FROM favorites WHERE user_id = ? AND question_id = ?',
        [request.user!.id, questionId],
      )
    }
    response.json({ favorite: input.favorite })
  }),
)

practiceRouter.post(
  '/questions/:questionId/reports',
  asyncHandler(async (request, response) => {
    const questionId = parseId(request.params.questionId, '题目 ID')
    const input = parseBody(reportErrorSchema, request.body)
    const [questions] = await db.execute<(RowDataPacket & { id: number })[]>(
      'SELECT id FROM questions WHERE id = ? AND is_active = TRUE LIMIT 1',
      [questionId],
    )
    if (!questions[0]) throw new HttpError(404, '题目不存在')

    const message = nullableMessage(input.message)
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO question_error_reports (question_id, user_id, category, message)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         category = VALUES(category),
         message = VALUES(message),
         status = 'open',
         resolved_by = NULL,
         resolved_at = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [questionId, request.user!.id, input.category, message],
    )
    const [reports] = await db.execute<(RowDataPacket & { id: number; status: 'open' })[]>(
      `SELECT id, status FROM question_error_reports
       WHERE question_id = ? AND user_id = ? LIMIT 1`,
      [questionId, request.user!.id],
    )
    response.status(result.affectedRows === 1 ? 201 : 200).json({ report: reports[0] })
  }),
)
