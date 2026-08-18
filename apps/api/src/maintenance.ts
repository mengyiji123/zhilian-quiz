import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'

import { config } from './config.js'
import { db } from './db.js'
import { retentionCutoff } from './domain/retention.js'

interface LockRow extends RowDataPacket {
  acquired: number
}

interface IdRow extends RowDataPacket {
  id: string | number
}

interface CountRow extends RowDataPacket {
  total: number
}

export interface MaintenanceResult {
  expiredSessions: number
  archivedPracticeSessions: number
  archivedPracticeAnswers: number
  archivedAiMessages: number
}

async function countRows(
  connection: PoolConnection,
  table: 'practice_answers' | 'practice_answers_archive',
  sessionPlaceholders: string,
  sessionIds: Array<string | number>,
): Promise<number> {
  const [rows] = await connection.execute<CountRow[]>(
    `SELECT COUNT(*) AS total FROM ${table} WHERE session_id IN (${sessionPlaceholders})`,
    sessionIds,
  )
  return Number(rows[0]?.total ?? 0)
}

async function archivePractices(connection: PoolConnection, cutoff: Date, limit: number): Promise<{
  sessions: number
  answers: number
}> {
  await connection.beginTransaction()
  try {
    const [rows] = await connection.execute<IdRow[]>(
      `SELECT id FROM practice_sessions
       WHERE completed_at IS NOT NULL AND completed_at < ?
       ORDER BY completed_at, id LIMIT ? FOR UPDATE SKIP LOCKED`,
      [cutoff, limit],
    )
    if (!rows.length) {
      await connection.commit()
      return { sessions: 0, answers: 0 }
    }

    const placeholders = rows.map(() => '?').join(', ')
    const ids = rows.map((row) => row.id)
    const sourceAnswerCount = await countRows(connection, 'practice_answers', placeholders, ids)
    await connection.execute<ResultSetHeader>(
      `INSERT IGNORE INTO practice_sessions_archive
        (id, user_id, subject_id, mode, filters, question_ids, current_index,
         completed_at, created_at, updated_at)
       SELECT id, user_id, subject_id, mode, filters, question_ids, current_index,
              completed_at, created_at, updated_at
       FROM practice_sessions WHERE id IN (${placeholders})`,
      ids,
    )
    await connection.execute<ResultSetHeader>(
      `INSERT IGNORE INTO practice_answers_archive
        (id, session_id, user_id, question_id, selected_labels, correct_labels, is_correct, answered_at)
       SELECT id, session_id, user_id, question_id, selected_labels, correct_labels, is_correct, answered_at
       FROM practice_answers WHERE session_id IN (${placeholders})`,
      ids,
    )

    const [archiveSessionRows] = await connection.execute<CountRow[]>(
      `SELECT COUNT(*) AS total FROM practice_sessions_archive WHERE id IN (${placeholders})`,
      ids,
    )
    const archiveAnswerCount = await countRows(connection, 'practice_answers_archive', placeholders, ids)
    if (Number(archiveSessionRows[0]?.total ?? 0) !== ids.length || archiveAnswerCount !== sourceAnswerCount) {
      throw new Error('练习归档校验失败，已取消本批次操作')
    }

    const [sessionResult] = await connection.execute<ResultSetHeader>(
      `DELETE FROM practice_sessions WHERE id IN (${placeholders})`,
      ids,
    )
    if (sessionResult.affectedRows !== ids.length) {
      throw new Error('练习归档删除校验失败，已取消本批次操作')
    }
    await connection.commit()
    return { sessions: sessionResult.affectedRows, answers: sourceAnswerCount }
  } catch (error) {
    await connection.rollback()
    throw error
  }
}

async function archiveAiMessages(connection: PoolConnection, cutoff: Date, limit: number): Promise<number> {
  await connection.beginTransaction()
  try {
    const [rows] = await connection.execute<IdRow[]>(
      `SELECT id FROM ai_messages
       WHERE created_at < ? ORDER BY created_at, id LIMIT ? FOR UPDATE SKIP LOCKED`,
      [cutoff, limit],
    )
    if (!rows.length) {
      await connection.commit()
      return 0
    }

    const placeholders = rows.map(() => '?').join(', ')
    const ids = rows.map((row) => row.id)
    await connection.execute<ResultSetHeader>(
      `INSERT IGNORE INTO ai_messages_archive
        (id, user_id, question_id, role, content, created_at)
       SELECT id, user_id, question_id, role, content, created_at
       FROM ai_messages WHERE id IN (${placeholders})`,
      ids,
    )
    const [archiveRows] = await connection.execute<CountRow[]>(
      `SELECT COUNT(*) AS total FROM ai_messages_archive WHERE id IN (${placeholders})`,
      ids,
    )
    if (Number(archiveRows[0]?.total ?? 0) !== ids.length) {
      throw new Error('AI 对话归档校验失败，已取消本批次操作')
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `DELETE FROM ai_messages WHERE id IN (${placeholders})`,
      ids,
    )
    if (result.affectedRows !== ids.length) {
      throw new Error('AI 对话归档删除校验失败，已取消本批次操作')
    }
    await connection.commit()
    return result.affectedRows
  } catch (error) {
    await connection.rollback()
    throw error
  }
}

export async function runDataMaintenance(now = new Date()): Promise<MaintenanceResult | null> {
  const connection = await db.getConnection()
  let locked = false
  try {
    const [lockRows] = await connection.execute<LockRow[]>(
      `SELECT GET_LOCK('zhilian_data_maintenance', 0) AS acquired`,
    )
    locked = Boolean(lockRows[0]?.acquired)
    if (!locked) return null

    const [expiredResult] = await connection.execute<ResultSetHeader>(
      'DELETE FROM auth_sessions WHERE expires_at <= NOW()',
    )
    const practices = { sessions: 0, answers: 0 }
    for (let batch = 0; batch < 20; batch += 1) {
      const result = await archivePractices(
        connection,
        retentionCutoff(config.practiceRetentionDays, now),
        config.maintenanceBatchSize,
      )
      practices.sessions += result.sessions
      practices.answers += result.answers
      if (result.sessions < config.maintenanceBatchSize) break
    }
    let archivedAiMessages = 0
    for (let batch = 0; batch < 20; batch += 1) {
      const archived = await archiveAiMessages(
        connection,
        retentionCutoff(config.aiMessageRetentionDays, now),
        config.maintenanceBatchSize,
      )
      archivedAiMessages += archived
      if (archived < config.maintenanceBatchSize) break
    }
    return {
      expiredSessions: expiredResult.affectedRows,
      archivedPracticeSessions: practices.sessions,
      archivedPracticeAnswers: practices.answers,
      archivedAiMessages,
    }
  } finally {
    try {
      if (locked) await connection.execute(`SELECT RELEASE_LOCK('zhilian_data_maintenance')`)
    } finally {
      connection.release()
    }
  }
}

export function startDataMaintenance(): () => void {
  if (!config.maintenanceEnabled) return () => undefined
  let running = false
  const run = async (): Promise<void> => {
    if (running) return
    running = true
    try {
      const result = await runDataMaintenance()
      if (result && Object.values(result).some((count) => count > 0)) {
        console.info(JSON.stringify({ event: 'data_maintenance', ...result }))
      }
    } catch (error) {
      console.error('历史数据维护失败', error)
    } finally {
      running = false
    }
  }
  void run()
  const timer = setInterval(() => void run(), config.maintenanceIntervalHours * 3_600_000)
  timer.unref()
  return () => clearInterval(timer)
}
