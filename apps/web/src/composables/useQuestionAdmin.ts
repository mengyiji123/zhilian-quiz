import { onScopeDispose, reactive, shallowReadonly, shallowRef, watch } from 'vue'

import { api } from '@/lib/api'
import { useCatalogStore } from '@/stores/catalog'
import type {
  AdminQuestionDetail,
  AdminQuestionFilters,
  AdminQuestionListItem,
  AdminQuestionUpdateInput,
  Subject,
} from '@/types'

interface QuestionListPayload {
  items: AdminQuestionListItem[]
  pagination: { page: number; pageSize: number; total: number }
}

const defaultFilters: AdminQuestionFilters = {
  q: '',
  subjectId: 0,
  chapterId: 0,
  type: '',
  reportStatus: 'all',
  sort: 'reports_desc',
}

export function useQuestionAdmin() {
  const catalog = useCatalogStore()
  const subjects = shallowRef<Subject[]>([])
  const items = shallowRef<AdminQuestionListItem[]>([])
  const detail = shallowRef<AdminQuestionDetail | null>(null)
  const filters = reactive<AdminQuestionFilters>({ ...defaultFilters })
  const page = shallowRef(1)
  const pageSize = shallowRef(20)
  const total = shallowRef(0)
  const selectedId = shallowRef<number | null>(null)
  const loading = shallowRef(true)
  const detailLoading = shallowRef(false)
  const saving = shallowRef(false)
  const error = shallowRef('')
  const notice = shallowRef('')
  let filterTimer: ReturnType<typeof setTimeout> | undefined
  let listRequest = 0
  let detailRequest = 0

  function queryString(): string {
    const query = new URLSearchParams({
      reportStatus: filters.reportStatus,
      sort: filters.sort,
      page: String(page.value),
      pageSize: String(pageSize.value),
    })
    if (filters.q) query.set('q', filters.q)
    if (filters.subjectId) query.set('subjectId', String(filters.subjectId))
    if (filters.chapterId) query.set('chapterId', String(filters.chapterId))
    if (filters.type) query.set('type', filters.type)
    return query.toString()
  }

  async function loadDetail(questionId: number): Promise<void> {
    const requestId = ++detailRequest
    detailLoading.value = true
    error.value = ''
    try {
      const payload = await api<{ question: AdminQuestionDetail }>(`/admin/questions/${questionId}`)
      if (requestId === detailRequest) detail.value = payload.question
    } catch (caught) {
      if (requestId === detailRequest) {
        error.value = caught instanceof Error ? caught.message : '题目详情加载失败'
        detail.value = null
      }
    } finally {
      if (requestId === detailRequest) detailLoading.value = false
    }
  }

  async function selectQuestion(questionId: number): Promise<void> {
    if (selectedId.value === questionId && detail.value?.id === questionId) return
    selectedId.value = questionId
    await loadDetail(questionId)
  }

  async function loadList(): Promise<void> {
    const requestId = ++listRequest
    loading.value = true
    error.value = ''
    try {
      const payload = await api<QuestionListPayload>(`/admin/questions?${queryString()}`)
      if (requestId !== listRequest) return
      items.value = payload.items
      total.value = payload.pagination.total
      const currentStillVisible = selectedId.value !== null
        && payload.items.some((item) => item.id === selectedId.value)
      const nextId = currentStillVisible ? selectedId.value : (payload.items[0]?.id ?? null)
      if (nextId === null) {
        selectedId.value = null
        detail.value = null
      } else if (nextId !== selectedId.value || detail.value?.id !== nextId) {
        selectedId.value = nextId
        await loadDetail(nextId)
      }
    } catch (caught) {
      if (requestId === listRequest) {
        error.value = caught instanceof Error ? caught.message : '题目列表加载失败'
      }
    } finally {
      if (requestId === listRequest) loading.value = false
    }
  }

  async function initialize(): Promise<void> {
    loading.value = true
    try {
      subjects.value = await catalog.load()
      await loadList()
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '题目管理加载失败'
      loading.value = false
    }
  }

  function updateFilters(change: Partial<AdminQuestionFilters>): void {
    page.value = 1
    Object.assign(filters, change)
    if (change.subjectId !== undefined && change.chapterId === undefined) filters.chapterId = 0
  }

  function setPage(nextPage: number): void {
    const pageCount = Math.max(1, Math.ceil(total.value / pageSize.value))
    page.value = Math.min(Math.max(nextPage, 1), pageCount)
  }

  async function saveQuestion(input: AdminQuestionUpdateInput): Promise<void> {
    if (!selectedId.value || saving.value) return
    saving.value = true
    error.value = ''
    notice.value = ''
    try {
      await api(`/admin/questions/${selectedId.value}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      })
      const updatedAt = new Date().toISOString()
      const correctLabels = input.options.filter((option) => option.isCorrect).map((option) => option.label)
      items.value = items.value.map((item) => item.id === selectedId.value
        ? { ...item, type: input.type, stem: input.stem, confidence: input.confidence,
            isDefective: input.isDefective, correctLabels, updatedAt }
        : item)
      if (detail.value?.id === selectedId.value) {
        const pointNames = new Map(subjects.value.flatMap((subject) => (
          subject.knowledgePoints.map((point) => [point.id, point.name] as const)
        )))
        detail.value = {
          ...detail.value,
          type: input.type,
          stem: input.stem,
          explanation: input.explanation,
          confidence: input.confidence,
          isDefective: input.isDefective,
          options: input.options,
          knowledgePoints: input.knowledgePointIds.map((id) => ({ id, name: pointNames.get(id) ?? `知识点 ${id}` })),
          updatedAt,
        }
      }
      catalog.invalidate()
      if (filters.q || filters.type || filters.sort === 'updated_desc' || filters.sort === 'type_asc') {
        await loadList()
      }
      notice.value = '题目、选项和答案已保存'
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '保存题目失败'
    } finally {
      saving.value = false
    }
  }

  async function resolveReports(): Promise<void> {
    if (!selectedId.value || saving.value) return
    saving.value = true
    error.value = ''
    notice.value = ''
    try {
      const payload = await api<{ resolved: number }>(`/admin/questions/${selectedId.value}/reports/resolve`, {
        method: 'POST',
      })
      const resolvedAt = new Date().toISOString()
      if (payload.resolved && detail.value?.id === selectedId.value) {
        detail.value = {
          ...detail.value,
          openReportCount: 0,
          reports: detail.value.reports.map((report) => report.status === 'open'
            ? { ...report, status: 'resolved', resolvedAt, updatedAt: resolvedAt }
            : report),
        }
        items.value = items.value.map((item) => item.id === selectedId.value
          ? { ...item, openReportCount: 0, lastReportedAt: null }
          : item)
      }
      if (filters.reportStatus !== 'all' || filters.sort === 'reports_desc') await loadList()
      notice.value = payload.resolved ? `已处理 ${payload.resolved} 条报错` : '这道题没有待处理报错'
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '处理报错失败'
    } finally {
      saving.value = false
    }
  }

  watch(
    [
      () => filters.q,
      () => filters.subjectId,
      () => filters.chapterId,
      () => filters.type,
      () => filters.reportStatus,
      () => filters.sort,
      page,
    ],
    (current, previous) => {
      if (filterTimer) clearTimeout(filterTimer)
      const searchChanged = current[0] !== previous[0]
      filterTimer = setTimeout(() => void loadList(), searchChanged ? 280 : 0)
    },
  )

  onScopeDispose(() => {
    if (filterTimer) clearTimeout(filterTimer)
  })

  return {
    subjects: shallowReadonly(subjects),
    items: shallowReadonly(items),
    detail: shallowReadonly(detail),
    filters,
    page: shallowReadonly(page),
    pageSize: shallowReadonly(pageSize),
    total: shallowReadonly(total),
    selectedId: shallowReadonly(selectedId),
    loading: shallowReadonly(loading),
    detailLoading: shallowReadonly(detailLoading),
    saving: shallowReadonly(saving),
    error: shallowReadonly(error),
    notice: shallowReadonly(notice),
    initialize,
    updateFilters,
    setPage,
    selectQuestion,
    saveQuestion,
    resolveReports,
  }
}
