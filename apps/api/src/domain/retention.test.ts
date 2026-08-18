import { describe, expect, it } from 'vitest'

import { retentionCutoff } from './retention.js'

describe('retentionCutoff', () => {
  it('calculates the UTC cutoff without changing the input', () => {
    const now = new Date('2026-08-18T08:00:00.000Z')
    expect(retentionCutoff(180, now).toISOString()).toBe('2026-02-19T08:00:00.000Z')
    expect(now.toISOString()).toBe('2026-08-18T08:00:00.000Z')
  })
})
