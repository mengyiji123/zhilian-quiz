<script setup lang="ts">
import { computed } from 'vue'

import type { AdminQuestionFilters, Subject } from '@/types'

const props = defineProps<{
  filters: AdminQuestionFilters
  subjects: readonly Subject[]
  total: number
}>()

const emit = defineEmits<{
  update: [change: Partial<AdminQuestionFilters>]
}>()

const selectedSubject = computed(() => props.subjects.find((subject) => subject.id === props.filters.subjectId))

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value
}

function updateSearch(event: Event): void {
  emit('update', { q: inputValue(event) })
}

function updateSubject(event: Event): void {
  emit('update', { subjectId: Number(inputValue(event)), chapterId: 0 })
}
</script>

<template>
  <section class="filter-bar panel" aria-label="题目筛选">
    <label class="search-field">
      <span class="search-icon" aria-hidden="true">⌕</span>
      <input
        class="search-input"
        type="search"
        :value="filters.q"
        placeholder="模糊搜索题干、选项、解析或题目编号"
        @input="updateSearch"
      />
      <span class="result-count">{{ total }} 题</span>
    </label>
    <div class="filter-controls">
      <label>
        <span>科目</span>
        <select class="select compact-select" :value="filters.subjectId" @change="updateSubject">
          <option :value="0">全部科目</option>
          <option v-for="subject in subjects" :key="subject.id" :value="subject.id">{{ subject.name }}</option>
        </select>
      </label>
      <label>
        <span>章节</span>
        <select
          class="select compact-select"
          :value="filters.chapterId"
          :disabled="!selectedSubject"
          @change="emit('update', { chapterId: Number(inputValue($event)) })"
        >
          <option :value="0">全部章节</option>
          <option v-for="chapter in selectedSubject?.chapters" :key="chapter.id" :value="chapter.id">
            {{ chapter.number }}. {{ chapter.title }}
          </option>
        </select>
      </label>
      <label>
        <span>题型</span>
        <select class="select compact-select" :value="filters.type" @change="emit('update', { type: inputValue($event) as AdminQuestionFilters['type'] })">
          <option value="">全部题型</option>
          <option value="single">单选题</option>
          <option value="multiple">多选题</option>
          <option value="judge">判断题</option>
        </select>
      </label>
      <label>
        <span>报错状态</span>
        <select class="select compact-select" :value="filters.reportStatus" @change="emit('update', { reportStatus: inputValue($event) as AdminQuestionFilters['reportStatus'] })">
          <option value="all">全部</option>
          <option value="reported">仅待处理</option>
          <option value="unreported">无待处理</option>
        </select>
      </label>
      <label>
        <span>排序</span>
        <select class="select compact-select" :value="filters.sort" @change="emit('update', { sort: inputValue($event) as AdminQuestionFilters['sort'] })">
          <option value="reports_desc">报错优先</option>
          <option value="updated_desc">最近修改</option>
          <option value="chapter_asc">章节顺序</option>
          <option value="question_no_asc">题号顺序</option>
          <option value="type_asc">题型顺序</option>
        </select>
      </label>
    </div>
  </section>
</template>

<style scoped>
.filter-bar { padding: 14px; box-shadow: 0 8px 24px rgba(26, 57, 78, 0.045); }
.search-field { min-height: 48px; display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: 7px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--radius-control); background: white; }
.search-field:focus-within { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(44, 111, 159, 0.1); }
.search-icon { color: var(--blue); font-size: 1.3rem; font-weight: 800; }
.search-input { min-width: 0; height: 44px; border: 0; outline: 0; background: transparent; color: var(--ink); }
.result-count { padding-left: 10px; border-left: 1px solid var(--line); color: var(--muted); font-size: 0.78rem; white-space: nowrap; }
.filter-controls { display: grid; grid-template-columns: 1.1fr 1.3fr repeat(3, minmax(120px, 0.8fr)); gap: 9px; margin-top: 10px; }
.filter-controls label { min-width: 0; display: grid; gap: 5px; }
.filter-controls label > span { color: var(--muted); font-size: 0.72rem; font-weight: 650; }
.compact-select { min-height: 40px; padding: 7px 9px; font-size: 0.84rem; }
@media (max-width: 1040px) { .filter-controls { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 680px) { .filter-controls { grid-template-columns: 1fr 1fr; } .filter-controls label:last-child { grid-column: 1 / -1; } .result-count { display: none; } }
</style>
