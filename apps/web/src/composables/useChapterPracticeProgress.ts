import { readonly, shallowRef } from 'vue'

import { api } from '@/lib/api'
import type { ChapterPracticeProgress } from '@/types'

export function useChapterPracticeProgress() {
  const byChapter = shallowRef<Record<number, ChapterPracticeProgress>>({})
  const loading = shallowRef(false)
  const error = shallowRef('')
  let requestId = 0

  async function load(subjectId: number): Promise<void> {
    const activeRequest = ++requestId
    if (!subjectId) {
      byChapter.value = {}
      return
    }

    loading.value = true
    error.value = ''
    try {
      const payload = await api<{ chapters: ChapterPracticeProgress[] }>(
        `/practice/chapter-progress/${subjectId}`,
      )
      if (activeRequest !== requestId) return
      byChapter.value = Object.fromEntries(
        payload.chapters.map((item) => [item.chapterId, item]),
      )
    } catch (caught) {
      if (activeRequest !== requestId) return
      byChapter.value = {}
      error.value = caught instanceof Error ? caught.message : '章节进度加载失败'
    } finally {
      if (activeRequest === requestId) loading.value = false
    }
  }

  return {
    byChapter: readonly(byChapter),
    loading: readonly(loading),
    error: readonly(error),
    load,
  }
}
