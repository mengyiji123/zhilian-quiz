import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { z } from 'zod'

import { readProviderText } from '../ai/provider-stream.js'
import { requireAdmin, requireAuth } from '../auth.js'
import { db } from '../db.js'
import { decryptSecret, encryptSecret } from '../encryption.js'
import { asyncHandler, HttpError, parseBody, parseId } from '../http.js'

const DEFAULT_SYSTEM_PROMPT = `你是一名耐心、严谨的数据库课程助教。请围绕当前题目回答学生的问题：
1. 先直接回应疑问，再解释关键概念；
2. 不要只复述标准答案；
3. 如果题目本身有歧义，要明确指出；
4. 使用简体中文，尽量控制在 500 字以内。`

interface SettingRow extends RowDataPacket {
  endpoint_url: string
  model: string
  api_key_ciphertext: string
  api_key_iv: string
  api_key_tag: string
  system_prompt: string
  updated_at: Date
}

interface QuestionContextRow extends RowDataPacket {
  id: number
  stem: string
  explanation: string
  type: string
  chapter_title: string
}

interface OptionContextRow extends RowDataPacket {
  label: string
  content: string
  is_correct: number
}

interface MessageRow extends RowDataPacket {
  role: 'user' | 'assistant'
  content: string
  created_at: Date
}

const askSchema = z.object({
  message: z.string().trim().min(1).max(2000),
})

const settingsSchema = z.object({
  endpointUrl: z.url().max(500),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(1).max(1000).optional(),
  systemPrompt: z.string().trim().min(1).max(5000).default(DEFAULT_SYSTEM_PROMPT),
})

function buildProviderBody(
  endpointUrl: string,
  model: string,
  systemPrompt: string,
  context: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  message: string,
): Record<string, unknown> {
  const messages = [
    { role: 'system' as const, content: `${systemPrompt}\n\n当前题目资料：\n${context}` },
    ...history,
    { role: 'user' as const, content: message },
  ]
  if (new URL(endpointUrl).pathname.endsWith('/responses')) {
    return {
      model,
      stream: true,
      input: messages.map((item) => ({
        role: item.role,
        content: [{ type: 'input_text', text: item.content }],
      })),
    }
  }
  return { model, messages, temperature: 0.3, stream: true }
}

export const aiRouter = Router()
aiRouter.use(requireAuth)

aiRouter.get(
  '/status',
  asyncHandler(async (_request, response) => {
    const [rows] = await db.execute<SettingRow[]>('SELECT * FROM ai_settings WHERE id = 1 LIMIT 1')
    response.json({ configured: Boolean(rows[0]), model: rows[0]?.model ?? null })
  }),
)

aiRouter.get(
  '/questions/:questionId/messages',
  asyncHandler(async (request, response) => {
    const questionId = parseId(request.params.questionId, '题目 ID')
    const [rows] = await db.execute<MessageRow[]>(
      `SELECT role, content, created_at
       FROM ai_messages WHERE user_id = ? AND question_id = ?
       ORDER BY created_at, id LIMIT 50`,
      [request.user!.id, questionId],
    )
    response.json({
      messages: rows.map((row) => ({ role: row.role, content: row.content, createdAt: row.created_at })),
    })
  }),
)

aiRouter.post(
  '/questions/:questionId/ask',
  rateLimit({ windowMs: 10 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }),
  asyncHandler(async (request, response) => {
    const questionId = parseId(request.params.questionId, '题目 ID')
    const input = parseBody(askSchema, request.body)
    const [[answerRows], [settingRows], [questionRows], [optionRows], [historyRows]] = await Promise.all([
      db.execute<(RowDataPacket & { total: number })[]>(
        'SELECT COUNT(*) AS total FROM practice_answers WHERE user_id = ? AND question_id = ?',
        [request.user!.id, questionId],
      ),
      db.execute<SettingRow[]>('SELECT * FROM ai_settings WHERE id = 1 LIMIT 1'),
      db.execute<QuestionContextRow[]>(
        `SELECT q.id, q.stem, q.explanation, q.type, c.title AS chapter_title
         FROM questions q INNER JOIN chapters c ON c.id = q.chapter_id
         WHERE q.id = ? LIMIT 1`,
        [questionId],
      ),
      db.execute<OptionContextRow[]>(
        `SELECT label, content, is_correct FROM question_options
         WHERE question_id = ? ORDER BY sort_order, label`,
        [questionId],
      ),
      db.execute<MessageRow[]>(
        `SELECT role, content, created_at FROM ai_messages
         WHERE user_id = ? AND question_id = ?
         ORDER BY created_at DESC, id DESC LIMIT 10`,
        [request.user!.id, questionId],
      ),
    ])
    if (!(answerRows[0]?.total ?? 0)) {
      throw new HttpError(403, '提交答案并查看解析后，才能询问 AI')
    }
    const setting = settingRows[0]
    if (!setting) throw new HttpError(503, '管理员还没有配置 AI 服务')
    const question = questionRows[0]
    if (!question) throw new HttpError(404, '题目不存在')

    const correctLabels = optionRows.filter((option) => option.is_correct).map((option) => option.label)
    const optionText = optionRows.map((option) => `${option.label}. ${option.content}`).join('\n')
    const context = [
      `章节：${question.chapter_title}`,
      `题型：${question.type}`,
      `题干：${question.stem}`,
      `选项：\n${optionText}`,
      `校订答案：${correctLabels.join('、') || '题目有缺陷，无法唯一确定'}`,
      `已有解析：${question.explanation}`,
    ].join('\n')
    const history = [...historyRows].reverse().map((row) => ({ role: row.role, content: row.content }))
    const apiKey = decryptSecret({
      ciphertext: setting.api_key_ciphertext,
      iv: setting.api_key_iv,
      tag: setting.api_key_tag,
    })

    const controller = new AbortController()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 90_000)
    const abortForDisconnect = (): void => {
      if (!response.writableEnded) controller.abort()
    }
    response.once('close', abortForDisconnect)

    let providerResponse: globalThis.Response
    try {
      providerResponse = await fetch(setting.endpoint_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(
          buildProviderBody(
            setting.endpoint_url,
            setting.model,
            setting.system_prompt,
            context,
            history,
            input.message,
          ),
        ),
        signal: controller.signal,
      })
    } catch (error) {
      clearTimeout(timeout)
      response.off('close', abortForDisconnect)
      if (response.destroyed) return
      const message = timedOut ? 'AI 服务响应超时' : '无法连接 AI 服务'
      throw new HttpError(502, message)
    }
    if (!providerResponse.ok) {
      clearTimeout(timeout)
      response.off('close', abortForDisconnect)
      throw new HttpError(502, `AI 服务返回错误（${providerResponse.status}）`)
    }

    response.status(200)
    response.set({
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    })
    response.flushHeaders()

    let answer = ''
    try {
      for await (const delta of readProviderText(providerResponse)) {
        if (response.destroyed) return
        answer += delta
        response.write(`${JSON.stringify({ type: 'delta', content: delta })}\n`)
      }
      const completeAnswer = answer.trim()
      if (!completeAnswer) throw new Error('AI 服务没有返回可显示的文字')

      await db.execute<ResultSetHeader>(
        `INSERT INTO ai_messages (user_id, question_id, role, content)
         VALUES (?, ?, 'user', ?), (?, ?, 'assistant', ?)`,
        [request.user!.id, questionId, input.message, request.user!.id, questionId, completeAnswer],
      )
      response.write(`${JSON.stringify({ type: 'done' })}\n`)
      response.end()
    } catch (error) {
      if (!response.destroyed) {
        console.error(error)
        const message = timedOut
          ? 'AI 服务响应超时'
          : error instanceof Error && error.message === 'AI 服务没有返回可显示的文字'
            ? error.message
            : 'AI 回答中断，请重试'
        response.write(`${JSON.stringify({ type: 'error', message })}\n`)
        response.end()
      }
    } finally {
      clearTimeout(timeout)
      response.off('close', abortForDisconnect)
    }
  }),
)

export const aiAdminRouter = Router()
aiAdminRouter.use(requireAuth, requireAdmin)

aiAdminRouter.get(
  '/settings',
  asyncHandler(async (_request, response) => {
    const [rows] = await db.execute<SettingRow[]>('SELECT * FROM ai_settings WHERE id = 1 LIMIT 1')
    const row = rows[0]
    response.json({
      settings: row
        ? {
            endpointUrl: row.endpoint_url,
            model: row.model,
            apiKeyMasked: '••••••••',
            systemPrompt: row.system_prompt,
            updatedAt: row.updated_at,
          }
        : {
            endpointUrl: '',
            model: '',
            apiKeyMasked: '',
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            updatedAt: null,
          },
    })
  }),
)

aiAdminRouter.put(
  '/settings',
  asyncHandler(async (request, response) => {
    const input = parseBody(settingsSchema, request.body)
    const [existingRows] = await db.execute<SettingRow[]>('SELECT * FROM ai_settings WHERE id = 1 LIMIT 1')
    const existing = existingRows[0]
    if (!existing && !input.apiKey) throw new HttpError(400, '首次配置时必须填写 API Key')
    const secret = input.apiKey
      ? encryptSecret(input.apiKey)
      : {
          ciphertext: existing!.api_key_ciphertext,
          iv: existing!.api_key_iv,
          tag: existing!.api_key_tag,
        }
    await db.execute(
      `INSERT INTO ai_settings
        (id, endpoint_url, model, api_key_ciphertext, api_key_iv, api_key_tag, system_prompt, updated_by)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         endpoint_url = VALUES(endpoint_url),
         model = VALUES(model),
         api_key_ciphertext = VALUES(api_key_ciphertext),
         api_key_iv = VALUES(api_key_iv),
         api_key_tag = VALUES(api_key_tag),
         system_prompt = VALUES(system_prompt),
         updated_by = VALUES(updated_by)`,
      [
        input.endpointUrl,
        input.model,
        secret.ciphertext,
        secret.iv,
        secret.tag,
        input.systemPrompt,
        request.user!.id,
      ],
    )
    response.status(204).end()
  }),
)
