import { fileURLToPath } from 'node:url'

import { config as loadEnv } from 'dotenv'
import { z } from 'zod'

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const enabledBooleanString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true')

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL 未配置'),
  QUESTION_DATA_PATH: z.string().min(1).default('data/questions.json'),
  ADMIN_USERNAME: z.string().min(3).default('admin'),
  ADMIN_PASSWORD: z.string().min(8).default('change-this-password'),
  ADMIN_DISPLAY_NAME: z.string().min(1).default('管理员'),
  APP_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  SESSION_DAYS: z.coerce.number().int().min(1).max(180).default(30),
  COOKIE_SECURE: booleanString,
  TRUST_PROXY: booleanString,
  WEB_DIST_PATH: z.string().optional(),
  MAINTENANCE_ENABLED: enabledBooleanString,
  MAINTENANCE_INTERVAL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  PRACTICE_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(180),
  AI_MESSAGE_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(180),
  MAINTENANCE_BATCH_SIZE: z.coerce.number().int().min(50).max(5000).default(500),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
  throw new Error(`环境变量配置错误：${details}`)
}

export const config = {
  databaseUrl: parsed.data.DATABASE_URL,
  questionDataPath: parsed.data.QUESTION_DATA_PATH,
  adminUsername: parsed.data.ADMIN_USERNAME,
  adminPassword: parsed.data.ADMIN_PASSWORD,
  adminDisplayName: parsed.data.ADMIN_DISPLAY_NAME,
  encryptionKey: parsed.data.APP_ENCRYPTION_KEY,
  host: parsed.data.API_HOST,
  port: parsed.data.API_PORT,
  sessionDays: parsed.data.SESSION_DAYS,
  cookieSecure: parsed.data.COOKIE_SECURE,
  trustProxy: parsed.data.TRUST_PROXY,
  webDistPath: parsed.data.WEB_DIST_PATH,
  maintenanceEnabled: parsed.data.MAINTENANCE_ENABLED,
  maintenanceIntervalHours: parsed.data.MAINTENANCE_INTERVAL_HOURS,
  practiceRetentionDays: parsed.data.PRACTICE_RETENTION_DAYS,
  aiMessageRetentionDays: parsed.data.AI_MESSAGE_RETENTION_DAYS,
  maintenanceBatchSize: parsed.data.MAINTENANCE_BATCH_SIZE,
}
