export {}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number
        username: string
        displayName: string
        role: 'admin' | 'user'
      }
      sessionTokenHash?: string
    }
  }
}
