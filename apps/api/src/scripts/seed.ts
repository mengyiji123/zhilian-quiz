import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ResultSetHeader, RowDataPacket } from 'mysql2'

import { db } from '../db.js'
import { config } from '../config.js'

interface SeedQuestion {
  externalKey: string
  chapter: number
  number: number
  type: 'single' | 'multiple' | 'judge'
  stem: string
  options: Array<{ label: string; content: string }>
  correctLabels: string[]
  confidence: 'high' | 'medium' | 'low'
  isDefective: boolean
  explanation: string
  knowledgePoints: string[]
  sourceRef: string
}

interface SeedPayload {
  subject: { slug: string; name: string; description: string }
  chapters: Array<{ number: number; title: string }>
  questions: SeedQuestion[]
}

function knowledgeSlug(chapter: number, name: string): string {
  return `c${chapter}-${createHash('sha1').update(name).digest('hex').slice(0, 12)}`
}

const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const seedPath = resolve(projectRoot, config.questionDataPath)
const payload = JSON.parse(await readFile(seedPath, 'utf8')) as SeedPayload
const connection = await db.getConnection()

try {
  await connection.beginTransaction()
  const [subjectResult] = await connection.execute<ResultSetHeader>(
    `INSERT INTO subjects (slug, name, description, sort_order)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       id = LAST_INSERT_ID(id), name = VALUES(name), description = VALUES(description)`,
    [payload.subject.slug, payload.subject.name, payload.subject.description],
  )
  const subjectId = subjectResult.insertId

  const chapterIds = new Map<number, number>()
  for (const chapter of payload.chapters) {
    const [chapterResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO chapters (subject_id, chapter_no, title, sort_order)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), title = VALUES(title), sort_order = VALUES(sort_order)`,
      [subjectId, chapter.number, chapter.title, chapter.number],
    )
    chapterIds.set(chapter.number, chapterResult.insertId)
  }

  const knowledgeIds = new Map<string, number>()
  for (const question of payload.questions) {
    const chapterId = chapterIds.get(question.chapter)
    if (!chapterId) throw new Error(`缺少第 ${question.chapter} 章`) 
    for (const [index, name] of question.knowledgePoints.entries()) {
      const key = `${question.chapter}:${name}`
      if (knowledgeIds.has(key)) continue
      const [knowledgeResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO knowledge_points (subject_id, chapter_id, name, slug, sort_order)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), name = VALUES(name), chapter_id = VALUES(chapter_id)`,
        [subjectId, chapterId, name, knowledgeSlug(question.chapter, name), question.chapter * 100 + index],
      )
      knowledgeIds.set(key, knowledgeResult.insertId)
    }
  }

  let imported = 0
  for (const question of payload.questions) {
    const chapterId = chapterIds.get(question.chapter)
    if (!chapterId) throw new Error(`缺少第 ${question.chapter} 章`)
    const typeOrder = { single: 1, multiple: 2, judge: 3 }[question.type]
    const [questionResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO questions
        (subject_id, chapter_id, external_key, question_no, type, stem, explanation,
         confidence, is_defective, source_ref, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         id = LAST_INSERT_ID(id),
         subject_id = VALUES(subject_id), chapter_id = VALUES(chapter_id),
         question_no = VALUES(question_no), type = VALUES(type), stem = VALUES(stem),
         explanation = VALUES(explanation), confidence = VALUES(confidence),
         is_defective = VALUES(is_defective), source_ref = VALUES(source_ref),
         sort_order = VALUES(sort_order), is_active = TRUE`,
      [
        subjectId,
        chapterId,
        question.externalKey,
        question.number,
        question.type,
        question.stem,
        question.explanation,
        question.confidence,
        question.isDefective,
        question.sourceRef,
        question.chapter * 100_000 + typeOrder * 10_000 + question.number,
      ],
    )
    const questionId = questionResult.insertId
    await connection.execute('DELETE FROM question_options WHERE question_id = ?', [questionId])
    for (const [index, option] of question.options.entries()) {
      await connection.execute(
        `INSERT INTO question_options (question_id, label, content, is_correct, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [questionId, option.label, option.content, question.correctLabels.includes(option.label), index],
      )
    }
    await connection.execute('DELETE FROM question_knowledge_points WHERE question_id = ?', [questionId])
    for (const name of question.knowledgePoints) {
      const knowledgeId = knowledgeIds.get(`${question.chapter}:${name}`)
      if (!knowledgeId) continue
      await connection.execute(
        'INSERT INTO question_knowledge_points (question_id, knowledge_point_id) VALUES (?, ?)',
        [questionId, knowledgeId],
      )
    }
    imported += 1
  }

  const [countRows] = await connection.execute<(RowDataPacket & { total: number })[]>(
    'SELECT COUNT(*) AS total FROM questions WHERE subject_id = ?',
    [subjectId],
  )
  await connection.commit()
  console.log(`题库导入完成：本次 ${imported} 题，科目现有 ${countRows[0]?.total ?? 0} 题。`)
} catch (error) {
  await connection.rollback()
  throw error
} finally {
  connection.release()
  await db.end()
}
