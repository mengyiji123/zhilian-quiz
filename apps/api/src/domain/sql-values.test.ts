import { describe, expect, it } from 'vitest'

import { nullableMessage, paginationClause } from './sql-values.js'

describe('SQL value compatibility helpers', () => {
  it('renders validated pagination values as integer literals', () => {
    expect(paginationClause(20, 0)).toBe('LIMIT 20 OFFSET 0')
    expect(paginationClause(50, 100)).toBe('LIMIT 50 OFFSET 100')
  })

  it('rejects pagination values that are unsafe to interpolate', () => {
    expect(() => paginationClause(20.5, 0)).toThrow(RangeError)
    expect(() => paginationClause(20, -1)).toThrow(RangeError)
  })

  it('converts an empty report message to null without changing content', () => {
    expect(nullableMessage('')).toBeNull()
    expect(nullableMessage('选项 B 有误')).toBe('选项 B 有误')
  })
})
