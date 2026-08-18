import bcrypt from 'bcryptjs'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'

import {
  createSession,
  invalidateAuthSession,
  requireAuth,
  SESSION_COOKIE,
  setSessionCookie,
} from '../auth.js'
import { config } from '../config.js'
import { db } from '../db.js'
import { asyncHandler, HttpError, parseBody } from '../http.js'

interface LoginUserRow extends RowDataPacket {
  id: number
  username: string
  password_hash: string
  display_name: string
  role: 'admin' | 'user'
  is_active: number
}

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
})

export const authRouter = Router()

authRouter.post(
  '/login',
  rateLimit({ windowMs: 10 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }),
  asyncHandler(async (request, response) => {
    const input = parseBody(loginSchema, request.body)
    const [rows] = await db.execute<LoginUserRow[]>(
      `SELECT id, username, password_hash, display_name, role, is_active
       FROM users WHERE username = ? LIMIT 1`,
      [input.username],
    )
    const user = rows[0]
    const validPassword = user ? await bcrypt.compare(input.password, user.password_hash) : false
    if (!user || !validPassword || !user.is_active) {
      throw new HttpError(401, '用户名或密码不正确')
    }
    const token = await createSession(request, user.id)
    setSessionCookie(response, token)
    response.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
      },
    })
  }),
)

authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (request, response) => {
    if (request.sessionTokenHash) {
      await db.execute('DELETE FROM auth_sessions WHERE token_hash = ?', [request.sessionTokenHash])
      invalidateAuthSession(request.sessionTokenHash)
    }
    response.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'lax',
      path: '/',
    })
    response.status(204).end()
  }),
)

authRouter.get('/me', requireAuth, (request, response) => {
  response.json({ user: request.user })
})
