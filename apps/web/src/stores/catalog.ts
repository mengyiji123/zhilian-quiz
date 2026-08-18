import { defineStore } from 'pinia'
import { readonly, shallowRef } from 'vue'

import { api } from '@/lib/api'
import type { Subject } from '@/types'

export const useCatalogStore = defineStore('catalog', () => {
  const subjects = shallowRef<Subject[]>([])
  let loadedAt = 0
  let pending: Promise<Subject[]> | null = null
  const ttlMs = 5 * 60_000

  async function load(force = false): Promise<Subject[]> {
    if (!force && subjects.value.length && Date.now() - loadedAt < ttlMs) return subjects.value
    if (!force && pending) return pending
    pending = api<{ subjects: Subject[] }>('/catalog/subjects')
      .then((payload) => {
        subjects.value = payload.subjects
        loadedAt = Date.now()
        return payload.subjects
      })
      .finally(() => { pending = null })
    return pending
  }

  function invalidate(): void {
    loadedAt = 0
  }

  return { subjects: readonly(subjects), load, invalidate }
})
