<script setup lang="ts">
import { computed } from 'vue'

import type { AnswerResult } from '@/types'

const props = defineProps<{
  result: AnswerResult
}>()

defineEmits<{
  askAi: []
  reportError: []
}>()

const state = computed(() => {
  if (props.result.isDefective) return { label: '题目有缺陷', className: 'defective', icon: '?' }
  if (props.result.isCorrect) return { label: '回答正确', className: 'correct', icon: '✓' }
  return { label: '回答错误', className: 'wrong', icon: '×' }
})

const confidenceLabel = computed(() => ({ high: '高', medium: '中', low: '低' })[props.result.confidence])
</script>

<template>
  <section class="answer-panel panel" :class="state.className">
    <header class="answer-header">
      <div class="result-title">
        <span class="result-icon">{{ state.icon }}</span>
        <div>
          <strong>{{ state.label }}</strong>
          <span v-if="result.correctLabels.length">正确答案：{{ result.correctLabels.join('、') }}</span>
          <span v-else>校订稿未给出唯一答案</span>
        </div>
      </div>
      <span class="confidence">答案置信度：{{ confidenceLabel }}</span>
    </header>
    <div class="explanation">
      <h2>题目解析</h2>
      <p>{{ result.explanation }}</p>
    </div>
    <footer class="answer-actions">
      <button class="button secondary" type="button" @click="$emit('askAi')">
        问问 AI
      </button>
      <button class="button report-button" type="button" @click="$emit('reportError')">报告错误</button>
    </footer>
  </section>
</template>

<style scoped>
.answer-panel { margin-top: 16px; overflow: hidden; border-left-width: 4px; padding: 24px 26px; box-shadow: 0 10px 26px rgba(26, 57, 78, 0.055); }
.answer-panel.correct { border-left-color: var(--green); }
.answer-panel.wrong { border-left-color: var(--red); }
.answer-panel.defective { border-left-color: var(--gold); }
.answer-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
.result-title { display: flex; align-items: center; gap: 12px; }
.result-icon { width: 40px; height: 40px; display: grid; place-items: center; border-radius: var(--radius-control); background: var(--green-soft); color: var(--green); font-size: 1.25rem; font-weight: 800; }
.wrong .result-icon { background: var(--red-soft); color: var(--red); }
.defective .result-icon { background: #fff3df; color: #b66d00; }
.result-title div { display: grid; gap: 3px; }
.result-title strong { color: var(--navy); font-size: 1.05rem; }
.result-title span { color: var(--muted); font-size: 0.88rem; }
.confidence { padding: 5px 9px; border-radius: var(--radius-small); background: #f0f4f6; color: var(--muted); font-size: 0.78rem; }
.explanation { padding: 20px 0 4px; }
.explanation h2 { margin-bottom: 8px; color: var(--navy); font-size: 1rem; }
.explanation p { margin-bottom: 0; color: #3f5362; line-height: 1.85; white-space: pre-wrap; }
.answer-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.report-button { border-color: #e3c98d; background: #fff9ea; color: #8a5a0b; }
.report-button:hover { border-color: #d6b66c; background: var(--gold-soft); }
@media (max-width: 560px) { .answer-panel { padding: 20px 17px; } .answer-header { flex-direction: column; } .answer-actions .button { flex: 1; } }
</style>
