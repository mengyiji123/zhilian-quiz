import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { ZodType } from 'zod'

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

export function asyncHandler(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (request, response, next) => {
    void handler(request, response, next).catch(next)
  }
}

export function parseBody<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new HttpError(400, '提交的数据格式不正确', result.error.flatten())
  }
  return result.data
}

export function parseId(value: string | string[] | undefined, label = 'ID'): number {
  const id = Number(Array.isArray(value) ? value[0] : value)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, `${label} 不正确`)
  }
  return id
}
