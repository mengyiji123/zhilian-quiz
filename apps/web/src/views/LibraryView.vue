<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

import { api } from '@/lib/api'
import type { QuestionType } from '@/types'

interface LibraryItem {
  id: number
  number: number
  type: QuestionType
  stem: string
  chapterNumber: number
  chapterTitle: string
  subjectName: string
  wrongCount: number | null
  correctStreak: number | null
  savedAt: string
}

const props = defineProps<{ kind: 'wrong' | 'favorites' }>()
const items = shallowRef<LibraryItem[]>([])
const loading = shallowRef(true)
const error = shallowRef('')
const title = computed(() => props.kind === 'wrong' ? '错题本' : '我的收藏')
const subtitle = computed(() => props.kind === 'wrong'
  ? '错题会持续保留，连续答对两次后自动标记为已掌握。'
  : '把值得反复看的题目集中到一起。')
const typeLabel = (type: QuestionType) => ({ single: '单选', multiple: '多选', judge: '判断' })[type]

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const payload = await api<{ items: LibraryItem[] }>(`/library/${props.kind}`)
    items.value = payload.items
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '加载失败'
  } finally {
    loading.value = false
  }
}

watch(() => props.kind, load, { immediate: true })
</script>

<template>
  <div class="page library-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">{{ title }}</h1>
        <p class="page-subtitle">{{ subtitle }}</p>
      </div>
      <RouterLink class="button" :to="`/practice/setup?mode=${kind === 'wrong' ? 'wrong' : 'favorite'}`">
        开始{{ kind === 'wrong' ? '重练' : '收藏练习' }}
      </RouterLink>
    </header>

    <div v-if="loading" class="loading-block"><span class="spinner" /></div>
    <p v-else-if="error" class="error-message">{{ error }}</p>
    <section v-else-if="items.length" class="library-list panel">
      <article v-for="item in items" :key="item.id" class="library-item">
        <div class="item-index">{{ item.chapterNumber }}-{{ item.number }}</div>
        <div class="item-content">
          <div class="item-meta">
            <span class="tag">{{ typeLabel(item.type) }}</span>
            <span>{{ item.subjectName }} · {{ item.chapterTitle }}</span>
          </div>
          <p>{{ item.stem }}</p>
          <small v-if="kind === 'wrong'">
            累计答错 {{ item.wrongCount }} 次 · 已连续答对 {{ item.correctStreak }} 次
          </small>
        </div>
      </article>
    </section>
    <section v-else class="panel empty-state">
      <h2>{{ kind === 'wrong' ? '暂时没有错题' : '暂时没有收藏' }}</h2>
      <p>{{ kind === 'wrong' ? '继续练习，错题会自动收录到这里。' : '刷题时点击星标即可收藏。' }}</p>
      <RouterLink class="button" to="/practice/setup">去刷题</RouterLink>
    </section>
  </div>
</template>

<style scoped>
.library-list { display: grid; overflow: hidden; }
.library-item { display: grid; grid-template-columns: 66px 1fr; gap: 18px; padding: 20px 22px; }
.library-item + .library-item { border-top: 1px solid var(--line); }
.item-index { width: 58px; height: 42px; display: grid; place-items: center; border-radius: var(--radius-small); background: #eef3f6; color: var(--navy); font-size: 0.86rem; font-weight: 750; font-variant-numeric: tabular-nums; }
.item-meta { display: flex; align-items: center; gap: 9px; margin-bottom: 8px; color: var(--muted); font-size: 0.8rem; }
.item-content p { margin-bottom: 8px; color: #2d4353; line-height: 1.7; }
.item-content small { color: #9b6312; }
@media (max-width: 560px) { .library-item { grid-template-columns: 1fr; gap: 11px; padding: 17px; } .item-index { width: auto; height: 32px; justify-self: start; padding: 0 10px; } }
</style>
