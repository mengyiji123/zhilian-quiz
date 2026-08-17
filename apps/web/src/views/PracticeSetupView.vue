<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ChapterChoiceCard from '@/components/practice/ChapterChoiceCard.vue'
import { useChapterPracticeProgress } from '@/composables/useChapterPracticeProgress'
import { api } from '@/lib/api'
import type { PracticeMode, QuestionType, Subject } from '@/types'

const modes: Array<{ value: PracticeMode; label: string; description: string }> = [
  { value: 'subject', label: '科目刷题', description: '按题库顺序练习' },
  { value: 'chapter', label: '章节刷题', description: '只练所选章节' },
  { value: 'random', label: '随机刷题', description: '随机抽取题目' },
  { value: 'wrong', label: '错题重练', description: '练尚未掌握的错题' },
  { value: 'favorite', label: '收藏刷题', description: '练收藏的题目' },
]

const typeOptions: Array<{ value: QuestionType; label: string }> = [
  { value: 'single', label: '单选题' },
  { value: 'multiple', label: '多选题' },
  { value: 'judge', label: '判断题' },
]

const route = useRoute()
const router = useRouter()
const subjects = shallowRef<Subject[]>([])
const loading = shallowRef(true)
const submitting = shallowRef(false)
const error = shallowRef('')
const chapterProgress = useChapterPracticeProgress()
const form = reactive({
  subjectId: 0,
  mode: (typeof route.query.mode === 'string' && modes.some((item) => item.value === route.query.mode)
    ? route.query.mode
    : 'subject') as PracticeMode,
  chapterIds: [] as number[],
  types: ['single', 'multiple', 'judge'] as QuestionType[],
  knowledgePointIds: [] as number[],
  limit: 30,
})

const selectedSubject = computed(() => subjects.value.find((subject) => subject.id === form.subjectId) ?? null)
const isChapterMode = computed(() => form.mode === 'chapter')
const selectedChapter = computed(() => selectedSubject.value?.chapters.find(
  (chapter) => chapter.id === form.chapterIds[0],
) ?? null)
const selectedChapterProgress = computed(() => {
  const chapterId = selectedChapter.value?.id
  return chapterId ? chapterProgress.byChapter.value[chapterId] : undefined
})
const visibleKnowledgePoints = computed(() => {
  const points = selectedSubject.value?.knowledgePoints ?? []
  if (!form.chapterIds.length) return points
  return points.filter((point) => point.chapterId && form.chapterIds.includes(point.chapterId))
})
const chapterProgressLabel = computed(() => {
  const progress = selectedChapterProgress.value
  if (!progress) return '尚未开始'
  if (progress.completedAt) return `已完成 ${progress.total} 题，可重新刷题`
  const nextNumber = Math.min(progress.currentIndex + 1, progress.total)
  return `已答 ${progress.answered}/${progress.total}，上次到第 ${nextNumber} 题`
})
const startButtonLabel = computed(() => {
  if (submitting.value) return '正在准备题目…'
  if (!isChapterMode.value) return '开始练习'
  if (selectedChapterProgress.value?.completedAt) return '重新刷本章'
  if (selectedChapterProgress.value) return '继续刷本章'
  return '开始本章'
})
const canStart = computed(() => Boolean(form.subjectId)
  && (!isChapterMode.value || form.chapterIds.length === 1))

watch(
  () => form.subjectId,
  (subjectId) => {
    form.chapterIds = []
    form.knowledgePointIds = []
    void chapterProgress.load(subjectId)
  },
)

watch(
  () => form.mode,
  (mode) => {
    if (mode !== 'chapter') return
    form.chapterIds = form.chapterIds.slice(0, 1)
    form.knowledgePointIds = []
  },
)

watch(
  () => [...form.chapterIds],
  () => {
    const visible = new Set(visibleKnowledgePoints.value.map((point) => point.id))
    form.knowledgePointIds = form.knowledgePointIds.filter((id) => visible.has(id))
  },
)

onMounted(async () => {
  try {
    const payload = await api<{ subjects: Subject[] }>('/catalog/subjects')
    subjects.value = payload.subjects
    const querySubject = Number(route.query.subject)
    form.subjectId = payload.subjects.some((subject) => subject.id === querySubject)
      ? querySubject
      : (payload.subjects[0]?.id ?? 0)
    await nextTick()
    const queryChapter = Number(route.query.chapter)
    if (form.mode === 'chapter' && selectedSubject.value?.chapters.some((chapter) => chapter.id === queryChapter)) {
      form.chapterIds = [queryChapter]
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '无法加载题库范围'
  } finally {
    loading.value = false
  }
})

function toggleNumber(list: number[], value: number): number[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function toggleType(value: QuestionType): void {
  if (form.types.includes(value)) {
    if (form.types.length > 1) form.types = form.types.filter((type) => type !== value)
    return
  }
  form.types = [...form.types, value]
}

function selectChapter(chapterId: number): void {
  form.chapterIds = isChapterMode.value
    ? [chapterId]
    : toggleNumber(form.chapterIds, chapterId)
}

async function start(): Promise<void> {
  if (isChapterMode.value && form.chapterIds.length !== 1) {
    error.value = '章节刷题请选择一个章节'
    return
  }
  submitting.value = true
  error.value = ''
  try {
    const requestBody = isChapterMode.value
      ? {
          ...form,
          chapterIds: [form.chapterIds[0]],
          types: ['single', 'multiple', 'judge'] as QuestionType[],
          knowledgePointIds: [],
          limit: 300,
        }
      : { ...form }
    const payload = await api<{ sessionId: string; total: number; resumed?: boolean }>('/practice/start', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    })
    await router.push(`/practice/${payload.sessionId}`)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '创建练习失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page setup-page">
    <header class="page-header">
      <div>
        <h1 class="page-title">开始一组练习</h1>
        <p class="page-subtitle">普通练习可以自由筛选；章节练习会保存进度，下次从上次位置继续。</p>
      </div>
    </header>

    <div v-if="loading" class="loading-block"><span class="spinner" /></div>
    <p v-else-if="error && !subjects.length" class="error-message">{{ error }}</p>
    <form v-else class="setup-layout" @submit.prevent="start">
      <div class="setup-main">
        <section class="setup-section panel">
          <div class="section-copy">
            <div><h2>练习方式</h2><p>错题和收藏也可以继续叠加题型筛选。</p></div>
          </div>
          <div class="mode-grid">
            <label v-for="mode in modes" :key="mode.value" class="mode-card" :class="{ selected: form.mode === mode.value }">
              <input v-model="form.mode" type="radio" name="mode" :value="mode.value" />
              <strong>{{ mode.label }}</strong>
              <small>{{ mode.description }}</small>
            </label>
          </div>
        </section>

        <section class="setup-section panel">
          <div class="section-copy">
            <div>
              <h2>科目与章节</h2>
              <p>{{ isChapterMode ? '每次选择一整章，自动保存进度。' : '不选章节时，默认覆盖整个科目。' }}</p>
            </div>
          </div>
          <label class="field subject-select">
            <span class="field-label">科目</span>
            <select v-model.number="form.subjectId" class="select">
              <option v-for="subject in subjects" :key="subject.id" :value="subject.id">
                {{ subject.name }}（{{ subject.questionCount }} 题）
              </option>
            </select>
          </label>
          <div v-if="selectedSubject" class="choice-grid chapters">
            <ChapterChoiceCard
              v-for="chapter in selectedSubject.chapters"
              :key="chapter.id"
              :chapter="chapter"
              :selected="form.chapterIds.includes(chapter.id)"
              :show-progress="isChapterMode"
              :progress="chapterProgress.byChapter.value[chapter.id]"
              @select="selectChapter"
            />
          </div>
        </section>

        <section v-if="!isChapterMode" class="setup-section panel">
          <div class="section-copy">
            <div><h2>题型与知识点</h2><p>至少保留一种题型；知识点可以多选。</p></div>
          </div>
          <div class="subgroup">
            <span class="field-label">题型</span>
            <div class="inline-choices">
              <button
                v-for="type in typeOptions"
                :key="type.value"
                class="filter-chip"
                :class="{ selected: form.types.includes(type.value) }"
                type="button"
                @click="toggleType(type.value)"
              >{{ type.label }}</button>
            </div>
          </div>
          <div class="subgroup">
            <span class="field-label">知识点（可选）</span>
            <div class="inline-choices">
              <button
                v-for="point in visibleKnowledgePoints"
                :key="point.id"
                class="filter-chip"
                :class="{ selected: form.knowledgePointIds.includes(point.id) }"
                type="button"
                @click="form.knowledgePointIds = toggleNumber(form.knowledgePointIds, point.id)"
              >{{ point.name }} <small>{{ point.questionCount }}</small></button>
            </div>
          </div>
        </section>
      </div>

      <aside class="setup-summary panel">
        <h2>{{ isChapterMode ? '本章进度' : '本组设置' }}</h2>
        <dl>
          <div><dt>科目</dt><dd>{{ selectedSubject?.name ?? '未选择' }}</dd></div>
          <div><dt>方式</dt><dd>{{ modes.find((mode) => mode.value === form.mode)?.label }}</dd></div>
          <div><dt>章节</dt><dd>{{ isChapterMode ? (selectedChapter?.title ?? '请选择') : (form.chapterIds.length ? `${form.chapterIds.length} 个` : '全部章节') }}</dd></div>
          <div v-if="isChapterMode"><dt>范围</dt><dd>{{ selectedChapter ? `整章 ${selectedChapter.questionCount} 题` : '未选择' }}</dd></div>
          <div v-if="isChapterMode"><dt>进度</dt><dd>{{ chapterProgressLabel }}</dd></div>
          <div v-if="!isChapterMode"><dt>题型</dt><dd>{{ form.types.length }} 种</dd></div>
          <div v-if="!isChapterMode"><dt>知识点</dt><dd>{{ form.knowledgePointIds.length ? `${form.knowledgePointIds.length} 个` : '不限' }}</dd></div>
        </dl>
        <label v-if="!isChapterMode" class="field">
          <span class="field-label">题目数量</span>
          <select v-model.number="form.limit" class="select">
            <option :value="10">10 题</option>
            <option :value="20">20 题</option>
            <option :value="30">30 题</option>
            <option :value="50">50 题</option>
            <option :value="100">100 题</option>
            <option :value="300">最多 300 题</option>
          </select>
        </label>
        <p v-if="isChapterMode" class="chapter-note">完成后可重新刷本章；历史答案、错题及错误次数都会保留。</p>
        <p v-if="isChapterMode && chapterProgress.error.value" class="error-message">{{ chapterProgress.error.value }}</p>
        <p v-if="error" class="error-message">{{ error }}</p>
        <button class="button full" type="submit" :disabled="submitting || !canStart">
          {{ startButtonLabel }}
        </button>
      </aside>
    </form>
  </div>
</template>

<style scoped>
.setup-layout { display: grid; grid-template-columns: minmax(0, 1fr) 286px; align-items: start; gap: 18px; }
.setup-main { display: grid; gap: 16px; }
.setup-section { padding: 23px 24px 25px; }
.section-copy { display: flex; align-items: flex-start; margin-bottom: 20px; padding-left: 12px; border-left: 3px solid var(--blue); }
.section-copy h2 { margin-bottom: 4px; color: var(--navy); font-size: 1.12rem; }
.section-copy p { margin-bottom: 0; color: var(--muted); font-size: 0.84rem; line-height: 1.5; }
.mode-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 9px; }
.mode-card { position: relative; min-height: 92px; display: grid; align-content: center; gap: 4px; padding: 13px; border: 1px solid var(--line); border-radius: var(--radius-control); background: var(--panel-subtle); cursor: pointer; transition: transform 120ms ease, border-color 120ms ease, background-color 120ms ease; }
.mode-card input { position: absolute; opacity: 0; pointer-events: none; }
.mode-card strong { color: #344b5d; font-size: 0.9rem; }
.mode-card small { color: var(--muted); font-size: 0.75rem; line-height: 1.35; }
.mode-card:hover { border-color: var(--line-strong); background: white; }
.mode-card:active { transform: translateY(1px); }
.mode-card.selected { border-color: var(--blue); background: var(--blue-soft); box-shadow: inset 0 -3px 0 rgba(40, 119, 159, 0.18); }
.mode-card.selected strong { color: #235d83; }
.subject-select { max-width: 390px; margin-bottom: 15px; }
.choice-grid.chapters { display: grid; grid-template-columns: repeat(2, 1fr); gap: 9px; }
.subgroup { display: grid; gap: 10px; }
.subgroup + .subgroup { margin-top: 19px; }
.inline-choices { display: flex; flex-wrap: wrap; gap: 8px; }
.filter-chip { min-height: 42px; padding: 7px 12px; border: 1px solid var(--line); border-radius: var(--radius-control); background: white; color: #425766; cursor: pointer; transition: transform 120ms ease, border-color 120ms ease, background-color 120ms ease; }
.filter-chip:active { transform: translateY(1px); }
.filter-chip small { margin-left: 3px; color: var(--muted); }
.filter-chip.selected { border-color: var(--blue); background: var(--blue-soft); color: #215c83; font-weight: 650; }
.setup-summary { position: sticky; top: 22px; display: grid; gap: 19px; padding: 23px; border-color: #c8dae3; background: #f5fafc; box-shadow: 0 14px 34px rgba(30, 80, 108, 0.08); }
.setup-summary h2 { margin: 0; color: var(--navy); font-size: 1.15rem; }
.setup-summary dl { display: grid; gap: 11px; margin: 0; }
.setup-summary dl div { display: flex; justify-content: space-between; gap: 12px; padding-bottom: 10px; border-bottom: 1px solid rgba(198, 216, 225, 0.7); }
.setup-summary dl div:last-child { padding-bottom: 0; border-bottom: 0; }
.setup-summary dt { color: var(--muted); }
.setup-summary dd { margin: 0; color: #354b5c; font-weight: 650; text-align: right; }
.chapter-note { margin: -4px 0 0; padding: 10px 11px; border-left: 3px solid var(--blue); background: rgba(255, 255, 255, 0.72); color: #587080; font-size: 0.78rem; line-height: 1.55; }
@media (max-width: 1000px) { .setup-layout { grid-template-columns: 1fr; } .setup-summary { position: static; } .mode-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 620px) { .mode-grid { grid-template-columns: repeat(2, 1fr); } .choice-grid.chapters { grid-template-columns: 1fr; } .setup-section { padding: 18px; } }
</style>
