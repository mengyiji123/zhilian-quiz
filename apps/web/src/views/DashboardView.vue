<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'

import MetricStrip from '@/components/common/MetricStrip.vue'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import type { Subject } from '@/types'

interface StatsSummary {
  attempts: number
  correct: number
  accuracy: number
  answeredQuestions: number
  wrongQuestions: number
  favorites: number
}

const auth = useAuthStore()
const subjects = shallowRef<Subject[]>([])
const summary = shallowRef<StatsSummary | null>(null)
const loading = shallowRef(true)
const error = shallowRef('')
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})
const summaryItems = computed(() => [
  {
    label: '正确率',
    value: summary.value?.accuracy ?? 0,
    suffix: '%',
    detail: '综合答题表现',
    tone: 'primary' as const,
  },
  {
    label: '已答题目',
    value: summary.value?.answeredQuestions ?? 0,
    detail: `累计作答 ${summary.value?.attempts ?? 0} 次`,
  },
  {
    label: '待复习错题',
    value: summary.value?.wrongQuestions ?? 0,
    detail: '连续答对两次可掌握',
    to: '/wrong',
    tone: 'warning' as const,
  },
  {
    label: '我的收藏',
    value: summary.value?.favorites ?? 0,
    detail: '回看重点题目',
    to: '/favorites',
  },
])

onMounted(async () => {
  try {
    const [catalog, stats] = await Promise.all([
      api<{ subjects: Subject[] }>('/catalog/subjects'),
      api<{ summary: StatsSummary }>('/stats'),
    ])
    subjects.value = catalog.subjects
    summary.value = stats.summary
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page dashboard">
    <header class="welcome">
      <div>
        <p class="eyebrow">{{ greeting }}</p>
        <h1>{{ auth.user?.displayName }}，今天想练哪一部分？</h1>
        <p>按章节稳扎稳打，或者来一组随机题快速热身。</p>
      </div>
      <RouterLink class="button" to="/practice/setup">开始刷题</RouterLink>
    </header>

    <div v-if="loading" class="loading-block"><span class="spinner" /></div>
    <p v-else-if="error" class="error-message">{{ error }}</p>
    <template v-else>
      <MetricStrip :items="summaryItems" />

      <section class="subjects-section">
        <div class="section-heading">
          <div>
            <h2>科目</h2>
            <p>后续新增科目时，会自动出现在这里。</p>
          </div>
        </div>
        <div class="subject-grid">
          <article v-for="subject in subjects" :key="subject.id" class="subject-card panel">
            <div class="subject-mark">数</div>
            <div class="subject-copy">
              <div class="subject-title-row">
                <h3>{{ subject.name }}</h3>
                <span class="tag">{{ subject.questionCount }} 题</span>
              </div>
              <p>{{ subject.description }}</p>
              <div class="chapter-line">
                <span>{{ subject.chapters.length }} 章</span>
                <span>{{ subject.knowledgePoints.length }} 个知识点</span>
              </div>
            </div>
            <RouterLink class="button secondary compact" :to="`/practice/setup?subject=${subject.id}`">选择范围</RouterLink>
          </article>
        </div>
      </section>

      <section class="quick-grid panel" aria-label="快捷入口">
        <RouterLink class="quick-card featured" to="/practice/setup?mode=random">
          <span class="quick-icon">↝</span>
          <div><strong>随机刷题</strong><small>打乱章节，快速检验掌握情况</small></div>
        </RouterLink>
        <RouterLink class="quick-card" to="/practice/setup?mode=wrong">
          <span class="quick-icon warn">!</span>
          <div><strong>错题重练</strong><small>优先消化尚未掌握的题目</small></div>
        </RouterLink>
        <RouterLink class="quick-card" to="/stats">
          <span class="quick-icon">▥</span>
          <div><strong>学习统计</strong><small>查看章节与题型正确率</small></div>
        </RouterLink>
      </section>
    </template>
  </div>
</template>

<style scoped>
.dashboard { display: grid; gap: 28px; }
.welcome { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 22px 4px 2px; }
.welcome h1 { margin-bottom: 8px; color: var(--navy); font-size: clamp(1.72rem, 2.6vw, 2.25rem); font-weight: 760; letter-spacing: -0.025em; }
.welcome p { margin-bottom: 0; color: var(--muted); }
.welcome .eyebrow { margin-bottom: 6px; color: var(--blue); font-size: 0.82rem; font-weight: 720; letter-spacing: 0.05em; }
.section-heading { display: flex; justify-content: space-between; margin-bottom: 14px; }
.section-heading h2 { margin-bottom: 4px; color: var(--navy); }
.section-heading p { margin-bottom: 0; color: var(--muted); font-size: 0.9rem; }
.subject-grid { display: grid; gap: 14px; }
.subject-card { display: grid; grid-template-columns: 58px 1fr auto; align-items: center; gap: 18px; padding: 22px; border-left: 3px solid var(--blue); }
.subject-mark { width: 58px; height: 58px; display: grid; place-items: center; border-radius: 14px; background: var(--blue-soft); color: var(--blue); font-size: 1.35rem; font-weight: 800; }
.subject-title-row { display: flex; align-items: center; gap: 10px; }
.subject-title-row h3 { margin: 0; color: var(--navy); font-size: 1.2rem; }
.subject-copy p { margin: 7px 0; color: var(--muted); font-size: 0.91rem; line-height: 1.5; }
.chapter-line { display: flex; gap: 18px; color: #506473; font-size: 0.82rem; }
.quick-grid { display: grid; grid-template-columns: 1.2fr 1fr 1fr; overflow: hidden; }
.quick-card { position: relative; display: flex; align-items: center; gap: 14px; min-height: 88px; padding: 18px 20px; transition: background-color 120ms ease; }
.quick-card + .quick-card { border-left: 1px solid var(--line); }
.quick-card:hover { background: var(--panel-subtle); }
.quick-card.featured { background: var(--blue-soft); }
.quick-card.featured:hover { background: #dfedf3; }
.quick-icon { width: 42px; height: 42px; flex: 0 0 auto; display: grid; place-items: center; border-radius: var(--radius-control); background: var(--blue-soft); color: var(--blue); font-size: 1.25rem; font-weight: 800; }
.featured .quick-icon { background: white; }
.quick-icon.warn { background: #fff3df; color: #b6720f; }
.quick-card div { display: grid; gap: 4px; }
.quick-card strong { color: var(--navy); }
.quick-card small { color: var(--muted); line-height: 1.35; }
@media (max-width: 760px) {
  .welcome { align-items: stretch; flex-direction: column; }
  .subject-card { grid-template-columns: 50px 1fr; }
  .subject-mark { width: 50px; height: 50px; }
  .subject-card > .button { grid-column: 1 / -1; }
  .quick-grid { grid-template-columns: 1fr; }
  .quick-card + .quick-card { border-top: 1px solid var(--line); border-left: 0; }
}
</style>
