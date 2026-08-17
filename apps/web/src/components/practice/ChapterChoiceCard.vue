<script setup lang="ts">
import { computed } from 'vue'

import type { Chapter, ChapterPracticeProgress } from '@/types'

const props = defineProps<{
  chapter: Chapter
  selected: boolean
  showProgress: boolean
  progress: ChapterPracticeProgress | undefined
}>()

const emit = defineEmits<{ select: [chapterId: number] }>()

const progressPercent = computed(() => {
  if (!props.progress?.total) return 0
  return Math.min(Math.round((props.progress.answered / props.progress.total) * 100), 100)
})

const progressLabel = computed(() => {
  if (!props.progress) return '尚未开始'
  if (props.progress.completedAt) return '已完成 · 可重新刷题'
  const nextNumber = Math.min(props.progress.currentIndex + 1, props.progress.total)
  if (props.progress.answered > 0) {
    return `已答 ${props.progress.answered}/${props.progress.total} · 上次到第 ${nextNumber} 题`
  }
  return `上次到第 ${nextNumber} 题`
})
</script>

<template>
  <button
    class="chapter-card"
    :class="{ selected, completed: showProgress && Boolean(progress?.completedAt) }"
    type="button"
    :aria-pressed="selected"
    @click="emit('select', chapter.id)"
  >
    <span class="chapter-number">第 {{ chapter.number }} 章</span>
    <strong class="chapter-title">{{ chapter.title }}</strong>
    <small class="chapter-count">{{ chapter.questionCount }} 题</small>
    <template v-if="showProgress">
      <span class="chapter-progress-label">{{ progressLabel }}</span>
      <span class="chapter-progress-track" aria-hidden="true">
        <span class="chapter-progress-value" :style="{ width: `${progressPercent}%` }" />
      </span>
    </template>
  </button>
</template>

<style scoped>
.chapter-card { position: relative; min-height: 86px; display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; padding: 14px; border: 1px solid var(--line); border-radius: var(--radius-control); background: white; color: var(--ink); text-align: left; cursor: pointer; transition: transform 120ms ease, border-color 120ms ease, background-color 120ms ease; }
.chapter-card:hover { border-color: var(--line-strong); background: var(--panel-subtle); }
.chapter-card:active { transform: translateY(1px); }
.chapter-number { grid-column: 1 / -1; color: var(--muted); font-size: 0.76rem; }
.chapter-title { font-size: 0.88rem; }
.chapter-count { align-self: center; color: var(--muted); }
.chapter-card.selected { border-color: var(--blue); background: #f0f7fa; box-shadow: inset 3px 0 0 var(--blue); }
.chapter-card.completed { border-color: #a7ccbf; }
.chapter-progress-label { grid-column: 1 / -1; margin-top: 5px; color: #547080; font-size: 0.73rem; }
.chapter-card.completed .chapter-progress-label { color: #2e7964; font-weight: 650; }
.chapter-progress-track { grid-column: 1 / -1; height: 5px; overflow: hidden; border-radius: 3px; background: #e5edf1; }
.chapter-progress-value { display: block; height: 100%; border-radius: inherit; background: var(--blue); transition: width 180ms ease; }
.chapter-card.completed .chapter-progress-value { background: var(--green); }
</style>
