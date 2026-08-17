<script setup lang="ts">
import { computed } from 'vue'

import type { AnswerResult, PracticeQuestion } from '@/types'

const props = defineProps<{
  question: PracticeQuestion
  result: AnswerResult | null
}>()

const selected = defineModel<string[]>({ required: true })
const typeLabel = computed(() => ({ single: '单选题', multiple: '多选题', judge: '判断题' })[props.question.type])

function toggle(label: string): void {
  if (props.result) return
  if (props.question.type !== 'multiple') {
    selected.value = [label]
    return
  }
  selected.value = selected.value.includes(label)
    ? selected.value.filter((item) => item !== label)
    : [...selected.value, label]
}

function optionState(label: string): Record<string, boolean> {
  const correct = Boolean(props.result?.correctLabels.includes(label))
  const chosen = selected.value.includes(label)
  const missed = Boolean(props.result) && props.question.type === 'multiple' && correct && !chosen
  return {
    selected: chosen && !props.result,
    correct: Boolean(props.result) && correct && !missed,
    missed,
    wrong: Boolean(props.result) && chosen && !correct,
  }
}

function isMissed(label: string): boolean {
  const result = props.result
  if (!result) return false
  return props.question.type === 'multiple'
    && result.correctLabels.includes(label)
    && !selected.value.includes(label)
}
</script>

<template>
  <article class="question-card panel">
    <div class="question-meta">
      <span class="type-tag">{{ typeLabel }}</span>
      <span>第 {{ question.chapterNumber }} 章 · 第 {{ question.number }} 题</span>
    </div>
    <h1 class="question-stem">{{ question.stem }}</h1>
    <div class="options" role="group" :aria-label="`${typeLabel}选项`">
      <button
        v-for="option in question.options"
        :key="option.label"
        class="option"
        :class="optionState(option.label)"
        type="button"
        :disabled="Boolean(result)"
        :aria-pressed="selected.includes(option.label)"
        @click="toggle(option.label)"
      >
        <span class="option-label">{{ option.label }}</span>
        <span class="option-content">{{ option.content }}</span>
        <span v-if="isMissed(option.label)" class="option-mark missed-mark">漏选</span>
        <span v-else-if="result && result.correctLabels.includes(option.label)" class="option-mark">✓</span>
        <span v-else-if="result && selected.includes(option.label)" class="option-mark wrong-mark">×</span>
      </button>
    </div>
  </article>
</template>

<style scoped>
.question-card { padding: clamp(24px, 4vw, 38px); border-top: 3px solid var(--blue); }
.question-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; color: var(--muted); font-size: 0.86rem; }
.type-tag { min-height: 28px; display: inline-flex; align-items: center; padding: 3px 9px; border-radius: var(--radius-small); background: var(--blue-soft); color: #285f83; font-weight: 700; }
.question-stem { margin-bottom: 29px; color: #172d40; font-size: clamp(1.2rem, 2.1vw, 1.5rem); font-weight: 690; letter-spacing: -0.01em; line-height: 1.74; white-space: pre-wrap; }
.options { display: grid; gap: 12px; }
.option { width: 100%; min-height: 60px; display: grid; grid-template-columns: 38px 1fr auto; align-items: center; gap: 13px; padding: 12px 15px; border: 1px solid #d7e0e5; border-radius: 12px; background: white; color: var(--ink); text-align: left; cursor: pointer; transition: transform 120ms ease, border-color 120ms ease, background-color 120ms ease; }
.option:hover:not(:disabled) { border-color: #a8c2d2; background: #f7fafc; }
.option:active:not(:disabled) { transform: translateY(1px); }
.option:disabled { cursor: default; opacity: 1; }
.option-label { width: 36px; height: 36px; display: grid; place-items: center; border: 1px solid #cbd7de; border-radius: var(--radius-small); background: white; color: #405565; font-weight: 750; }
.option-content { line-height: 1.6; white-space: pre-wrap; }
.option.selected { border-color: var(--blue); background: var(--blue-soft); }
.option.selected .option-label { border-color: var(--blue); background: var(--blue); color: white; }
.option.correct { border-color: #7dbda9; background: var(--green-soft); }
.option.correct .option-label { border-color: var(--green); background: var(--green); color: white; }
.option.missed { border-color: #d7a72f; background: var(--gold-soft); box-shadow: inset 4px 0 0 #dca92c; }
.option.missed .option-label { border-color: #d3a027; background: #e8b93f; color: #4e3a08; }
.option.wrong { border-color: #d89595; background: var(--red-soft); }
.option.wrong .option-label { border-color: var(--red); background: var(--red); color: white; }
.option-mark { color: var(--green); font-size: 1.25rem; font-weight: 800; }
.missed-mark { color: #9a6a00; font-size: 0.82rem; white-space: nowrap; }
.wrong-mark { color: var(--red); }
@media (max-width: 560px) { .question-card { padding: 20px 16px; } .option { grid-template-columns: 34px 1fr auto; padding: 11px; } .option-label { width: 34px; height: 34px; } }
</style>
