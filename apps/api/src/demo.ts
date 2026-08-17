import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import express from 'express'
import helmet from 'helmet'

import { answersMatch, normalizeLabels } from './domain/answers.js'

type QuestionType = 'single' | 'multiple' | 'judge'
type PracticeMode = 'subject' | 'chapter' | 'random' | 'wrong' | 'favorite'

interface SeedQuestion {
  externalKey: string
  chapter: number
  chapterTitle: string
  number: number
  type: QuestionType
  stem: string
  options: Array<{ label: string; content: string }>
  correctLabels: string[]
  confidence: 'high' | 'medium' | 'low'
  isDefective: boolean
  explanation: string
  knowledgePoints: string[]
}

interface SeedPayload {
  subject: { slug: string; name: string; description: string }
  chapters: Array<{ number: number; title: string }>
  questions: SeedQuestion[]
}

interface DemoQuestion extends SeedQuestion {
  id: number
  knowledgePointIds: number[]
}

interface DemoSession {
  id: string
  mode: PracticeMode
  filters: Record<string, unknown>
  questionIds: number[]
  currentIndex: number
  completedAt: string | null
}

interface DemoAnswer {
  selectedLabels: string[]
  correctLabels: string[]
  isCorrect: boolean | null
}

interface DemoUser {
  id: number
  username: string
  displayName: string
  role: 'admin' | 'user'
  isActive: boolean
  createdAt: string
}

const seedPath = fileURLToPath(new URL('../../../data/questions.example.json', import.meta.url))
const seed = JSON.parse(await readFile(seedPath, 'utf8')) as SeedPayload
const knowledgePointIds = new Map<string, number>()
let nextKnowledgePointId = 1

for (const question of seed.questions) {
  for (const name of question.knowledgePoints) {
    const key = `${question.chapter}:${name}`
    if (!knowledgePointIds.has(key)) knowledgePointIds.set(key, nextKnowledgePointId++)
  }
}

const questions: DemoQuestion[] = seed.questions.map((question, index) => ({
  ...question,
  id: index + 1,
  knowledgePointIds: question.knowledgePoints.map((name) => knowledgePointIds.get(`${question.chapter}:${name}`)!),
}))
const questionById = new Map(questions.map((question) => [question.id, question]))
const sessions = new Map<string, DemoSession>()
const answers = new Map<string, DemoAnswer>()
const favoriteQuestionIds = new Set([1, 18, 45, 92, 138])
const wrongQuestionIds = new Set([3, 18, 88, 126, 204, 367])
const wrongCounts = new Map([...wrongQuestionIds].map((id, index) => [id, (index % 3) + 1]))
const aiMessages = new Map<number, Array<{ role: 'user' | 'assistant'; content: string; createdAt: string }>>()
const demoUsers: DemoUser[] = [
  { id: 1, username: 'demo-admin', displayName: '演示管理员', role: 'admin', isActive: true, createdAt: new Date().toISOString() },
  { id: 2, username: 'demo-user', displayName: '学习账号', role: 'user', isActive: true, createdAt: new Date().toISOString() },
]
let nextUserId = 3
let aiSettings = {
  endpointUrl: 'https://example.com/v1/chat/completions',
  model: '演示模型',
  apiKeyMasked: '••••••••',
  systemPrompt: '你是一名耐心、严谨的数据库课程助教。',
  updatedAt: new Date().toISOString(),
}

const currentUser = {
  id: 1,
  username: 'demo-admin',
  displayName: '演示管理员',
  role: 'admin' as const,
}

function numericParam(value: string | string[] | undefined): number {
  return Number(Array.isArray(value) ? value[0] : value)
}

function answerKey(sessionId: string, questionId: number): string {
  return `${sessionId}:${questionId}`
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    const current = result[index]
    const replacement = result[target]
    if (current === undefined || replacement === undefined) continue
    result[index] = replacement
    result[target] = current
  }
  return result
}

function questionResponse(question: DemoQuestion, session: DemoSession, index: number) {
  const answer = answers.get(answerKey(session.id, question.id))
  return {
    question: {
      id: question.id,
      externalKey: question.externalKey,
      number: question.number,
      type: question.type,
      stem: question.stem,
      chapterId: question.chapter,
      chapterNumber: question.chapter,
      chapterTitle: question.chapterTitle,
      subjectName: seed.subject.name,
      isFavorite: favoriteQuestionIds.has(question.id),
      options: question.options,
    },
    position: { index, total: session.questionIds.length },
    result: answer
      ? {
          selectedLabels: answer.selectedLabels,
          correctLabels: answer.correctLabels,
          isCorrect: answer.isCorrect,
          explanation: question.explanation,
          confidence: question.confidence,
          isDefective: question.isDefective,
        }
      : null,
  }
}

function libraryItem(questionId: number) {
  const question = questionById.get(questionId)!
  return {
    id: question.id,
    number: question.number,
    type: question.type,
    stem: question.stem,
    chapterNumber: question.chapter,
    chapterTitle: question.chapterTitle,
    subjectName: seed.subject.name,
    wrongCount: wrongCounts.get(questionId) ?? null,
    correctStreak: wrongQuestionIds.has(questionId) ? 0 : null,
    savedAt: new Date(Date.now() - questionId * 86_400_000).toISOString(),
  }
}

const app = express()
app.disable('x-powered-by')
app.use(helmet({ contentSecurityPolicy: false }))
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_request, response) => response.json({ ok: true, demo: true }))
app.get('/api/auth/me', (_request, response) => response.json({ user: currentUser }))
app.post('/api/auth/login', (_request, response) => response.json({ user: currentUser }))
app.post('/api/auth/logout', (_request, response) => response.status(204).end())

app.get('/api/catalog/subjects', (_request, response) => {
  const chapterItems = seed.chapters.map((chapter) => ({
    id: chapter.number,
    number: chapter.number,
    title: chapter.title,
    questionCount: questions.filter((question) => question.chapter === chapter.number).length,
  }))
  const pointItems = [...knowledgePointIds.entries()].map(([key, id]) => {
    const separator = key.indexOf(':')
    const chapterId = Number(key.slice(0, separator))
    const name = key.slice(separator + 1)
    return {
      id,
      chapterId,
      name,
      questionCount: questions.filter((question) => question.knowledgePointIds.includes(id)).length,
    }
  })
  response.json({
    subjects: [{
      id: 1,
      slug: seed.subject.slug,
      name: seed.subject.name,
      description: seed.subject.description,
      questionCount: questions.length,
      chapters: chapterItems,
      knowledgePoints: pointItems,
    }],
  })
})

app.post('/api/practice/start', (request, response) => {
  const body = request.body as {
    mode?: PracticeMode
    chapterIds?: number[]
    types?: QuestionType[]
    knowledgePointIds?: number[]
    limit?: number
  }
  const mode = body.mode ?? 'subject'
  const chapterIds = Array.isArray(body.chapterIds) ? body.chapterIds : []
  const types = Array.isArray(body.types) && body.types.length ? body.types : ['single', 'multiple', 'judge']
  const pointIds = Array.isArray(body.knowledgePointIds) ? body.knowledgePointIds : []
  const limit = Math.min(Math.max(Number(body.limit) || 30, 5), 300)
  const isFullChapter = mode === 'chapter'
  if (isFullChapter && chapterIds.length !== 1) {
    response.status(400).json({ error: '章节刷题请选择一个章节' })
    return
  }
  const chapterId = isFullChapter ? chapterIds[0] : undefined
  if (chapterId) {
    const existing = [...sessions.values()].reverse().find((session) => {
      const savedChapterIds = Array.isArray(session.filters.chapterIds)
        ? session.filters.chapterIds.map(Number)
        : []
      return session.mode === 'chapter'
        && !session.completedAt
        && session.filters.fullChapter === true
        && savedChapterIds.length === 1
        && savedChapterIds[0] === chapterId
    })
    if (existing) {
      response.json({
        sessionId: existing.id,
        total: existing.questionIds.length,
        currentIndex: existing.currentIndex,
        resumed: true,
      })
      return
    }
  }

  let filtered = isFullChapter
    ? questions.filter((question) => question.chapter === chapterId)
    : questions.filter((question) => (
        (!chapterIds.length || chapterIds.includes(question.chapter))
        && types.includes(question.type)
        && (!pointIds.length || pointIds.some((id) => question.knowledgePointIds.includes(id)))
      ))
  if (mode === 'wrong') filtered = filtered.filter((question) => wrongQuestionIds.has(question.id))
  if (mode === 'favorite') filtered = filtered.filter((question) => favoriteQuestionIds.has(question.id))
  if (mode === 'random') filtered = shuffle(filtered)
  const selected = isFullChapter ? filtered : filtered.slice(0, limit)
  if (!selected.length) {
    response.status(404).json({ error: '演示数据中没有符合条件的题目' })
    return
  }
  const session: DemoSession = {
    id: randomUUID(),
    mode,
    filters: isFullChapter
      ? {
          ...body,
          chapterIds: [chapterId],
          types: ['single', 'multiple', 'judge'],
          knowledgePointIds: [],
          limit: selected.length,
          fullChapter: true,
        }
      : { ...body },
    questionIds: selected.map((question) => question.id),
    currentIndex: 0,
    completedAt: null,
  }
  sessions.set(session.id, session)
  response.status(201).json({ sessionId: session.id, total: session.questionIds.length, resumed: false })
})

app.get('/api/practice/chapter-progress/:subjectId', (_request, response) => {
  const latestByChapter = new Map<number, {
    chapterId: number
    sessionId: string
    answered: number
    total: number
    currentIndex: number
    completedAt: string | null
  }>()
  for (const session of [...sessions.values()].reverse()) {
    const chapterIds = Array.isArray(session.filters.chapterIds)
      ? session.filters.chapterIds.map(Number)
      : []
    const chapterId = chapterIds.length === 1 ? chapterIds[0] : undefined
    if (session.mode !== 'chapter' || session.filters.fullChapter !== true || !chapterId || latestByChapter.has(chapterId)) {
      continue
    }
    const answered = new Set(
      [...answers.keys()]
        .filter((key) => key.startsWith(`${session.id}:`))
        .map((key) => Number(key.split(':')[1])),
    ).size
    latestByChapter.set(chapterId, {
      chapterId,
      sessionId: session.id,
      answered,
      total: session.questionIds.length,
      currentIndex: session.currentIndex,
      completedAt: session.completedAt,
    })
  }
  response.json({ chapters: [...latestByChapter.values()] })
})

app.get('/api/practice/sessions/:sessionId', (request, response) => {
  const session = sessions.get(String(request.params.sessionId ?? ''))
  if (!session) {
    response.status(404).json({ error: '演示练习不存在，请重新开始' })
    return
  }
  response.json({
    session: {
      id: session.id,
      subjectId: 1,
      mode: session.mode,
      filters: session.filters,
      total: session.questionIds.length,
      currentIndex: session.currentIndex,
      completedAt: session.completedAt,
    },
  })
})

app.get('/api/practice/sessions/:sessionId/questions/:index', (request, response) => {
  const session = sessions.get(String(request.params.sessionId ?? ''))
  const index = numericParam(request.params.index)
  const questionId = session?.questionIds[index]
  const question = questionId ? questionById.get(questionId) : undefined
  if (!session || !question || !Number.isInteger(index)) {
    response.status(404).json({ error: '演示题目不存在' })
    return
  }
  session.currentIndex = index
  response.json(questionResponse(question, session, index))
})

app.post('/api/practice/sessions/:sessionId/questions/:questionId/answer', (request, response) => {
  const sessionId = String(request.params.sessionId ?? '')
  const session = sessions.get(sessionId)
  const questionId = numericParam(request.params.questionId)
  const question = questionById.get(questionId)
  if (!session || !question || !session.questionIds.includes(questionId)) {
    response.status(404).json({ error: '演示题目不存在' })
    return
  }
  const selectedLabels = normalizeLabels(
    Array.isArray((request.body as { selectedLabels?: unknown }).selectedLabels)
      ? (request.body as { selectedLabels: string[] }).selectedLabels
      : [],
  )
  const answer: DemoAnswer = {
    selectedLabels,
    correctLabels: question.correctLabels,
    isCorrect: question.isDefective ? null : answersMatch(selectedLabels, question.correctLabels),
  }
  answers.set(answerKey(sessionId, questionId), answer)
  if (answer.isCorrect === false) {
    wrongQuestionIds.add(questionId)
    wrongCounts.set(questionId, (wrongCounts.get(questionId) ?? 0) + 1)
  }
  const answered = new Set(
    [...answers.keys()]
      .filter((key) => key.startsWith(`${sessionId}:`))
      .map((key) => Number(key.split(':')[1])),
  ).size
  if (answered >= session.questionIds.length) session.completedAt = new Date().toISOString()
  response.json({
    result: {
      ...answer,
      explanation: question.explanation,
      confidence: question.confidence,
      isDefective: question.isDefective,
    },
    progress: { answered, total: session.questionIds.length, completed: answered >= session.questionIds.length },
  })
})

app.put('/api/practice/questions/:questionId/favorite', (request, response) => {
  const questionId = numericParam(request.params.questionId)
  const favorite = Boolean((request.body as { favorite?: boolean }).favorite)
  if (favorite) favoriteQuestionIds.add(questionId)
  else favoriteQuestionIds.delete(questionId)
  response.json({ favorite })
})

app.get('/api/library/:kind', (request, response) => {
  const kind = String(request.params.kind ?? '')
  const ids = kind === 'wrong' ? [...wrongQuestionIds] : [...favoriteQuestionIds]
  response.json({ items: ids.filter((id) => questionById.has(id)).map(libraryItem) })
})

app.get('/api/stats', (_request, response) => {
  const chapterAccuracy = [88, 82, 79, 85, 72, 76, 81, 68]
  const today = new Date()
  const daily = [18, 26, 15, 32, 24, 37, 21].map((attempts, index) => {
    const day = new Date(today)
    day.setDate(today.getDate() - (6 - index))
    return { day: day.toISOString().slice(0, 10), attempts, correct: Math.round(attempts * 0.81) }
  })
  response.json({
    summary: {
      attempts: 286,
      correct: 231,
      accuracy: 80.8,
      answeredQuestions: 214,
      wrongQuestions: wrongQuestionIds.size,
      favorites: favoriteQuestionIds.size,
    },
    byType: [
      { type: 'single', attempts: 210, correct: 174, accuracy: 82.9 },
      { type: 'multiple', attempts: 42, correct: 29, accuracy: 69.0 },
      { type: 'judge', attempts: 34, correct: 28, accuracy: 82.4 },
    ],
    byChapter: seed.chapters.map((chapter, index) => ({
      chapterId: chapter.number,
      chapterNumber: chapter.number,
      title: chapter.title,
      attempts: 18 + index * 7,
      correct: Math.round((18 + index * 7) * (chapterAccuracy[index]! / 100)),
      accuracy: chapterAccuracy[index],
    })),
    daily,
  })
})

app.get('/api/ai/status', (_request, response) => response.json({ configured: true, model: aiSettings.model }))
app.get('/api/ai/questions/:questionId/messages', (request, response) => {
  response.json({ messages: aiMessages.get(numericParam(request.params.questionId)) ?? [] })
})
app.post('/api/ai/questions/:questionId/ask', (request, response) => {
  const questionId = numericParam(request.params.questionId)
  const message = String((request.body as { message?: string }).message ?? '').trim()
  const question = questionById.get(questionId)
  const answer = question
    ? `这是免数据库演示回复。当前题目的关键是先识别“${question.knowledgePoints[0] ?? '数据库基础'}”这个知识点，再逐项核对题干条件。正式接入后，这里会调用你在管理页配置的外部 AI。`
    : '这是免数据库演示回复。'
  const history = aiMessages.get(questionId) ?? []
  history.push(
    { role: 'user', content: message, createdAt: new Date().toISOString() },
    { role: 'assistant', content: answer, createdAt: new Date().toISOString() },
  )
  aiMessages.set(questionId, history)
  response.json({ answer })
})

app.get('/api/admin/users', (_request, response) => response.json({ users: demoUsers, userLimit: 5 }))
app.post('/api/admin/users', (request, response) => {
  const body = request.body as { username?: string; displayName?: string }
  const user: DemoUser = {
    id: nextUserId++,
    username: body.username || `demo-${nextUserId}`,
    displayName: body.displayName || '新用户',
    role: 'user',
    isActive: true,
    createdAt: new Date().toISOString(),
  }
  demoUsers.push(user)
  response.status(201).json({ id: user.id })
})
app.patch('/api/admin/users/:id', (request, response) => {
  const user = demoUsers.find((item) => item.id === numericParam(request.params.id))
  if (!user) {
    response.status(404).json({ error: '演示用户不存在' })
    return
  }
  const body = request.body as { displayName?: string; isActive?: boolean }
  if (body.displayName !== undefined) user.displayName = body.displayName
  if (body.isActive !== undefined) user.isActive = body.isActive
  response.status(204).end()
})
app.get('/api/admin/ai/settings', (_request, response) => response.json({ settings: aiSettings }))
app.put('/api/admin/ai/settings', (request, response) => {
  const body = request.body as { endpointUrl?: string; model?: string; systemPrompt?: string }
  aiSettings = {
    ...aiSettings,
    endpointUrl: body.endpointUrl ?? aiSettings.endpointUrl,
    model: body.model ?? aiSettings.model,
    systemPrompt: body.systemPrompt ?? aiSettings.systemPrompt,
    updatedAt: new Date().toISOString(),
  }
  response.status(204).end()
})

app.use((_request, response) => response.status(404).json({ error: '演示接口不存在' }))

const port = 3001
app.listen(port, '0.0.0.0', () => {
  console.log(`免数据库演示 API 已启动：http://0.0.0.0:${port}`)
})
