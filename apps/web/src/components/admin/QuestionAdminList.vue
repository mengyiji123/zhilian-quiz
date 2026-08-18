<script setup lang="ts">
import { computed } from 'vue'

import type { AdminQuestionListItem, QuestionType } from '@/types'

const props = defineProps<{
  items: readonly AdminQuestionListItem[]
  selectedId: number | null
  loading: boolean
  page: number
  pageSize: number
  total: number
}>()

const emit = defineEmits<{
  select: [questionId: number]
  page: [page: number]
}>()

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const rangeLabel = computed(() => {
  if (!props.total) return '0 / 0'
  const start = (props.page - 1) * props.pageSize + 1
  const end = Math.min(props.page * props.pageSize, props.total)
  return `${start}–${end} / ${props.total}`
})

function typeLabel(type: QuestionType): string {
  return ({ single: '单选', multiple: '多选', judge: '判断' })[type]
}
</script>

<template>
  <section class="question-list panel" aria-label="题目列表">
    <header class="list-heading">
      <div>
        <strong>题目列表</strong>
        <span>默认将待处理报错排在最前</span>
      </div>
      <span class="range">{{ rangeLabel }}</span>
    </header>
    <div v-if="loading && !items.length" class="list-loading"><span class="mini-spinner" /></div>
    <div v-else-if="!items.length" class="list-empty">
      <strong>没有匹配的题目</strong>
      <span>试试减少筛选条件或更换关键词。</span>
    </div>
    <div v-else class="rows" :class="{ refreshing: loading }">
      <button
        v-for="item in items"
        :key="item.id"
        class="question-row"
        :class="{ selected: item.id === selectedId, reported: item.openReportCount > 0 }"
        type="button"
        @click="emit('select', item.id)"
      >
        <span class="row-topline">
          <span class="question-location">第 {{ item.chapterNumber }} 章 · {{ item.number }} 题</span>
          <span v-if="item.openReportCount" class="report-badge">{{ item.openReportCount }} 条待处理</span>
        </span>
        <strong class="question-stem">{{ item.stem }}</strong>
        <span class="row-meta">
          <span>{{ typeLabel(item.type) }}</span>
          <span>答案 {{ item.correctLabels.join('、') || '未定' }}</span>
          <span v-if="item.isDefective" class="defective">缺陷题</span>
        </span>
      </button>
    </div>
    <footer class="pagination">
      <button class="page-button" type="button" :disabled="page <= 1 || loading" aria-label="上一页" @click="emit('page', page - 1)">‹</button>
      <span>第 {{ page }} / {{ pageCount }} 页</span>
      <button class="page-button" type="button" :disabled="page >= pageCount || loading" aria-label="下一页" @click="emit('page', page + 1)">›</button>
    </footer>
  </section>
</template>

<style scoped>
.question-list {
  height: clamp(420px, calc(100vh - 28px), 760px);
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
}
.list-heading { min-height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 15px; border-bottom: 1px solid var(--line); }
.list-heading div { display: grid; gap: 2px; }
.list-heading strong { color: var(--navy); font-size: 0.94rem; }
.list-heading span { color: var(--muted); font-size: 0.73rem; }
.range { white-space: nowrap; }
.rows {
  min-height: 0;
  align-content: start;
  display: grid;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  transition: opacity 120ms ease;
  -webkit-overflow-scrolling: touch;
}
.rows.refreshing { opacity: 0.58; pointer-events: none; }
.question-row { min-width: 0; display: grid; gap: 8px; padding: 14px 15px 15px; border: 0; border-bottom: 1px solid #e8eef1; background: white; color: inherit; text-align: left; cursor: pointer; transition: background-color 120ms ease, box-shadow 120ms ease; }
.question-row:hover { background: #f8fbfc; }
.question-row.selected { background: var(--blue-soft); box-shadow: inset 3px 0 0 var(--blue); }
.question-row.reported:not(.selected) { box-shadow: inset 3px 0 0 #dfb356; }
.row-topline, .row-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.question-location { color: var(--blue); font-size: 0.74rem; font-weight: 700; }
.report-badge { margin-left: auto; padding: 3px 7px; border-radius: 99px; background: var(--gold-soft); color: #8a5a0b; font-size: 0.7rem; font-weight: 700; }
.question-stem { display: -webkit-box; overflow: hidden; color: #2d4556; font-size: 0.87rem; font-weight: 620; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.row-meta { color: var(--muted); font-size: 0.7rem; }
.row-meta > span + span::before { margin-right: 7px; color: #bdc9d0; content: '·'; }
.row-meta .defective { color: #9a650c; }
.list-loading, .list-empty { min-height: 360px; display: grid; place-content: center; justify-items: center; gap: 8px; color: var(--muted); text-align: center; }
.list-empty strong { color: var(--navy); }
.list-empty span { font-size: 0.8rem; }
.mini-spinner { width: 28px; height: 28px; border: 3px solid var(--line); border-top-color: var(--blue); border-radius: 50%; animation: spin 700ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.pagination { min-height: 54px; display: flex; align-items: center; justify-content: center; gap: 12px; padding: 8px 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.76rem; }
.page-button { width: 36px; height: 36px; border: 1px solid var(--line); border-radius: var(--radius-small); background: white; color: var(--navy); cursor: pointer; font-size: 1.2rem; }
.page-button:disabled { cursor: not-allowed; opacity: 0.4; }
@media (max-width: 900px) { .question-list { height: clamp(320px, 58vh, 620px); } }
</style>
