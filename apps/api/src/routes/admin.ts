import bcrypt from 'bcryptjs'
import { Router } from 'express'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { z } from 'zod'

import { requireAdmin, requireAuth } from '../auth.js'
import { db } from '../db.js'
import { asyncHandler, HttpError, parseBody, parseId } from '../http.js'

interface UserRow extends RowDataPacket {
  id: number
  username: string
  display_name: string
  role: 'admin' | 'user'
  is_active: number
  created_at: Date
}

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/, '用户名只能使用字母、数字、点、横线和下划线'),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(80),
})

const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    password: z.string().min(8).max(200).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少提供一个修改项')

export const adminRouter = Router()
adminRouter.use(requireAuth, requireAdmin)

adminRouter.get(
  '/users',
  asyncHandler(async (_request, response) => {
    const [rows] = await db.execute<UserRow[]>(
      `SELECT id, username, display_name, role, is_active, created_at
       FROM users ORDER BY created_at, id`,
    )
    response.json({
      users: rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
      })),
      userLimit: 5,
    })
  }),
)

adminRouter.post(
  '/users',
  asyncHandler(async (request, response) => {
    const input = parseBody(createUserSchema, request.body)
    const [countRows] = await db.execute<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) AS total FROM users WHERE is_active = TRUE',
    )
    if ((countRows[0]?.total ?? 0) >= 5) {
      throw new HttpError(409, '当前最多允许 5 个启用中的用户')
    }
    const passwordHash = await bcrypt.hash(input.password, 12)
    try {
      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO users (username, password_hash, display_name, role)
         VALUES (?, ?, ?, 'user')`,
        [input.username, passwordHash, input.displayName],
      )
      response.status(201).json({ id: result.insertId })
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw new HttpError(409, '用户名已经存在')
      }
      throw error
    }
  }),
)

adminRouter.patch(
  '/users/:id',
  asyncHandler(async (request, response) => {
    const userId = parseId(request.params.id, '用户 ID')
    const input = parseBody(updateUserSchema, request.body)
    if (request.user?.id === userId && input.isActive === false) {
      throw new HttpError(400, '不能停用当前登录的管理员账号')
    }

    const changes: string[] = []
    const values: Array<string | number | boolean | null> = []
    if (input.displayName !== undefined) {
      changes.push('display_name = ?')
      values.push(input.displayName)
    }
    if (input.password !== undefined) {
      changes.push('password_hash = ?')
      values.push(await bcrypt.hash(input.password, 12))
    }
    if (input.isActive !== undefined) {
      if (input.isActive) {
        const [countRows] = await db.execute<(RowDataPacket & { total: number })[]>(
          'SELECT COUNT(*) AS total FROM users WHERE is_active = TRUE',
        )
        if ((countRows[0]?.total ?? 0) >= 5) {
          throw new HttpError(409, '当前最多允许 5 个启用中的用户')
        }
      }
      changes.push('is_active = ?')
      values.push(input.isActive)
    }
    values.push(userId)
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE users SET ${changes.join(', ')} WHERE id = ?`,
      values,
    )
    if (!result.affectedRows) {
      throw new HttpError(404, '用户不存在')
    }
    if (input.isActive === false) {
      await db.execute('DELETE FROM auth_sessions WHERE user_id = ?', [userId])
    }
    response.status(204).end()
  }),
)
