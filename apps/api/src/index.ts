import { existsSync } from 'node:fs'
import path from 'node:path'

import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import express, { type ErrorRequestHandler } from 'express'
import helmet from 'helmet'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'

import { config } from './config.js'
import { db, pingDatabase } from './db.js'
import { HttpError } from './http.js'
import { adminRouter } from './routes/admin.js'
import { aiAdminRouter, aiRouter } from './routes/ai.js'
import { authRouter } from './routes/auth.js'
import { catalogRouter } from './routes/catalog.js'
import { libraryRouter } from './routes/library.js'
import { practiceRouter } from './routes/practice.js'
import { statsRouter } from './routes/stats.js'

async function bootstrapAdmin(): Promise<void> {
  const [rows] = await db.execute<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM users')
  if ((rows[0]?.total ?? 0) > 0) return
  const passwordHash = await bcrypt.hash(config.adminPassword, 12)
  await db.execute<ResultSetHeader>(
    `INSERT INTO users (username, password_hash, display_name, role)
     VALUES (?, ?, ?, 'admin')`,
    [config.adminUsername, passwordHash, config.adminDisplayName],
  )
  console.log(`已创建初始管理员：${config.adminUsername}`)
}

await pingDatabase()
await bootstrapAdmin()
await db.execute('DELETE FROM auth_sessions WHERE expires_at <= NOW()')

const app = express()
if (config.trustProxy) app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(helmet({ contentSecurityPolicy: false }))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

app.get('/api/health', async (_request, response, next) => {
  try {
    await pingDatabase()
    response.json({ ok: true })
  } catch (error) {
    next(error)
  }
})
app.use('/api/auth', authRouter)
app.use('/api/catalog', catalogRouter)
app.use('/api/practice', practiceRouter)
app.use('/api/library', libraryRouter)
app.use('/api/stats', statsRouter)
app.use('/api/ai', aiRouter)
app.use('/api/admin', adminRouter)
app.use('/api/admin/ai', aiAdminRouter)

if (config.webDistPath && existsSync(config.webDistPath)) {
  app.use(express.static(config.webDistPath, { index: false }))
  app.get('*splat', (request, response, next) => {
    if (request.path.startsWith('/api/')) {
      next()
      return
    }
    response.sendFile(path.join(config.webDistPath!, 'index.html'))
  })
}

app.use((_request, _response, next) => next(new HttpError(404, '接口不存在')))

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const status = error instanceof HttpError ? error.status : 500
  const message = error instanceof HttpError ? error.message : '服务器内部错误'
  if (status >= 500) console.error(error)
  response.status(status).json({
    error: message,
    ...(error instanceof HttpError && error.details ? { details: error.details } : {}),
  })
}
app.use(errorHandler)

const server = app.listen(config.port, config.host, () => {
  console.log(`刷题 API 已启动：http://${config.host}:${config.port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void db.end().finally(() => process.exit(0))
    })
  })
}
