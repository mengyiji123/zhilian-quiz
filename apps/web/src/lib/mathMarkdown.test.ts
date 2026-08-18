import { marked } from 'marked'
import { describe, expect, it } from 'vitest'

import { protectMathInMarkdown } from './mathMarkdown'

describe('protectMathInMarkdown', () => {
  it('preserves bracketed and inline formulas through marked parsing', () => {
    const source = String.raw`块公式：

\[
K \text{ 完全函数决定 } A
\]

行内公式：\(K \to A\)。`
    const protectedMath = protectMathInMarkdown(source)
    const html = protectedMath.restore(marked.parse(protectedMath.markdown) as string)

    expect(html).toContain(String.raw`K \text{ 完全函数决定 } A`)
    expect(html).toContain(String.raw`\[`)
    expect(html).toContain(String.raw`\]`)
    expect(html).toContain(String.raw`\(K \to A\)`)
  })

  it('does not treat formulas inside code as renderable math', () => {
    const source = [
      '代码：`\\[K \\to A\\]`',
      '',
      '```text',
      '\\[K \\to A\\]',
      '```',
    ].join('\n')
    const protectedMath = protectMathInMarkdown(source)

    expect(protectedMath.markdown).toBe(source)
  })
})
