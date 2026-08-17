import { createHash, randomBytes } from 'node:crypto'

import type { NextFunction, Request, Response } from 'express'
import type { RowDataPacket } from 'mysql2'

import { config } from './config.js'
import { db } from './db.js'
import { HttpError } from './http.js'

export const SESSION_COOKIE = 'shuati_session'

interface AuthRow extends RowDataPacket {
  id: number
  username: string
  display_name: string
  role: 'admin' | 'user'
  token_hash: string
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(request: Request, userId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashSessionToken(token)
  const expiresAt = new Date(Date.now() + config.sessionDays * 86_400_000)
  await db.execute(
    `INSERT INTO auth_sessions
      (token_hash, user_id, expires_at, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?)`,
    [tokenHash, userId, expiresAt, request.get('user-agent')?.slice(0, 255) ?? null, request.ip ?? null],
  )
  return token
}

export function setSessionCookie(response: Response, token: string): void {
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: config.sessionDays * 86_400_000,
    path: '/',
  })
}

export async function requireAuth(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    const token = request.cookies?.[SESSION_COOKIE] as string | undefined
    if (!token) {
      throw new HttpError(401, '请先登录')
    }
    const tokenHash = hashSessionToken(token)
    const [rows] = await db.execute<AuthRow[]>(
      `SELECT u.id, u.username, u.display_name, u.role, s.token_hash
       FROM auth_sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.is_active = TRUE
       LIMIT 1`,
      [tokenHash],
    )
    const row = rows[0]
    if (!row) {
      throw new HttpError(401, '登录已过期，请重新登录')
    }
    request.user = {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
    }
    request.sessionTokenHash = row.token_hash
    void db.execute('UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?', [tokenHash])
    next()
  } catch (error) {
    next(error)
  }
}

export function requireAdmin(request: Request, _response: Response, next: NextFunction): void {
  if (request.user?.role !== 'admin') {
    next(new HttpError(403, '需要管理员权限'))
    return
  }
  next()
}
