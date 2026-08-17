import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'

import { requireAuth } from '../auth.js'
import { db } from '../db.js'
import { asyncHandler } from '../http.js'

interface SubjectRow extends RowDataPacket {
  id: number
  slug: string
  name: string
  description: string | null
  question_count: number
}

interface ChapterRow extends RowDataPacket {
  id: number
  subject_id: number
  chapter_no: number
  title: string
  question_count: number
}

interface KnowledgePointRow extends RowDataPacket {
  id: number
  subject_id: number
  chapter_id: number | null
  name: string
  question_count: number
}

export const catalogRouter = Router()
catalogRouter.use(requireAuth)

catalogRouter.get(
  '/subjects',
  asyncHandler(async (_request, response) => {
    const [[subjects], [chapters], [knowledgePoints]] = await Promise.all([
      db.execute<SubjectRow[]>(
        `SELECT s.id, s.slug, s.name, s.description, COUNT(q.id) AS question_count
         FROM subjects s
         LEFT JOIN questions q ON q.subject_id = s.id AND q.is_active = TRUE
         WHERE s.is_active = TRUE
         GROUP BY s.id
         ORDER BY s.sort_order, s.id`,
      ),
      db.execute<ChapterRow[]>(
        `SELECT c.id, c.subject_id, c.chapter_no, c.title, COUNT(q.id) AS question_count
         FROM chapters c
         LEFT JOIN questions q ON q.chapter_id = c.id AND q.is_active = TRUE
         GROUP BY c.id
         ORDER BY c.subject_id, c.sort_order, c.chapter_no`,
      ),
      db.execute<KnowledgePointRow[]>(
        `SELECT kp.id, kp.subject_id, kp.chapter_id, kp.name,
                COUNT(qkp.question_id) AS question_count
         FROM knowledge_points kp
         LEFT JOIN question_knowledge_points qkp ON qkp.knowledge_point_id = kp.id
         GROUP BY kp.id
         ORDER BY kp.subject_id, kp.sort_order, kp.id`,
      ),
    ])

    response.json({
      subjects: subjects.map((subject) => ({
        id: subject.id,
        slug: subject.slug,
        name: subject.name,
        description: subject.description,
        questionCount: subject.question_count,
        chapters: chapters
          .filter((chapter) => chapter.subject_id === subject.id)
          .map((chapter) => ({
            id: chapter.id,
            number: chapter.chapter_no,
            title: chapter.title,
            questionCount: chapter.question_count,
          })),
        knowledgePoints: knowledgePoints
          .filter((point) => point.subject_id === subject.id)
          .map((point) => ({
            id: point.id,
            chapterId: point.chapter_id,
            name: point.name,
            questionCount: point.question_count,
          })),
      })),
    })
  }),
)
