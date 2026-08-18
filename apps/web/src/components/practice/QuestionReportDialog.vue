<script setup lang="ts">
import { nextTick, reactive, shallowRef, watch } from 'vue'

import { api } from '@/lib/api'
import type { QuestionReportCategory } from '@/types'

const props = defineProps<{
  open: boolean
  questionId: number
  questionLabel: string
}>()

const emit = defineEmits<{
  close: []
  submitted: []
}>()

const form = reactive<{ category: QuestionReportCategory; message: string }>({
  category: 'answer',
  message: '',
})
const submitting = shallowRef(false)
const submitted = shallowRef(false)
const error = shallowRef('')
const categorySelect = shallowRef<HTMLSelectElement | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    Object.assign(form, { category: 'answer', message: '' })
    submitting.value = false
    submitted.value = false
    error.value = ''
    await nextTick()
    categorySelect.value?.focus()
  },
)

function close(): void {
  if (!submitting.value) emit('close')
}

async function submit(): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    await api(`/practice/questions/${props.questionId}/reports`, {
      method: 'POST',
      body: JSON.stringify(form),
    })
    submitted.value = true
    emit('submitted')
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '提交报错失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="report-overlay"
      role="presentation"
      @click.self="close"
      @keydown.esc="close"
    >
      <section class="report-dialog panel" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <template v-if="submitted">
          <div class="success-mark" aria-hidden="true">✓</div>
          <h2 id="report-title">已收到你的反馈</h2>
          <p>管理员会在题目管理中优先看到这道题。再次报告会更新你之前的反馈，不会重复计数。</p>
          <button class="button full" type="button" @click="close">知道了</button>
        </template>
        <template v-else>
          <header class="dialog-heading">
            <div>
              <span class="eyebrow">{{ questionLabel }}</span>
              <h2 id="report-title">报告题目错误</h2>
            </div>
            <button class="close-button" type="button" aria-label="关闭" @click="close">×</button>
          </header>
          <form class="report-form" @submit.prevent="submit">
            <label class="field">
              <span class="field-label">哪里有问题？</span>
              <select ref="categorySelect" v-model="form.category" class="select">
                <option value="stem">题干有误</option>
                <option value="option">选项有误</option>
                <option value="answer">答案有误</option>
                <option value="explanation">解析有误</option>
                <option value="other">其他问题</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">补充说明 <small>选填</small></span>
              <textarea
                v-model.trim="form.message"
                class="textarea"
                maxlength="1000"
                placeholder="例如：B 选项表述不完整，正确答案应为 A、C。"
              />
              <span class="counter">{{ form.message.length }} / 1000</span>
            </label>
            <p class="privacy-note">反馈会带上你的账号名称，便于管理员确认问题；其他学习用户不会看到。</p>
            <p v-if="error" class="error-message">{{ error }}</p>
            <div class="dialog-actions">
              <button class="button secondary" type="button" :disabled="submitting" @click="close">取消</button>
              <button class="button" type="submit" :disabled="submitting">
                {{ submitting ? '提交中…' : '提交报告' }}
              </button>
            </div>
          </form>
        </template>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.report-overlay { position: fixed; z-index: 80; inset: 0; display: grid; place-items: center; padding: 20px; background: rgba(17, 39, 55, 0.42); backdrop-filter: blur(5px); }
.report-dialog { width: min(520px, 100%); max-height: min(720px, calc(100vh - 40px)); overflow: auto; padding: 25px; box-shadow: 0 24px 70px rgba(17, 39, 55, 0.24); }
.dialog-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
.dialog-heading h2, .report-dialog > h2 { margin: 4px 0 0; color: var(--navy); font-size: 1.28rem; }
.eyebrow { color: var(--blue); font-size: 0.78rem; font-weight: 700; }
.close-button { width: 38px; height: 38px; border: 0; border-radius: var(--radius-small); background: var(--panel-subtle); color: var(--muted); cursor: pointer; font-size: 1.35rem; }
.report-form { display: grid; gap: 17px; }
.field-label { display: flex; justify-content: space-between; }
.field-label small { color: var(--muted); font-weight: 500; }
.textarea { min-height: 126px; }
.counter { justify-self: end; margin-top: -4px; color: var(--muted); font-size: 0.75rem; }
.privacy-note { margin: -2px 0 0; color: var(--muted); font-size: 0.78rem; line-height: 1.55; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; }
.success-mark { width: 54px; height: 54px; display: grid; place-items: center; margin-bottom: 17px; border-radius: 50%; background: var(--green-soft); color: var(--green); font-size: 1.5rem; font-weight: 800; }
.report-dialog > p { margin: 10px 0 24px; color: var(--muted); line-height: 1.7; }
@media (max-width: 560px) { .report-overlay { align-items: end; padding: 0; } .report-dialog { width: 100%; max-height: calc(88vh - env(safe-area-inset-bottom)); padding: 22px 18px calc(20px + env(safe-area-inset-bottom)); border-radius: 18px 18px 0 0; } .dialog-actions .button { flex: 1; } }
</style>
