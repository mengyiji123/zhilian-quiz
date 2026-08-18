export function paginationClause(pageSize: number, offset: number): string {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new RangeError('pageSize must be a positive safe integer')
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError('offset must be a non-negative safe integer')
  }
  return `LIMIT ${pageSize} OFFSET ${offset}`
}

export function nullableMessage(value: string): string | null {
  return value === '' ? null : value
}
