import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'

import { requireAuth } from '../auth.js'
import { db } from '../db.js'
import { asyncHandler, HttpError } from '../http.js'

interface LibraryRow extends RowDataPacket {
  id: number
  question_no: number
  type: 'single' | 'multiple' | 'judge'
  stem: string
  chapter_no: number
  chapter_title: string
  subject_name: string
  wrong_count: number | null
  correct_streak: number | null
  saved_at: Date
}

export const libraryRouter = Router()
libraryRouter.use(requireAuth)

libraryRouter.get(
  '/:kind',
  asyncHandler(async (request, response) => {
    const kind = request.params.kind
    if (kind !== 'wrong' && kind !== 'favorites') {
      throw new HttpError(404, '列表不存在')
    }
    const subjectId = Number(request.query.subjectId)
    const limit = Math.min(Math.max(Number(request.query.limit) || 100, 1), 300)
    const subjectFilter = Number.isSafeInteger(subjectId) && subjectId > 0
      ? ' AND q.subject_id = ?'
      : ''
    const parameters: Array<string | number | boolean | null> = [request.user!.id]
    if (subjectFilter) parameters.push(subjectId)

    const join = kind === 'wrong'
      ? `INNER JOIN wrong_questions list
           ON list.question_id = q.id AND list.user_id = ? AND list.resolved_at IS NULL`
      : 'INNER JOIN favorites list ON list.question_id = q.id AND list.user_id = ?'
    const fields = kind === 'wrong'
      ? 'list.wrong_count, list.correct_streak, list.last_wrong_at AS saved_at'
      : 'NULL AS wrong_count, NULL AS correct_streak, list.created_at AS saved_at'
    const [rows] = await db.execute<LibraryRow[]>(
      `SELECT q.id, q.question_no, q.type, q.stem, c.chapter_no,
              c.title AS chapter_title, s.name AS subject_name, ${fields}
       FROM questions q
       ${join}
       INNER JOIN chapters c ON c.id = q.chapter_id
       INNER JOIN subjects s ON s.id = q.subject_id
       WHERE q.is_active = TRUE ${subjectFilter}
       ORDER BY saved_at DESC
       LIMIT ${limit}`,
      parameters,
    )
    response.json({
      items: rows.map((row) => ({
        id: row.id,
        number: row.question_no,
        type: row.type,
        stem: row.stem,
        chapterNumber: row.chapter_no,
        chapterTitle: row.chapter_title,
        subjectName: row.subject_name,
        wrongCount: row.wrong_count,
        correctStreak: row.correct_streak,
        savedAt: row.saved_at,
      })),
    })
  }),
)
