<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'

import type {
  AdminQuestionDetail,
  AdminQuestionUpdateInput,
  QuestionReportCategory,
  QuestionType,
  Subject,
} from '@/types'

const props = defineProps<{
  question: AdminQuestionDetail | null
  subjects: readonly Subject[]
  loading: boolean
  saving: boolean
}>()

const emit = defineEmits<{
  save: [input: AdminQuestionUpdateInput]
  resolveReports: []
  dirtyChange: [dirty: boolean]
}>()

const form = reactive<AdminQuestionUpdateInput>({
  type: 'single',
  stem: '',
  explanation: '',
  confidence: 'medium',
  isDefective: false,
  options: [],
  knowledgePointIds: [],
})
const baseline = shallowRef('')
const dirty = shallowRef(false)
let resetting = false

const subject = computed(() => props.subjects.find((item) => item.id === props.question?.subjectId))
const availableKnowledgePoints = computed(() => (subject.value?.knowledgePoints ?? []).filter((point) => (
  point.chapterId === null || point.chapterId === props.question?.chapterId
)))
const openReports = computed(() => props.question?.reports.filter((report) => report.status === 'open') ?? [])
const validationError = computed(() => {
  if (!form.stem.trim()) return '题干不能为空'
  if (form.options.length < 2) return '至少需要两个选项'
  const labels = form.options.map((option) => option.label.trim().toUpperCase())
  if (labels.some((label) => !label)) return '选项标识不能为空'
  if (new Set(labels).size !== labels.length) return '选项标识不能重复'
  if (form.options.some((option) => !option.content.trim())) return '选项内容不能为空'
  const correctCount = form.options.filter((option) => option.isCorrect).length
  if (!form.isDefective && !correctCount) return '非缺陷题至少需要一个正确答案'
  if (!form.isDefective && form.type !== 'multiple' && correctCount !== 1) return '单选题和判断题只能设置一个正确答案'
  return ''
})

watch(
  () => props.question,
  (question) => {
    resetting = true
    if (question) {
      Object.assign(form, {
        type: question.type,
        stem: question.stem,
        explanation: question.explanation,
        confidence: question.confidence,
        isDefective: question.isDefective,
        options: question.options.map((option) => ({ ...option })),
        knowledgePointIds: question.knowledgePoints.map((point) => point.id),
      })
    }
    baseline.value = JSON.stringify(form)
    dirty.value = false
    emit('dirtyChange', false)
    resetting = false
  },
  { immediate: true },
)

watch(
  form,
  () => {
    if (resetting) return
    const nextDirty = JSON.stringify(form) !== baseline.value
    if (nextDirty !== dirty.value) {
      dirty.value = nextDirty
      emit('dirtyChange', nextDirty)
    }
  },
  { deep: true },
)

watch(
  () => form.type,
  (type, previous) => {
    if (resetting || !previous || type === 'multiple') return
    const firstCorrect = form.options.findIndex((option) => option.isCorrect)
    form.options.forEach((option, index) => { option.isCorrect = index === firstCorrect })
  },
)

function typeLabel(type: QuestionType): string {
  return ({ single: '单选题', multiple: '多选题', judge: '判断题' })[type]
}

function categoryLabel(category: QuestionReportCategory): string {
  return ({ stem: '题干', option: '选项', answer: '答案', explanation: '解析', other: '其他' })[category]
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function toggleCorrect(index: number): void {
  if (form.type === 'multiple') {
    const option = form.options[index]
    if (option) option.isCorrect = !option.isCorrect
    return
  }
  form.options.forEach((option, optionIndex) => { option.isCorrect = optionIndex === index })
}

function addOption(): void {
  if (form.options.length >= 12) return
  const used = new Set(form.options.map((option) => option.label.toUpperCase()))
  const label = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((candidate) => !used.has(candidate))
    ?? String(form.options.length + 1)
  form.options.push({ label, content: '', isCorrect: false })
}

function removeOption(index: number): void {
  if (form.options.length <= 2) return
  form.options.splice(index, 1)
}

function toggleKnowledgePoint(pointId: number): void {
  form.knowledgePointIds = form.knowledgePointIds.includes(pointId)
    ? form.knowledgePointIds.filter((id) => id !== pointId)
    : [...form.knowledgePointIds, pointId]
}

function submit(): void {
  if (validationError.value || props.saving) return
  emit('save', {
    ...form,
    stem: form.stem.trim(),
    explanation: form.explanation.trim(),
    options: form.options.map((option) => ({
      label: option.label.trim().toUpperCase(),
      content: option.content.trim(),
      isCorrect: option.isCorrect,
    })),
    knowledgePointIds: [...form.knowledgePointIds],
  })
}
</script>

<template>
  <section class="editor panel" aria-label="题目编辑器">
    <div v-if="loading" class="editor-loading"><span class="editor-skeleton" /></div>
    <div v-else-if="!question" class="editor-empty">
      <strong>选择一道题开始编辑</strong>
      <span>左侧列表会优先展示收到报错的题目。</span>
    </div>
    <form v-else class="editor-form" @submit.prevent="submit">
      <header class="editor-heading">
        <div class="heading-copy">
          <span>{{ question.subjectName }} · 第 {{ question.chapterNumber }} 章</span>
          <h2>第 {{ question.number }} 题</h2>
          <small>{{ question.externalKey }} · {{ typeLabel(form.type) }}</small>
        </div>
        <div class="save-area">
          <span v-if="dirty" class="unsaved">有未保存修改</span>
          <button class="button compact" type="submit" :disabled="saving || Boolean(validationError) || !dirty">
            {{ saving ? '保存中…' : '保存修改' }}
          </button>
        </div>
      </header>

      <section v-if="question.reports.length" class="report-section" :class="{ resolved: !openReports.length }">
        <header>
          <div>
            <strong>{{ openReports.length ? `${openReports.length} 条待处理报错` : '报错均已处理' }}</strong>
            <span>修改并核对题目后，可将待处理反馈一并标记为已处理。</span>
          </div>
          <button v-if="openReports.length" class="resolve-button" type="button" :disabled="saving" @click="emit('resolveReports')">
            全部标记已处理
          </button>
        </header>
        <div class="report-list">
          <article v-for="report in question.reports" :key="report.id" class="report-item" :class="report.status">
            <div>
              <span class="report-category">{{ categoryLabel(report.category) }}</span>
              <strong>{{ report.reporterName }}</strong>
              <small>@{{ report.reporterUsername }} · {{ formatDate(report.updatedAt) }}</small>
            </div>
            <p>{{ report.message || '未填写补充说明' }}</p>
            <span class="report-status">{{ report.status === 'open' ? '待处理' : '已处理' }}</span>
          </article>
        </div>
      </section>

      <div class="editor-fields">
        <label class="field span-full">
          <span class="field-label">题干</span>
          <textarea v-model="form.stem" class="textarea stem-input" required />
        </label>

        <label class="field">
          <span class="field-label">题型</span>
          <select v-model="form.type" class="select">
            <option value="single">单选题</option>
            <option value="multiple">多选题</option>
            <option value="judge">判断题</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">答案置信度</span>
          <select v-model="form.confidence" class="select">
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </label>

        <fieldset class="option-fieldset span-full">
          <legend>选项与正确答案</legend>
          <p>点击左侧圆点或方框设置正确答案；多选题可选择多个。</p>
          <div class="option-editor-list">
            <div v-for="(option, index) in form.options" :key="index" class="option-editor">
              <button
                class="answer-toggle"
                :class="{ correct: option.isCorrect, multiple: form.type === 'multiple' }"
                type="button"
                :aria-label="option.isCorrect ? `取消 ${option.label} 为正确答案` : `设 ${option.label} 为正确答案`"
                :aria-pressed="option.isCorrect"
                @click="toggleCorrect(index)"
              >{{ option.isCorrect ? '✓' : '' }}</button>
              <input v-model.trim="option.label" class="option-label" maxlength="8" :aria-label="`第 ${index + 1} 个选项标识`" />
              <textarea v-model="option.content" class="option-content" rows="2" :aria-label="`${option.label || index + 1} 选项内容`" />
              <button class="remove-option" type="button" :disabled="form.options.length <= 2" aria-label="删除选项" @click="removeOption(index)">×</button>
            </div>
          </div>
          <button class="add-option" type="button" :disabled="form.options.length >= 12" @click="addOption">＋ 添加选项</button>
        </fieldset>

        <label class="field span-full">
          <span class="field-label">题目解析</span>
          <textarea v-model="form.explanation" class="textarea explanation-input" placeholder="支持 Markdown 与 LaTeX 公式" />
        </label>

        <fieldset v-if="availableKnowledgePoints.length" class="knowledge-fieldset span-full">
          <legend>知识点</legend>
          <div class="knowledge-options">
            <button
              v-for="point in availableKnowledgePoints"
              :key="point.id"
              class="knowledge-chip"
              :class="{ selected: form.knowledgePointIds.includes(point.id) }"
              type="button"
              :aria-pressed="form.knowledgePointIds.includes(point.id)"
              @click="toggleKnowledgePoint(point.id)"
            >{{ point.name }}</button>
          </div>
        </fieldset>

        <label class="defective-toggle span-full">
          <input v-model="form.isDefective" type="checkbox" />
          <span><strong>标记为缺陷题</strong><small>答案不唯一或题目条件不足时，作答结果不计对错。</small></span>
        </label>

        <p v-if="validationError" class="validation-message span-full">{{ validationError }}</p>
      </div>
    </form>
  </section>
</template>

<style scoped>
.editor { min-width: 0; min-height: 620px; overflow: hidden; }
.editor-form { min-height: 100%; }
.editor-heading { position: sticky; z-index: 4; top: 0; min-height: 78px; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 13px 18px; border-bottom: 1px solid var(--line); background: rgba(255, 255, 255, 0.96); backdrop-filter: blur(12px); }
.heading-copy { min-width: 0; display: grid; gap: 2px; }
.heading-copy > span { color: var(--blue); font-size: 0.73rem; font-weight: 700; }
.heading-copy h2 { margin: 0; color: var(--navy); font-size: 1.1rem; }
.heading-copy small { overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
.save-area { display: flex; align-items: center; gap: 10px; }
.unsaved { color: #99630c; font-size: 0.72rem; white-space: nowrap; }
.report-section { margin: 16px 18px 0; overflow: hidden; border: 1px solid #e7c982; border-radius: var(--radius-control); background: #fffbef; }
.report-section.resolved { border-color: var(--line); background: var(--panel-subtle); }
.report-section > header { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 13px; border-bottom: 1px solid rgba(220, 188, 112, 0.45); }
.report-section header div { display: grid; gap: 2px; }
.report-section header strong { color: #765019; font-size: 0.86rem; }
.report-section header span { color: #8a7350; font-size: 0.72rem; }
.resolve-button { min-height: 34px; padding: 6px 10px; border: 1px solid #d7b768; border-radius: var(--radius-small); background: white; color: #7d5512; cursor: pointer; font-size: 0.75rem; font-weight: 650; white-space: nowrap; }
.report-list { max-height: 230px; overflow: auto; }
.report-item { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 12px; padding: 11px 13px; border-bottom: 1px solid rgba(220, 188, 112, 0.32); }
.report-item:last-child { border-bottom: 0; }
.report-item.resolved { opacity: 0.58; }
.report-item > div { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.report-item strong { color: #4e4539; font-size: 0.78rem; }
.report-item small { color: var(--muted); }
.report-category { padding: 2px 6px; border-radius: 5px; background: #f4dfac; color: #79510e; font-size: 0.68rem; font-weight: 700; }
.report-item p { grid-column: 1 / -1; margin: 0; color: #5f564a; font-size: 0.8rem; line-height: 1.55; white-space: pre-wrap; }
.report-status { color: #8a5a0b; font-size: 0.7rem; font-weight: 700; }
.editor-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 20px 18px 25px; }
.span-full { grid-column: 1 / -1; }
.stem-input { min-height: 112px; }
.explanation-input { min-height: 180px; }
.option-fieldset, .knowledge-fieldset { min-width: 0; margin: 0; padding: 14px; border: 1px solid var(--line); border-radius: var(--radius-control); }
.option-fieldset legend, .knowledge-fieldset legend { padding: 0 6px; color: #364b5d; font-size: 0.92rem; font-weight: 650; }
.option-fieldset > p { margin: -2px 0 12px; color: var(--muted); font-size: 0.73rem; }
.option-editor-list { display: grid; gap: 8px; }
.option-editor { display: grid; grid-template-columns: 32px 42px minmax(0, 1fr) 32px; align-items: start; gap: 7px; }
.answer-toggle, .remove-option { width: 32px; height: 32px; margin-top: 5px; border: 1px solid var(--line-strong); border-radius: 50%; background: white; color: white; cursor: pointer; font-weight: 800; }
.answer-toggle.multiple { border-radius: 7px; }
.answer-toggle.correct { border-color: var(--green); background: var(--green); }
.option-label { width: 42px; min-height: 42px; margin-top: 0; border: 1px solid var(--line-strong); border-radius: 9px; color: var(--navy); text-align: center; text-transform: uppercase; font-weight: 750; }
.option-content { width: 100%; min-height: 62px; padding: 9px 10px; border: 1px solid var(--line-strong); border-radius: 9px; resize: vertical; color: var(--ink); line-height: 1.45; }
.remove-option { border-radius: 8px; color: var(--muted); font-size: 1.1rem; }
.remove-option:disabled { opacity: 0.35; cursor: not-allowed; }
.add-option { min-height: 38px; margin-top: 9px; padding: 7px 11px; border: 1px dashed var(--line-strong); border-radius: 8px; background: var(--panel-subtle); color: var(--blue); cursor: pointer; font-size: 0.8rem; font-weight: 650; }
.knowledge-options { display: flex; flex-wrap: wrap; gap: 7px; }
.knowledge-chip { min-height: 36px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; background: white; color: var(--muted); cursor: pointer; font-size: 0.77rem; }
.knowledge-chip.selected { border-color: var(--blue); background: var(--blue-soft); color: #215c83; font-weight: 650; }
.defective-toggle { display: flex; align-items: flex-start; gap: 10px; padding: 13px; border: 1px solid #e4cf9e; border-radius: var(--radius-control); background: #fffaf0; cursor: pointer; }
.defective-toggle input { width: 18px; height: 18px; margin-top: 2px; accent-color: var(--gold); }
.defective-toggle span { display: grid; gap: 3px; }
.defective-toggle strong { color: #70501d; font-size: 0.86rem; }
.defective-toggle small { color: #8b7655; line-height: 1.45; }
.validation-message { margin: 0; padding: 10px 12px; border-radius: 8px; background: var(--red-soft); color: #8c3333; font-size: 0.8rem; }
.editor-loading, .editor-empty { min-height: 620px; display: grid; place-content: center; justify-items: center; gap: 8px; color: var(--muted); text-align: center; }
.editor-empty strong { color: var(--navy); }
.editor-empty span { font-size: 0.8rem; }
.editor-skeleton { width: min(520px, 70%); height: 310px; border-radius: var(--radius); background: #e8eef1; animation: pulse 1.2s ease-in-out infinite alternate; }
@keyframes pulse { to { opacity: 0.45; } }
@media (max-width: 680px) { .editor-heading { align-items: flex-start; } .save-area { align-items: flex-end; flex-direction: column-reverse; } .editor-fields { grid-template-columns: 1fr; padding-inline: 14px; } .span-full { grid-column: 1; } .report-section { margin-inline: 14px; } .report-section > header { align-items: stretch; flex-direction: column; } .option-editor { grid-template-columns: 32px 38px minmax(0, 1fr); } .remove-option { grid-column: 3; justify-self: end; margin-top: -2px; } }
</style>
