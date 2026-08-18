export function retentionCutoff(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * 86_400_000)
}
