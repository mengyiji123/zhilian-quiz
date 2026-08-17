function textParts(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .flatMap((part) => {
      if (!part || typeof part !== 'object') return []
      const text = (part as { text?: unknown }).text
      return typeof text === 'string' ? [text] : []
    })
    .join('')
}

export function extractProviderResponseText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const value = payload as Record<string, unknown>
  if (typeof value.output_text === 'string') return value.output_text

  const choices = value.choices
  if (Array.isArray(choices)) {
    const first = choices[0] as { message?: { content?: unknown }; text?: unknown } | undefined
    const content = textParts(first?.message?.content)
    if (content) return content
    if (typeof first?.text === 'string') return first.text
  }

  const output = value.output
  if (Array.isArray(output)) {
    const texts = output.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const content = textParts((item as { content?: unknown }).content)
      return content ? [content] : []
    })
    return texts.join('\n') || null
  }
  return null
}

export function extractProviderStreamDelta(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const value = payload as Record<string, unknown>

  if (value.type === 'response.output_text.delta' && typeof value.delta === 'string') {
    return value.delta
  }

  const choices = value.choices
  if (!Array.isArray(choices)) return ''
  const first = choices[0] as {
    delta?: { content?: unknown }
    text?: unknown
  } | undefined
  const content = textParts(first?.delta?.content)
  if (content) return content
  return typeof first?.text === 'string' ? first.text : ''
}

function streamLines(response: Response): AsyncGenerator<string> {
  const body = response.body
  if (!body) throw new Error('AI 服务没有返回响应内容')

  return (async function* () {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        let newline = buffer.indexOf('\n')
        while (newline >= 0) {
          yield buffer.slice(0, newline).replace(/\r$/, '')
          buffer = buffer.slice(newline + 1)
          newline = buffer.indexOf('\n')
        }
        if (done) break
      }
      if (buffer) yield buffer.replace(/\r$/, '')
    } finally {
      reader.releaseLock()
    }
  })()
}

export async function* readProviderText(response: Response): AsyncGenerator<string> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('text/event-stream')) {
    const payload = await response.json() as unknown
    const answer = extractProviderResponseText(payload)
    if (answer) yield answer
    return
  }

  for await (const rawLine of streamLines(response)) {
    const line = rawLine.trim()
    if (!line || line.startsWith(':') || line.startsWith('event:')) continue
    const data = line.startsWith('data:') ? line.slice(5).trimStart() : line
    if (!data || data === '[DONE]') continue
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      continue
    }
    const delta = extractProviderStreamDelta(payload)
    if (delta) yield delta
  }
}
