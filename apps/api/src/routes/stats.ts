import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'

import { requireAuth } from '../auth.js'
import { TtlCache } from '../cache.js'
import { db } from '../db.js'
import { asyncHandler } from '../http.js'

interface SummaryRow extends RowDataPacket {
  attempts: number
  correct: number
  answered_questions: number
}

const answerHistory = `(
  SELECT id, user_id, question_id, is_correct, answered_at FROM practice_answers
  UNION ALL
  SELECT id, user_id, question_id, is_correct, answered_at FROM practice_answers_archive
)`

export const statsRouter = Router()
statsRouter.use(requireAuth)

const statsCache = new TtlCache<number, Record<string, unknown>>(60_000, 5_000)

export function invalidateStatsCache(userId: number): void {
  statsCache.delete(userId)
}

statsRouter.get(
  '/',
  asyncHandler(async (request, response) => {
    const userId = request.user!.id
    const payload = await statsCache.getOrLoad(userId, async () => {
      const [[summaryRows], [libraryRows], [typeRows], [chapterRows], [dailyRows]] = await Promise.all([
        db.execute<SummaryRow[]>(
          `SELECT COUNT(*) AS attempts,
                COALESCE(SUM(is_correct = TRUE), 0) AS correct,
                COUNT(DISTINCT question_id) AS answered_questions
         FROM ${answerHistory} answer_history
         WHERE answer_history.user_id = ? AND answer_history.is_correct IS NOT NULL`,
          [userId],
        ),
        db.execute<(RowDataPacket & { wrong: number; favorites: number })[]>(
          `SELECT
           (SELECT COUNT(*) FROM wrong_questions WHERE user_id = ? AND resolved_at IS NULL) AS wrong,
           (SELECT COUNT(*) FROM favorites WHERE user_id = ?) AS favorites`,
          [userId, userId],
        ),
        db.execute<(RowDataPacket & { type: string; attempts: number; correct: number })[]>(
          `SELECT q.type, COUNT(*) AS attempts, COALESCE(SUM(pa.is_correct = TRUE), 0) AS correct
         FROM ${answerHistory} pa
         INNER JOIN questions q ON q.id = pa.question_id
         WHERE pa.user_id = ? AND pa.is_correct IS NOT NULL
         GROUP BY q.type ORDER BY FIELD(q.type, 'single', 'multiple', 'judge')`,
          [userId],
        ),
        db.execute<(RowDataPacket & { chapter_id: number; chapter_no: number; title: string; attempts: number; correct: number })[]>(
          `SELECT c.id AS chapter_id, c.chapter_no, c.title,
                COUNT(pa.id) AS attempts,
                COALESCE(SUM(pa.is_correct = TRUE), 0) AS correct
         FROM chapters c
         INNER JOIN questions q ON q.chapter_id = c.id
         LEFT JOIN ${answerHistory} pa
           ON pa.question_id = q.id AND pa.user_id = ? AND pa.is_correct IS NOT NULL
         GROUP BY c.id ORDER BY c.subject_id, c.chapter_no`,
          [userId],
        ),
        db.execute<(RowDataPacket & { day: string; attempts: number; correct: number })[]>(
          `SELECT DATE_FORMAT(answered_at, '%Y-%m-%d') AS day,
                COUNT(*) AS attempts,
                COALESCE(SUM(is_correct = TRUE), 0) AS correct
         FROM practice_answers
         WHERE user_id = ? AND is_correct IS NOT NULL
           AND answered_at >= CURRENT_DATE - INTERVAL 13 DAY
         GROUP BY DATE_FORMAT(answered_at, '%Y-%m-%d') ORDER BY day`,
          [userId],
        ),
      ])
      const summary = summaryRows[0] ?? { attempts: 0, correct: 0, answered_questions: 0 }
      const library = libraryRows[0] ?? { wrong: 0, favorites: 0 }
      return {
        summary: {
          attempts: summary.attempts,
          correct: summary.correct,
          accuracy: summary.attempts ? Math.round((summary.correct / summary.attempts) * 1000) / 10 : 0,
          answeredQuestions: summary.answered_questions,
          wrongQuestions: library.wrong,
          favorites: library.favorites,
        },
        byType: typeRows.map((row) => ({
          type: row.type,
          attempts: row.attempts,
          correct: row.correct,
          accuracy: row.attempts ? Math.round((row.correct / row.attempts) * 1000) / 10 : 0,
        })),
        byChapter: chapterRows.map((row) => ({
          chapterId: row.chapter_id,
          chapterNumber: row.chapter_no,
          title: row.title,
          attempts: row.attempts,
          correct: row.correct,
          accuracy: row.attempts ? Math.round((row.correct / row.attempts) * 1000) / 10 : 0,
        })),
        daily: dailyRows,
      }
    })
    response.json(payload)
  }),
)
