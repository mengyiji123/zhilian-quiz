export type UserRole = 'admin' | 'user'
export type QuestionType = 'single' | 'multiple' | 'judge'
export type PracticeMode = 'subject' | 'chapter' | 'random' | 'wrong' | 'favorite'

export interface User {
  id: number
  username: string
  displayName: string
  role: UserRole
}

export interface Chapter {
  id: number
  number: number
  title: string
  questionCount: number
}

export interface ChapterPracticeProgress {
  chapterId: number
  sessionId: string
  answered: number
  total: number
  currentIndex: number
  completedAt: string | null
}

export interface KnowledgePoint {
  id: number
  chapterId: number | null
  name: string
  questionCount: number
}

export interface Subject {
  id: number
  slug: string
  name: string
  description: string | null
  questionCount: number
  chapters: Chapter[]
  knowledgePoints: KnowledgePoint[]
}

export interface QuestionOption {
  label: string
  content: string
}

export interface PracticeQuestion {
  id: number
  externalKey: string
  number: number
  type: QuestionType
  stem: string
  chapterId: number
  chapterNumber: number
  chapterTitle: string
  subjectName: string
  isFavorite: boolean
  options: QuestionOption[]
}

export interface AnswerResult {
  selectedLabels: string[]
  correctLabels: string[]
  isCorrect: boolean | null
  explanation: string
  confidence: 'high' | 'medium' | 'low'
  isDefective: boolean
}

export interface AnswerSheetItem {
  index: number
  questionId: number
  answered: boolean
  isCorrect: boolean | null
}

export interface PracticeQuestionResponse {
  question: PracticeQuestion
  position: { index: number; total: number }
  result: AnswerResult | null
}
