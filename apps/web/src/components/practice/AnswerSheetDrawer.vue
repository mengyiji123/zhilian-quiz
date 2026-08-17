<script setup lang="ts">
import { computed } from 'vue'

import type { AnswerSheetItem } from '@/types'

const props = defineProps<{
  open: boolean
  items: readonly AnswerSheetItem[]
  currentIndex: number
}>()

const emit = defineEmits<{
  close: []
  navigate: [index: number]
}>()

const answeredCount = computed(() => props.items.filter((item) => item.answered).length)
const correctCount = computed(() => props.items.filter((item) => item.isCorrect === true).length)
const incorrectCount = computed(() => props.items.filter((item) => item.isCorrect === false).length)

function statusLabel(item: AnswerSheetItem): string {
  if (!item.answered) return '未作答，不可跳转'
  if (item.isCorrect === true) return '回答正确'
  if (item.isCorrect === false) return '回答错误'
  return '已作答，题目结果待定'
}

function navigate(item: AnswerSheetItem): void {
  if (item.answered) emit('navigate', item.index)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="sheet-layer">
      <button class="sheet-backdrop" type="button" aria-label="关闭答题卡" @click="$emit('close')" />
      <aside class="sheet-drawer" role="dialog" aria-modal="true" aria-label="本次练习答题卡">
        <header class="sheet-header">
          <div>
            <strong>本次练习答题卡</strong>
            <span>已答题可以回看，灰色未答题不可跳转</span>
          </div>
          <button class="close-button" type="button" aria-label="关闭答题卡" @click="$emit('close')">×</button>
        </header>

        <section class="sheet-content">
          <div class="sheet-summary" aria-label="答题统计">
            <span><strong>{{ answeredCount }}</strong> / {{ items.length }} 已答</span>
            <span class="correct-copy">{{ correctCount }} 正确</span>
            <span class="incorrect-copy">{{ incorrectCount }} 错误</span>
          </div>

          <div class="sheet-legend" aria-label="答题卡图例">
            <span><i class="legend-dot correct" />正确</span>
            <span><i class="legend-dot incorrect" />错误</span>
            <span><i class="legend-dot neutral" />结果待定</span>
            <span><i class="legend-dot unanswered" />未作答</span>
          </div>

          <div class="answer-grid">
            <button
              v-for="item in items"
              :key="item.questionId"
              class="answer-number"
              :class="{
                current: item.index === currentIndex,
                correct: item.isCorrect === true,
                incorrect: item.isCorrect === false,
                neutral: item.answered && item.isCorrect === null,
              }"
              type="button"
              :disabled="!item.answered"
              :aria-current="item.index === currentIndex ? 'step' : undefined"
              :aria-label="`第 ${item.index + 1} 题，${statusLabel(item)}`"
              @click="navigate(item)"
            >{{ item.index + 1 }}</button>
          </div>
        </section>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-layer { position: fixed; z-index: 105; inset: 0; }
.sheet-backdrop { position: absolute; inset: 0; width: 100%; border: 0; background: rgba(15, 30, 43, 0.32); backdrop-filter: blur(3px); }
.sheet-drawer { position: absolute; inset: 0 0 0 auto; width: min(440px, 92vw); display: grid; grid-template-rows: auto 1fr; background: #f4f7f8; box-shadow: -18px 0 45px rgba(15, 30, 43, 0.18); }
.sheet-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: calc(18px + env(safe-area-inset-top)) 20px 18px; border-bottom: 1px solid var(--line); background: white; }
.sheet-header div { display: grid; gap: 3px; }
.sheet-header strong { color: var(--navy); font-size: 1.05rem; }
.sheet-header span { color: var(--muted); font-size: 0.78rem; }
.close-button { width: 40px; height: 40px; flex: 0 0 auto; border: 0; border-radius: 10px; background: #eef3f6; color: var(--navy); cursor: pointer; font-size: 1.4rem; }
.sheet-content { min-height: 0; overflow-y: auto; padding: 18px 18px calc(24px + env(safe-area-inset-bottom)); }
.sheet-summary { display: flex; align-items: center; gap: 9px; padding: 13px 14px; border: 1px solid var(--line); border-radius: 13px; background: white; color: var(--muted); font-size: 0.82rem; }
.sheet-summary span:first-child { margin-right: auto; }
.sheet-summary strong { color: var(--navy); font-size: 1.18rem; font-variant-numeric: tabular-nums; }
.correct-copy { color: #2e7654; }
.incorrect-copy { color: #ad4e4e; }
.sheet-legend { display: flex; flex-wrap: wrap; gap: 8px 13px; margin: 15px 2px 12px; color: var(--muted); font-size: 0.75rem; }
.sheet-legend span { display: inline-flex; align-items: center; gap: 5px; }
.legend-dot { width: 9px; height: 9px; border-radius: 50%; background: #d9e1e5; }
.legend-dot.correct { background: #67a983; }
.legend-dot.incorrect { background: #d47a7a; }
.legend-dot.neutral { background: #d5a85e; }
.answer-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 9px; }
.answer-number { min-width: 0; aspect-ratio: 1; border: 1px solid #d0dbe0; border-radius: 10px; background: #e5eaed; color: #8a9aa4; cursor: pointer; font-size: 0.82rem; font-weight: 720; font-variant-numeric: tabular-nums; transition: transform 120ms ease, box-shadow 120ms ease; }
.answer-number:not(:disabled):active { transform: translateY(1px); }
.answer-number:disabled { cursor: not-allowed; opacity: 0.72; }
.answer-number.correct { border-color: #8bc2a2; background: #e7f5ec; color: #286b49; }
.answer-number.incorrect { border-color: #df9e9e; background: #fff0f0; color: #a44040; }
.answer-number.neutral { border-color: #dfbd83; background: #fff7e8; color: #986817; }
.answer-number.current { box-shadow: 0 0 0 3px white, 0 0 0 5px var(--blue); }
@media (max-width: 560px) { .sheet-drawer { width: 100%; } .answer-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; } }
</style>
