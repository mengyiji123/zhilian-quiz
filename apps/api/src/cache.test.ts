import { describe, expect, it, vi } from 'vitest'

import { TtlCache } from './cache.js'

describe('TtlCache', () => {
  it('reuses a value until it expires', () => {
    vi.useFakeTimers()
    const cache = new TtlCache<string, number>(1_000)
    cache.set('key', 42)
    expect(cache.get('key')).toBe(42)
    vi.advanceTimersByTime(1_001)
    expect(cache.get('key')).toBeUndefined()
    vi.useRealTimers()
  })

  it('deduplicates concurrent loads', async () => {
    const cache = new TtlCache<string, number>(1_000)
    let resolve!: (value: number) => void
    const loader = vi.fn(() => new Promise<number>((done) => { resolve = done }))
    const first = cache.getOrLoad('key', loader)
    const second = cache.getOrLoad('key', loader)
    resolve(7)
    await expect(Promise.all([first, second])).resolves.toEqual([7, 7])
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('evicts old entries when bounded', () => {
    const cache = new TtlCache<string, number>(1_000, 2)
    cache.set('first', 1)
    cache.set('second', 2)
    cache.set('third', 3)
    expect(cache.get('first')).toBeUndefined()
    expect(cache.get('second')).toBe(2)
    expect(cache.get('third')).toBe(3)
  })

  it('invalidates matching values', () => {
    const cache = new TtlCache<string, { userId: number }>(1_000)
    cache.set('one', { userId: 1 })
    cache.set('two', { userId: 2 })
    cache.deleteWhere((value) => value.userId === 1)
    expect(cache.get('one')).toBeUndefined()
    expect(cache.get('two')).toEqual({ userId: 2 })
  })
})
