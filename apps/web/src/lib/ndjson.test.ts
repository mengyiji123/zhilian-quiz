import { describe, expect, it } from 'vitest'

import { readNdjson } from './ndjson'

describe('readNdjson', () => {
  it('reads multiple events and a final line without newline', async () => {
    const stream = new Response('{"type":"delta","content":"你"}\n{"type":"done"}').body
    if (!stream) throw new Error('测试流创建失败')
    const events: unknown[] = []
    for await (const event of readNdjson(stream)) events.push(event)

    expect(events).toEqual([
      { type: 'delta', content: '你' },
      { type: 'done' },
    ])
  })
})
