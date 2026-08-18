import bcrypt from 'bcryptjs'
import { Router } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { z } from 'zod'

import { requireAdmin, requireAuth } from '../auth.js'
import { db } from '../db.js'
import { paginationClause } from '../domain/sql-values.js'
import { asyncHandler, HttpError, parseBody, parseId } from '../http.js'

interface UserRow extends RowDataPacket {
  id: number
  username: string
  display_name: string
  role: 'admin' | 'user'
  is_active: number
  created_at: Date
}

type QuestionType = 'single' | 'multiple' | 'judge'
type ReportCategory = 'stem' | 'option' | 'answer' | 'explanation' | 'other'

interface AdminQuestionRow extends RowDataPacket {
  id: number
  external_key: string
  question_no: number
  type: QuestionType
  stem: string
  subject_id: number
  subject_name: string
  chapter_id: number
  chapter_no: number
  chapter_title: string
  confidence: 'high' | 'medium' | 'low'
  is_defective: number
  updated_at: Date
  open_report_count: number
  last_reported_at: Date | null
  correct_labels: string | null
}

interface AdminQuestionDetailRow extends AdminQuestionRow {
  explanation: string
}

interface AdminOptionRow extends RowDataPacket {
  label: string
  content: string
  is_correct: number
}

interface AdminKnowledgePointRow extends RowDataPacket {
  id: number
  name: string
}

interface AdminReportRow extends RowDataPacket {
  id: number
  category: ReportCategory
  message: string | null
  status: 'open' | 'resolved'
  reporter_name: string
  reporter_username: string
  created_at: Date
  updated_at: Date
  resolved_at: Date | null
}

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/, '用户名只能使用字母、数字、点、横线和下划线'),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(80),
})

const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    password: z.string().min(8).max(200).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少提供一个修改项')

const questionListQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  subjectId: z.coerce.number().int().positive().optional(),
  chapterId: z.coerce.number().int().positive().optional(),
  type: z.enum(['single', 'multiple', 'judge']).optional(),
  reportStatus: z.enum(['all', 'reported', 'unreported']).default('all'),
  sort: z.enum(['reports_desc', 'updated_desc', 'chapter_asc', 'question_no_asc', 'type_asc']).default('reports_desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(50).default(20),
})

const updateQuestionSchema = z.object({
  type: z.enum(['single', 'multiple', 'judge']),
  stem: z.string().trim().min(1).max(50_000),
  explanation: z.string().trim().max(200_000),
  confidence: z.enum(['high', 'medium', 'low']),
  isDefective: z.boolean(),
  options: z.array(z.object({
    label: z.string().trim().min(1).max(8).transform((value) => value.toUpperCase()),
    content: z.string().trim().min(1).max(50_000),
    isCorrect: z.boolean(),
  })).min(2).max(12),
  knowledgePointIds: z.array(z.number().int().positive()).max(50).default([]),
}).superRefine((input, context) => {
  const labels = input.options.map((option) => option.label)
  if (new Set(labels).size !== labels.length) {
    context.addIssue({ code: 'custom', path: ['options'], message: '选项标识不能重复' })
  }
  const correctCount = input.options.filter((option) => option.isCorrect).length
  if (!input.isDefective && correctCount === 0) {
    context.addIssue({ code: 'custom', path: ['options'], message: '非缺陷题至少需要一个正确答案' })
  }
  if (!input.isDefective && input.type !== 'multiple' && correctCount !== 1) {
    context.addIssue({ code: 'custom', path: ['options'], message: '单选题和判断题必须且只能有一个正确答案' })
  }
})

type QuestionListQuery = z.infer<typeof questionListQuerySchema>

const questionListFrom = `
  FROM questions q
  INNER JOIN subjects s ON s.id = q.subject_id
  INNER JOIN chapters c ON c.id = q.chapter_id
  LEFT JOIN (
    SELECT question_id, COUNT(*) AS open_report_count, MAX(updated_at) AS last_reported_at
    FROM question_error_reports
    WHERE status = 'open'
    GROUP BY question_id
  ) reports ON reports.question_id = q.id`

function buildQuestionFilters(input: QuestionListQuery): { sql: string; values: Array<string | number> } {
  const where = ['q.is_active = TRUE']
  const values: Array<string | number> = []
  if (input.q) {
    const pattern = `%${input.q}%`
    where.push(`(
      q.stem LIKE ? OR q.explanation LIKE ? OR q.external_key LIKE ?
      OR EXISTS (
        SELECT 1 FROM question_options search_options
        WHERE search_options.question_id = q.id AND search_options.content LIKE ?
      )
    )`)
    values.push(pattern, pattern, pattern, pattern)
  }
  if (input.subjectId) {
    where.push('q.subject_id = ?')
    values.push(input.subjectId)
  }
  if (input.chapterId) {
    where.push('q.chapter_id = ?')
    values.push(input.chapterId)
  }
  if (input.type) {
    where.push('q.type = ?')
    values.push(input.type)
  }
  if (input.reportStatus === 'reported') where.push('COALESCE(reports.open_report_count, 0) > 0')
  if (input.reportStatus === 'unreported') where.push('COALESCE(reports.open_report_count, 0) = 0')
  return { sql: where.join(' AND '), values }
}

function splitLabels(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : []
}

export const adminRouter = Router()
adminRouter.use(requireAuth, requireAdmin)

adminRouter.get(
  '/users',
  asyncHandler(async (_request, response) => {
    const [rows] = await db.execute<UserRow[]>(
      `SELECT id, username, display_name, role, is_active, created_at
       FROM users ORDER BY created_at, id`,
    )
    response.json({
      users: rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
      })),
      userLimit: 5,
    })
  }),
)

adminRouter.post(
  '/users',
  asyncHandler(async (request, response) => {
    const input = parseBody(createUserSchema, request.body)
    const [countRows] = await db.execute<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) AS total FROM users WHERE is_active = TRUE',
    )
    if ((countRows[0]?.total ?? 0) >= 5) {
      throw new HttpError(409, '当前最多允许 5 个启用中的用户')
    }
    const passwordHash = await bcrypt.hash(input.password, 12)
    try {
      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO users (username, password_hash, display_name, role)
         VALUES (?, ?, ?, 'user')`,
        [input.username, passwordHash, input.displayName],
      )
      response.status(201).json({ id: result.insertId })
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw new HttpError(409, '用户名已经存在')
      }
      throw error
    }
  }),
)

adminRouter.patch(
  '/users/:id',
  asyncHandler(async (request, response) => {
    const userId = parseId(request.params.id, '用户 ID')
    const input = parseBody(updateUserSchema, request.body)
    if (request.user?.id === userId && input.isActive === false) {
      throw new HttpError(400, '不能停用当前登录的管理员账号')
    }

    const changes: string[] = []
    const values: Array<string | number | boolean | null> = []
    if (input.displayName !== undefined) {
      changes.push('display_name = ?')
      values.push(input.displayName)
    }
    if (input.password !== undefined) {
      changes.push('password_hash = ?')
      values.push(await bcrypt.hash(input.password, 12))
    }
    if (input.isActive !== undefined) {
      if (input.isActive) {
        const [countRows] = await db.execute<(RowDataPacket & { total: number })[]>(
          'SELECT COUNT(*) AS total FROM users WHERE is_active = TRUE',
        )
        if ((countRows[0]?.total ?? 0) >= 5) {
          throw new HttpError(409, '当前最多允许 5 个启用中的用户')
        }
      }
      changes.push('is_active = ?')
      values.push(input.isActive)
    }
    values.push(userId)
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE users SET ${changes.join(', ')} WHERE id = ?`,
      values,
    )
    if (!result.affectedRows) {
      throw new HttpError(404, '用户不存在')
    }
    if (input.isActive === false) {
      await db.execute('DELETE FROM auth_sessions WHERE user_id = ?', [userId])
    }
    response.status(204).end()
  }),
)

adminRouter.get(
  '/questions',
  asyncHandler(async (request, response) => {
    const input = parseBody(questionListQuerySchema, request.query)
    const filters = buildQuestionFilters(input)
    const orderBy: Record<QuestionListQuery['sort'], string> = {
      reports_desc: 'open_report_count DESC, last_reported_at DESC, c.sort_order, q.sort_order, q.id',
      updated_desc: 'q.updated_at DESC, q.id DESC',
      chapter_asc: 's.sort_order, c.sort_order, c.chapter_no, q.sort_order, q.question_no, q.id',
      question_no_asc: 'q.question_no, q.id',
      type_asc: 'q.type, c.sort_order, q.sort_order, q.id',
    }
    const offset = (input.page - 1) * input.pageSize
    const pagination = paginationClause(input.pageSize, offset)
    const [[rows], [countRows]] = await Promise.all([
      db.execute<AdminQuestionRow[]>(
        `SELECT q.id, q.external_key, q.question_no, q.type, q.stem,
                q.subject_id, s.name AS subject_name, q.chapter_id,
                c.chapter_no, c.title AS chapter_title, q.confidence,
                q.is_defective, q.updated_at,
                COALESCE(reports.open_report_count, 0) AS open_report_count,
                reports.last_reported_at,
                (SELECT GROUP_CONCAT(option_answer.label ORDER BY option_answer.sort_order, option_answer.label SEPARATOR ',')
                 FROM question_options option_answer
                 WHERE option_answer.question_id = q.id AND option_answer.is_correct = TRUE) AS correct_labels
         ${questionListFrom}
         WHERE ${filters.sql}
         ORDER BY ${orderBy[input.sort]}
         ${pagination}`,
        filters.values,
      ),
      db.execute<(RowDataPacket & { total: number })[]>(
        `SELECT COUNT(*) AS total ${questionListFrom} WHERE ${filters.sql}`,
        filters.values,
      ),
    ])
    response.json({
      items: rows.map((row) => ({
        id: row.id,
        externalKey: row.external_key,
        number: row.question_no,
        type: row.type,
        stem: row.stem,
        subjectId: row.subject_id,
        subjectName: row.subject_name,
        chapterId: row.chapter_id,
        chapterNumber: row.chapter_no,
        chapterTitle: row.chapter_title,
        confidence: row.confidence,
        isDefective: Boolean(row.is_defective),
        correctLabels: splitLabels(row.correct_labels),
        openReportCount: Number(row.open_report_count),
        lastReportedAt: row.last_reported_at,
        updatedAt: row.updated_at,
      })),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: Number(countRows[0]?.total ?? 0),
      },
    })
  }),
)

adminRouter.get(
  '/questions/:id',
  asyncHandler(async (request, response) => {
    const questionId = parseId(request.params.id, '题目 ID')
    const [[questions], [options], [knowledgePoints], [reports]] = await Promise.all([
      db.execute<AdminQuestionDetailRow[]>(
        `SELECT q.id, q.external_key, q.question_no, q.type, q.stem, q.explanation,
                q.subject_id, s.name AS subject_name, q.chapter_id,
                c.chapter_no, c.title AS chapter_title, q.confidence,
                q.is_defective, q.updated_at,
                (SELECT COUNT(*) FROM question_error_reports count_reports
                 WHERE count_reports.question_id = q.id AND count_reports.status = 'open') AS open_report_count,
                (SELECT MAX(updated_at) FROM question_error_reports latest_report
                 WHERE latest_report.question_id = q.id AND latest_report.status = 'open') AS last_reported_at,
                NULL AS correct_labels
         FROM questions q
         INNER JOIN subjects s ON s.id = q.subject_id
         INNER JOIN chapters c ON c.id = q.chapter_id
         WHERE q.id = ? AND q.is_active = TRUE LIMIT 1`,
        [questionId],
      ),
      db.execute<AdminOptionRow[]>(
        `SELECT label, content, is_correct FROM question_options
         WHERE question_id = ? ORDER BY sort_order, label`,
        [questionId],
      ),
      db.execute<AdminKnowledgePointRow[]>(
        `SELECT kp.id, kp.name
         FROM knowledge_points kp
         INNER JOIN question_knowledge_points qkp ON qkp.knowledge_point_id = kp.id
         WHERE qkp.question_id = ? ORDER BY kp.sort_order, kp.id`,
        [questionId],
      ),
      db.execute<AdminReportRow[]>(
        `SELECT reports.id, reports.category, reports.message, reports.status,
                reporter.display_name AS reporter_name, reporter.username AS reporter_username,
                reports.created_at, reports.updated_at, reports.resolved_at
         FROM question_error_reports reports
         INNER JOIN users reporter ON reporter.id = reports.user_id
         WHERE reports.question_id = ?
         ORDER BY reports.status = 'open' DESC, reports.updated_at DESC, reports.id DESC`,
        [questionId],
      ),
    ])
    const question = questions[0]
    if (!question) throw new HttpError(404, '题目不存在')
    response.json({
      question: {
        id: question.id,
        externalKey: question.external_key,
        number: question.question_no,
        type: question.type,
        stem: question.stem,
        explanation: question.explanation,
        subjectId: question.subject_id,
        subjectName: question.subject_name,
        chapterId: question.chapter_id,
        chapterNumber: question.chapter_no,
        chapterTitle: question.chapter_title,
        confidence: question.confidence,
        isDefective: Boolean(question.is_defective),
        updatedAt: question.updated_at,
        openReportCount: Number(question.open_report_count),
        options: options.map((option) => ({
          label: option.label,
          content: option.content,
          isCorrect: Boolean(option.is_correct),
        })),
        knowledgePoints: knowledgePoints.map((point) => ({ id: point.id, name: point.name })),
        reports: reports.map((report) => ({
          id: report.id,
          category: report.category,
          message: report.message ?? '',
          status: report.status,
          reporterName: report.reporter_name,
          reporterUsername: report.reporter_username,
          createdAt: report.created_at,
          updatedAt: report.updated_at,
          resolvedAt: report.resolved_at,
        })),
      },
    })
  }),
)

adminRouter.put(
  '/questions/:id',
  asyncHandler(async (request, response) => {
    const questionId = parseId(request.params.id, '题目 ID')
    const input = parseBody(updateQuestionSchema, request.body)
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      const [questionRows] = await connection.execute<(RowDataPacket & { subject_id: number })[]>(
        'SELECT subject_id FROM questions WHERE id = ? AND is_active = TRUE FOR UPDATE',
        [questionId],
      )
      const question = questionRows[0]
      if (!question) throw new HttpError(404, '题目不存在')

      const knowledgePointIds = [...new Set(input.knowledgePointIds)]
      if (knowledgePointIds.length) {
        const [pointRows] = await connection.execute<(RowDataPacket & { total: number })[]>(
          `SELECT COUNT(*) AS total FROM knowledge_points
           WHERE subject_id = ? AND id IN (${knowledgePointIds.map(() => '?').join(', ')})`,
          [question.subject_id, ...knowledgePointIds],
        )
        if (Number(pointRows[0]?.total ?? 0) !== knowledgePointIds.length) {
          throw new HttpError(400, '选择了不属于当前科目的知识点')
        }
      }

      await connection.execute(
        `UPDATE questions
         SET type = ?, stem = ?, explanation = ?, confidence = ?, is_defective = ?
         WHERE id = ?`,
        [input.type, input.stem, input.explanation, input.confidence, input.isDefective, questionId],
      )
      await connection.execute('DELETE FROM question_options WHERE question_id = ?', [questionId])
      for (const [index, option] of input.options.entries()) {
        await connection.execute(
          `INSERT INTO question_options (question_id, label, content, is_correct, sort_order)
           VALUES (?, ?, ?, ?, ?)`,
          [questionId, option.label, option.content, option.isCorrect, index],
        )
      }
      await connection.execute('DELETE FROM question_knowledge_points WHERE question_id = ?', [questionId])
      for (const knowledgePointId of knowledgePointIds) {
        await connection.execute(
          'INSERT INTO question_knowledge_points (question_id, knowledge_point_id) VALUES (?, ?)',
          [questionId, knowledgePointId],
        )
      }
      await connection.commit()
      response.status(204).end()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }),
)

adminRouter.post(
  '/questions/:id/reports/resolve',
  asyncHandler(async (request, response) => {
    const questionId = parseId(request.params.id, '题目 ID')
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE question_error_reports
       SET status = 'resolved', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
       WHERE question_id = ? AND status = 'open'`,
      [request.user!.id, questionId],
    )
    response.json({ resolved: result.affectedRows })
  }),
)
