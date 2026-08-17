<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'

import MetricStrip from '@/components/common/MetricStrip.vue'
import { api } from '@/lib/api'

interface StatsPayload {
  summary: {
    attempts: number
    correct: number
    accuracy: number
    answeredQuestions: number
    wrongQuestions: number
    favorites: number
  }
  byType: Array<{ type: string; attempts: number; correct: number; accuracy: number }>
  byChapter: Array<{ chapterId: number; chapterNumber: number; title: string; attempts: number; correct: number; accuracy: number }>
  daily: Array<{ day: string; attempts: number; correct: number }>
}

const stats = shallowRef<StatsPayload | null>(null)
const loading = shallowRef(true)
const error = shallowRef('')
const maxDaily = computed(() => Math.max(...(stats.value?.daily.map((item) => item.attempts) ?? []), 1))
const summaryItems = computed(() => stats.value ? [
  { label: '综合正确率', value: stats.value.summary.accuracy, suffix: '%', detail: '全部题型累计', tone: 'primary' as const },
  { label: '累计作答', value: stats.value.summary.attempts, suffix: '次', detail: '包含重复练习' },
  { label: '已练题目', value: stats.value.summary.answeredQuestions, suffix: '题', detail: '不同题目数量' },
  { label: '待复习错题', value: stats.value.summary.wrongQuestions, suffix: '题', detail: '继续巩固薄弱项', to: '/wrong', tone: 'warning' as const },
] : [])
const typeLabel = (type: string) => ({ single: '单选题', multiple: '多选题', judge: '判断题' })[type] ?? type

onMounted(async () => {
  try {
    stats.value = await api<StatsPayload>('/stats')
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '统计加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page stats-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">学习统计</h1>
        <p class="page-subtitle">从正确率和章节分布里找到下一步复习重点。</p>
      </div>
    </header>

    <div v-if="loading" class="loading-block"><span class="spinner" /></div>
    <p v-else-if="error" class="error-message">{{ error }}</p>
    <template v-else-if="stats">
      <MetricStrip class="stats-summary" :items="summaryItems" />

      <section class="stats-grid">
        <article class="chart-panel panel">
          <div class="chart-heading"><div><h2>近 14 天练习</h2><p>只显示有作答记录的日期</p></div></div>
          <div v-if="stats.daily.length" class="daily-chart">
            <div v-for="item in stats.daily" :key="item.day" class="daily-column">
              <span class="daily-value">{{ item.attempts }}</span>
              <div class="daily-bar-track"><span :style="{ height: `${Math.max((item.attempts / maxDaily) * 100, 5)}%` }" /></div>
              <small>{{ item.day.slice(5) }}</small>
            </div>
          </div>
          <div v-else class="mini-empty">完成一组练习后，这里会出现趋势。</div>
        </article>

        <article class="chart-panel panel">
          <div class="chart-heading"><div><h2>按题型</h2><p>累计答题正确率</p></div></div>
          <div class="progress-list">
            <div v-for="item in stats.byType" :key="item.type" class="progress-item">
              <div><strong>{{ typeLabel(item.type) }}</strong><span>{{ item.correct }} / {{ item.attempts }}</span></div>
              <div class="accuracy-track"><span :style="{ width: `${item.accuracy}%` }" /></div>
              <b>{{ item.accuracy }}%</b>
            </div>
          </div>
        </article>
      </section>

      <section class="chapter-panel panel">
        <div class="chart-heading"><div><h2>章节掌握情况</h2><p>还没有作答的章节以 0% 显示</p></div></div>
        <div class="chapter-list">
          <div v-for="item in stats.byChapter" :key="item.chapterId" class="chapter-row">
            <span class="chapter-number">{{ item.chapterNumber }}</span>
            <div class="chapter-copy"><strong>{{ item.title }}</strong><small>{{ item.attempts }} 次作答</small></div>
            <div class="accuracy-track"><span :style="{ width: `${item.accuracy}%` }" /></div>
            <b>{{ item.accuracy }}%</b>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.stats-summary { margin-bottom: 16px; }
.stats-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px; }
.chart-panel, .chapter-panel { padding: 22px; }
.chart-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 21px; }
.chart-heading h2 { margin-bottom: 4px; color: var(--navy); font-size: 1.05rem; }
.chart-heading p { margin-bottom: 0; color: var(--muted); font-size: 0.8rem; }
.daily-chart { min-height: 210px; display: flex; align-items: end; gap: 9px; overflow-x: auto; }
.daily-column { min-width: 34px; height: 190px; flex: 1; display: grid; grid-template-rows: 20px 1fr 22px; justify-items: center; gap: 5px; }
.daily-value { color: var(--muted); font-size: 0.7rem; }
.daily-bar-track { width: 18px; height: 100%; display: flex; align-items: end; overflow: hidden; border-radius: 5px 5px 2px 2px; background: #edf2f5; }
.daily-bar-track span { width: 100%; border-radius: inherit; background: var(--blue); }
.daily-column small { color: var(--muted); font-size: 0.68rem; white-space: nowrap; }
.progress-list { display: grid; gap: 20px; }
.progress-item { display: grid; grid-template-columns: 1fr auto; gap: 8px 12px; align-items: center; }
.progress-item div:first-child { grid-column: 1 / -1; display: flex; justify-content: space-between; }
.progress-item strong { color: #344a5a; }
.progress-item span { color: var(--muted); font-size: 0.8rem; }
.accuracy-track { height: 8px; overflow: hidden; border-radius: 4px; background: #e8eef1; }
.accuracy-track span { display: block; height: 100%; border-radius: inherit; background: var(--blue); }
.progress-item b, .chapter-row b { color: var(--navy); font-size: 0.86rem; }
.chapter-panel { margin-top: 16px; }
.chapter-list { display: grid; }
.chapter-row { display: grid; grid-template-columns: 36px minmax(180px, 0.8fr) minmax(140px, 1fr) 50px; align-items: center; gap: 13px; padding: 13px 0; border-top: 1px solid #edf1f3; }
.chapter-number { width: 34px; height: 34px; display: grid; place-items: center; border-radius: var(--radius-small); background: var(--blue-soft); color: var(--blue); font-weight: 750; }
.chapter-copy { display: grid; gap: 3px; }
.chapter-copy strong { color: #344a5a; font-size: 0.88rem; }
.chapter-copy small { color: var(--muted); }
.mini-empty { padding: 65px 20px; color: var(--muted); text-align: center; }
@media (max-width: 900px) { .stats-grid { grid-template-columns: 1fr; } }
@media (max-width: 650px) { .chapter-row { grid-template-columns: 34px 1fr 45px; } .chapter-row > .accuracy-track { grid-column: 2 / -1; grid-row: 2; } }
</style>
