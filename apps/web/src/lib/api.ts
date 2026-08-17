export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: 'same-origin',
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: '请求失败' })) as {
      error?: string
      details?: unknown
    }
    throw new ApiError(payload.error ?? `请求失败（${response.status}）`, response.status, payload.details)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
