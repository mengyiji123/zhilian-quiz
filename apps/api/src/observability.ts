import { AsyncLocalStorage } from 'node:async_hooks'
import { performance } from 'node:perf_hooks'

import type { NextFunction, Request, Response } from 'express'

interface RequestMetrics {
  queryCount: number
  queryDurationMs: number
}

const requestMetrics = new AsyncLocalStorage<RequestMetrics>()
const SLOW_QUERY_MS = 100
const SLOW_REQUEST_MS = 500

function compactSql(sql: unknown): string {
  if (typeof sql === 'string') return sql.replace(/\s+/g, ' ').trim().slice(0, 240)
  if (sql && typeof sql === 'object' && 'sql' in sql) return compactSql((sql as { sql: unknown }).sql)
  return '<prepared query>'
}

export async function observeQuery<T>(sql: unknown, operation: () => Promise<T>): Promise<T> {
  const startedAt = performance.now()
  try {
    return await operation()
  } finally {
    const durationMs = performance.now() - startedAt
    const metrics = requestMetrics.getStore()
    if (metrics) {
      metrics.queryCount += 1
      metrics.queryDurationMs += durationMs
    }
    if (durationMs >= SLOW_QUERY_MS) {
      console.warn(JSON.stringify({
        event: 'slow_query',
        durationMs: Math.round(durationMs * 10) / 10,
        sql: compactSql(sql),
      }))
    }
  }
}

export function performanceMiddleware(request: Request, response: Response, next: NextFunction): void {
  const startedAt = performance.now()
  requestMetrics.run({ queryCount: 0, queryDurationMs: 0 }, () => {
    response.once('finish', () => {
      const metrics = requestMetrics.getStore()
      const durationMs = performance.now() - startedAt
      if (durationMs >= SLOW_REQUEST_MS || (metrics?.queryCount ?? 0) >= 5) {
        console.info(JSON.stringify({
          event: 'request_performance',
          method: request.method,
          path: request.originalUrl.split('?')[0],
          status: response.statusCode,
          durationMs: Math.round(durationMs * 10) / 10,
          queryCount: metrics?.queryCount ?? 0,
          queryDurationMs: Math.round((metrics?.queryDurationMs ?? 0) * 10) / 10,
        }))
      }
    })
    next()
  })
}
