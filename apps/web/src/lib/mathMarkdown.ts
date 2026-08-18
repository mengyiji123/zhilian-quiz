interface ProtectedMathMarkdown {
  markdown: string
  restore: (html: string) => string
}

const codeOrMathPattern = /(`{3,}[^\n]*\n[\s\S]*?\n`{3,}|~{3,}[^\n]*\n[\s\S]*?\n~{3,}|`+[^`\n]*`+)|(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$(?:\\.|[^$\n])+\$)/g

function escapeHtmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function protectMathInMarkdown(source: string): ProtectedMathMarkdown {
  const formulas: string[] = []
  const markdown = source.replace(codeOrMathPattern, (match, code: string | undefined, math: string | undefined) => {
    if (code || !math) return match

    const index = formulas.push(math) - 1
    return `CODEXMATHPLACEHOLDER${index}END`
  })

  return {
    markdown,
    restore: (html) => formulas.reduce(
      (restored, formula, index) => restored.replaceAll(
        `CODEXMATHPLACEHOLDER${index}END`,
        escapeHtmlText(formula),
      ),
      html,
    ),
  }
}
