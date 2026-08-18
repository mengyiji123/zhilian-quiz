import { createHash, randomBytes } from 'node:crypto'

import type { NextFunction, Request, Response } from 'express'
import type { RowDataPacket } from 'mysql2'

import { TtlCache } from './cache.js'
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

type AuthUser = NonNullable<Request['user']>

const authCache = new TtlCache<string, AuthUser>(60_000, 5_000)
const lastSeenWrites = new Map<string, number>()
const LAST_SEEN_INTERVAL_MS = 5 * 60_000

function cacheAuthenticatedUser(tokenHash: string, user: AuthUser): void {
  authCache.set(tokenHash, user)
}

export function invalidateAuthSession(tokenHash: string): void {
  authCache.delete(tokenHash)
  lastSeenWrites.delete(tokenHash)
}

export function invalidateUserAuth(userId: number): void {
  authCache.deleteWhere((user) => user.id === userId)
}

function touchSession(tokenHash: string): void {
  const now = Date.now()
  if (now - (lastSeenWrites.get(tokenHash) ?? 0) < LAST_SEEN_INTERVAL_MS) return
  if (lastSeenWrites.size >= 5_000) lastSeenWrites.clear()
  lastSeenWrites.set(tokenHash, now)
  void db.execute('UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?', [tokenHash])
    .catch((error) => console.warn('更新会话活跃时间失败', error))
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
    const cachedUser = authCache.get(tokenHash)
    if (cachedUser) {
      request.user = cachedUser
      request.sessionTokenHash = tokenHash
      touchSession(tokenHash)
      next()
      return
    }
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
    const user: AuthUser = {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
    }
    request.user = user
    request.sessionTokenHash = row.token_hash
    cacheAuthenticatedUser(tokenHash, user)
    touchSession(tokenHash)
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
