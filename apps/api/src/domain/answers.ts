export function normalizeLabels(labels: string[]): string[] {
  return [...new Set(labels.map((label) => label.trim().toUpperCase()).filter(Boolean))].sort()
}

export function answersMatch(selected: string[], correct: string[]): boolean {
  const normalizedSelected = normalizeLabels(selected)
  const normalizedCorrect = normalizeLabels(correct)
  return (
    normalizedSelected.length === normalizedCorrect.length
    && normalizedSelected.every((label, index) => label === normalizedCorrect[index])
  )
}
