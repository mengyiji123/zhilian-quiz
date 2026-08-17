import { describe, expect, it } from 'vitest'

import { answersMatch, normalizeLabels } from './answers.js'

describe('answer comparison', () => {
  it('ignores order and duplicate labels', () => {
    expect(answersMatch(['C', 'A', 'A'], ['A', 'C'])).toBe(true)
  })

  it('requires an exact multiple-choice set', () => {
    expect(answersMatch(['A'], ['A', 'B'])).toBe(false)
  })

  it('normalizes whitespace and letter case', () => {
    expect(normalizeLabels([' b ', 'A'])).toEqual(['A', 'B'])
  })
})
