<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useRoute } from 'vue-router'

import AiTutorDrawer from '@/components/practice/AiTutorDrawer.vue'
import AnswerPanel from '@/components/practice/AnswerPanel.vue'
import AnswerSheetDrawer from '@/components/practice/AnswerSheetDrawer.vue'
import DrawingBoardModal from '@/components/practice/DrawingBoardModal.vue'
import PracticeToolbar from '@/components/practice/PracticeToolbar.vue'
import QuestionCard from '@/components/practice/QuestionCard.vue'
import QuestionReportDialog from '@/components/practice/QuestionReportDialog.vue'
import { useAiTutor } from '@/composables/useAiTutor'
import { usePracticeSession } from '@/composables/usePracticeSession'

const route = useRoute()
const drawingOpen = shallowRef(false)
const answerSheetOpen = shallowRef(false)
const reportOpen = shallowRef(false)
const session = usePracticeSession({ sessionId: String(route.params.sessionId) })
const aiTutor = useAiTutor()
const selectedModel = computed({
  get: () => [...session.selected.value],
  set: (value: string[]) => session.setSelected(value),
})
const questionLabel = computed(() => session.question.value
  ? `第 ${session.question.value.chapterNumber} 章 · 第 ${session.question.value.number} 题`
  : '当前题目')
const chapterRestartRoute = computed(() => ({
  path: '/practice/setup',
  query: {
    mode: 'chapter',
    subject: String(session.subjectId.value),
    chapter: String(session.question.value?.chapterId ?? ''),
  },
}))

onMounted(session.initialize)

function openAi(): void {
  if (session.question.value) void aiTutor.open(session.question.value.id)
}

function navigateFromAnswerSheet(index: number): void {
  answerSheetOpen.value = false
  void session.goToAnswered(index)
}
</script>

<template>
  <div class="page practice-page">
    <header class="practice-heading">
      <RouterLink class="back-link" to="/practice/setup">‹ 返回设置</RouterLink>
      <span v-if="session.question.value">{{ session.question.value.subjectName }} · {{ session.question.value.chapterTitle }}</span>
    </header>

    <div v-if="session.loading.value" class="loading-block"><span class="spinner" /></div>
    <div v-else-if="session.error.value && !session.question.value" class="panel empty-state">
      <h2>题目暂时无法打开</h2>
      <p>{{ session.error.value }}</p>
      <RouterLink class="button" to="/practice/setup">重新选择</RouterLink>
    </div>
    <template v-else-if="session.question.value">
      <PracticeToolbar
        :index="session.index.value"
        :total="session.total.value"
        :is-favorite="session.question.value.isFavorite"
        @toggle-favorite="session.toggleFavorite"
        @open-answer-sheet="answerSheetOpen = true"
        @open-drawing="drawingOpen = true"
      />

      <QuestionCard
        v-model="selectedModel"
        :question="session.question.value"
        :result="session.result.value"
      />

      <p v-if="session.error.value" class="error-message practice-error">{{ session.error.value }}</p>

      <AnswerPanel
        v-if="session.result.value"
        :result="session.result.value"
        @ask-ai="openAi"
        @report-error="reportOpen = true"
      />

      <nav class="practice-navigation panel" aria-label="题目导航">
        <button class="button secondary" type="button" :disabled="!session.canPrevious.value" @click="session.goTo(session.index.value - 1)">上一题</button>
        <button
          v-if="!session.result.value"
          class="button submit-answer"
          type="button"
          :disabled="!session.selected.value.length || session.submitting.value"
          @click="session.submit"
        >{{ session.submitting.value ? '提交中…' : '提交答案' }}</button>
        <button v-else-if="session.canNext.value" class="button" type="button" @click="session.goTo(session.index.value + 1)">下一题</button>
        <RouterLink
          v-else-if="session.mode.value === 'chapter'"
          class="button"
          :to="chapterRestartRoute"
        >本章完成，可重新刷题</RouterLink>
        <RouterLink v-else class="button" to="/stats">完成，查看统计</RouterLink>
      </nav>

      <DrawingBoardModal
        :open="drawingOpen"
        :question-label="questionLabel"
        @close="drawingOpen = false"
      />
      <AnswerSheetDrawer
        :open="answerSheetOpen"
        :items="session.answerSheet.value"
        :current-index="session.index.value"
        @close="answerSheetOpen = false"
        @navigate="navigateFromAnswerSheet"
      />
      <AiTutorDrawer
        :open="aiTutor.isOpen.value"
        :messages="aiTutor.messages.value"
        :sending="aiTutor.sending.value"
        :loading="aiTutor.loading.value"
        :error="aiTutor.error.value"
        @close="aiTutor.close"
        @send="aiTutor.send"
      />
      <QuestionReportDialog
        :open="reportOpen"
        :question-id="session.question.value.id"
        :question-label="questionLabel"
        @close="reportOpen = false"
      />
    </template>
  </div>
</template>

<style scoped>
.practice-page { width: min(960px, 100%); }
.practice-heading { min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 11px; color: var(--muted); font-size: 0.84rem; }
.back-link { color: var(--blue); font-weight: 650; }
.back-link:hover { color: var(--blue-strong); }
.practice-error { margin-top: 14px; }
.practice-navigation { position: sticky; z-index: 10; bottom: 15px; display: flex; justify-content: space-between; gap: 12px; margin-top: 16px; padding: 11px; border-color: rgba(201, 215, 222, 0.9); background: rgba(255, 255, 255, 0.94); box-shadow: var(--shadow-raised); backdrop-filter: blur(12px); }
.submit-answer { margin-left: auto; min-width: 150px; }
@media (max-width: 760px) { .practice-navigation { bottom: calc(76px + env(safe-area-inset-bottom)); } .practice-navigation .button { flex: 1; min-width: 0; padding-inline: 10px; } }
</style>
