import type { RowDataPacket } from 'mysql2'

import { TtlCache } from './cache.js'
import { db } from './db.js'

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
}

interface OptionRow extends RowDataPacket {
  label: string
  content: string
  is_correct: number
}

export interface CachedQuestion {
  id: number
  externalKey: string
  number: number
  type: 'single' | 'multiple' | 'judge'
  stem: string
  explanation: string
  confidence: 'high' | 'medium' | 'low'
  isDefective: boolean
  chapterId: number
  chapterNumber: number
  chapterTitle: string
  subjectName: string
  options: Array<{ label: string; content: string; isCorrect: boolean }>
}

const questionCache = new TtlCache<number, CachedQuestion | null>(10 * 60_000, 2_000)

export function invalidateQuestionCache(questionId: number): void {
  questionCache.delete(questionId)
}

export async function getCachedQuestion(questionId: number): Promise<CachedQuestion | null> {
  return questionCache.getOrLoad(questionId, async () => {
    const [[questions], [options]] = await Promise.all([
      db.execute<QuestionRow[]>(
        `SELECT q.id, q.external_key, q.question_no, q.type, q.stem, q.explanation,
                q.confidence, q.is_defective, q.chapter_id, c.chapter_no,
                c.title AS chapter_title, s.name AS subject_name
         FROM questions q
         INNER JOIN chapters c ON c.id = q.chapter_id
         INNER JOIN subjects s ON s.id = q.subject_id
         WHERE q.id = ? AND q.is_active = TRUE LIMIT 1`,
        [questionId],
      ),
      db.execute<OptionRow[]>(
        `SELECT label, content, is_correct FROM question_options
         WHERE question_id = ? ORDER BY sort_order, label`,
        [questionId],
      ),
    ])
    const question = questions[0]
    if (!question) return null
    return {
      id: question.id,
      externalKey: question.external_key,
      number: question.question_no,
      type: question.type,
      stem: question.stem,
      explanation: question.explanation,
      confidence: question.confidence,
      isDefective: Boolean(question.is_defective),
      chapterId: question.chapter_id,
      chapterNumber: question.chapter_no,
      chapterTitle: question.chapter_title,
      subjectName: question.subject_name,
      options: options.map((option) => ({
        label: option.label,
        content: option.content,
        isCorrect: Boolean(option.is_correct),
      })),
    }
  })
}
