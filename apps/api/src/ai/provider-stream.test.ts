import { describe, expect, it } from 'vitest'

import {
  extractProviderResponseText,
  readProviderText,
} from './provider-stream.js'

async function collect(response: Response): Promise<string> {
  let value = ''
  for await (const delta of readProviderText(response)) value += delta
  return value
}

describe('provider stream', () => {
  it('reads chat-completions SSE split into deltas', async () => {
    const response = new Response([
      'data: {"choices":[{"delta":{"content":"你"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"好"}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n'), { headers: { 'Content-Type': 'text/event-stream' } })

    await expect(collect(response)).resolves.toBe('你好')
  })

  it('reads Responses API text events', async () => {
    const response = new Response([
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":"逐"}',
      '',
      'data: {"type":"response.output_text.delta","delta":"字"}',
      '',
    ].join('\n'), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } })

    await expect(collect(response)).resolves.toBe('逐字')
  })

  it('keeps compatibility with a non-stream JSON response', async () => {
    const response = Response.json({ choices: [{ message: { content: '完整回答' } }] })
    await expect(collect(response)).resolves.toBe('完整回答')
  })

  it('extracts array-based text content', () => {
    expect(extractProviderResponseText({
      choices: [{ message: { content: [{ type: 'text', text: '数组内容' }] } }],
    })).toBe('数组内容')
  })
})
