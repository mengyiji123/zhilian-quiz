import { computed, readonly, ref, shallowRef } from 'vue'

import { api } from '@/lib/api'
import type { AnswerResult, AnswerSheetItem, PracticeMode, PracticeQuestionResponse } from '@/types'

interface SessionPayload {
  session: {
    subjectId: number
    mode: PracticeMode
    currentIndex: number
    total: number
    completedAt: string | null
    answerSheet: AnswerSheetItem[]
  }
}

export function usePracticeSession(options: { sessionId: string }) {
  const data = shallowRef<PracticeQuestionResponse | null>(null)
  const selected = ref<string[]>([])
  const loading = shallowRef(true)
  const submitting = shallowRef(false)
  const error = shallowRef('')
  const index = shallowRef(0)
  const total = shallowRef(0)
  const subjectId = shallowRef(0)
  const mode = shallowRef<PracticeMode>('subject')
  const completed = shallowRef(false)
  const answerSheet = ref<AnswerSheetItem[]>([])

  const question = computed(() => data.value?.question ?? null)
  const result = computed(() => data.value?.result ?? null)
  const canPrevious = computed(() => Boolean(answerSheet.value[index.value - 1]?.answered))
  const canNext = computed(() => index.value + 1 < total.value)

  function markAnswered(answerIndex: number, isCorrect: boolean | null): void {
    answerSheet.value = answerSheet.value.map((item) => item.index === answerIndex
      ? { ...item, answered: true, isCorrect }
      : item)
  }

  async function loadQuestion(nextIndex = index.value): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const payload = await api<PracticeQuestionResponse>(
        `/practice/sessions/${options.sessionId}/questions/${nextIndex}`,
      )
      data.value = payload
      index.value = payload.position.index
      total.value = payload.position.total
      selected.value = payload.result?.selectedLabels ?? []
      if (payload.result) markAnswered(payload.position.index, payload.result.isCorrect)
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '加载题目失败'
    } finally {
      loading.value = false
    }
  }

  async function initialize(): Promise<void> {
    loading.value = true
    try {
      const payload = await api<SessionPayload>(`/practice/sessions/${options.sessionId}`)
      subjectId.value = payload.session.subjectId
      mode.value = payload.session.mode
      completed.value = Boolean(payload.session.completedAt)
      index.value = Math.min(payload.session.currentIndex, Math.max(payload.session.total - 1, 0))
      total.value = payload.session.total
      answerSheet.value = payload.session.answerSheet
      await loadQuestion(index.value)
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '练习记录加载失败'
      loading.value = false
    }
  }

  function setSelected(labels: string[]): void {
    if (!result.value) selected.value = labels
  }

  async function submit(): Promise<void> {
    if (!question.value || !selected.value.length || submitting.value) return
    submitting.value = true
    error.value = ''
    try {
      const payload = await api<{
        result: AnswerResult
        progress: { answered: number; total: number; completed: boolean }
      }>(
        `/practice/sessions/${options.sessionId}/questions/${question.value.id}/answer`,
        { method: 'POST', body: JSON.stringify({ selectedLabels: selected.value }) },
      )
      if (data.value) data.value = { ...data.value, result: payload.result }
      markAnswered(index.value, payload.result.isCorrect)
      completed.value = payload.progress.completed
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '提交答案失败'
    } finally {
      submitting.value = false
    }
  }

  async function goTo(nextIndex: number): Promise<void> {
    if (nextIndex < 0 || nextIndex >= total.value || loading.value) return
    await loadQuestion(nextIndex)
  }

  async function goToAnswered(nextIndex: number): Promise<void> {
    if (!answerSheet.value[nextIndex]?.answered) return
    await goTo(nextIndex)
  }

  async function toggleFavorite(): Promise<void> {
    if (!question.value || !data.value) return
    const favorite = !question.value.isFavorite
    await api(`/practice/questions/${question.value.id}/favorite`, {
      method: 'PUT',
      body: JSON.stringify({ favorite }),
    })
    data.value = { ...data.value, question: { ...data.value.question, isFavorite: favorite } }
  }

  return {
    question,
    result,
    selected: readonly(selected),
    loading: readonly(loading),
    submitting: readonly(submitting),
    error: readonly(error),
    index: readonly(index),
    total: readonly(total),
    subjectId: readonly(subjectId),
    mode: readonly(mode),
    completed: readonly(completed),
    answerSheet: readonly(answerSheet),
    canPrevious,
    canNext,
    initialize,
    setSelected,
    submit,
    goTo,
    goToAnswered,
    toggleFavorite,
  }
}
