<script setup lang="ts">
import { nextTick, shallowRef, useTemplateRef, watch } from 'vue'

import MarkdownContent from '@/components/practice/MarkdownContent.vue'
import type { AiMessage } from '@/composables/useAiTutor'

const props = defineProps<{
  open: boolean
  messages: readonly AiMessage[]
  sending: boolean
  loading: boolean
  error: string
}>()

const emit = defineEmits<{ close: []; send: [message: string] }>()
const draft = shallowRef('')
const messageListRef = useTemplateRef<HTMLElement>('messageList')

function submit(): void {
  const value = draft.value.trim()
  if (!value || props.sending) return
  emit('send', value)
  draft.value = ''
}

watch(
  () => {
    const lastMessage = props.messages.at(-1)
    return `${props.messages.length}:${lastMessage?.content.length ?? 0}`
  },
  async () => {
    await nextTick()
    messageListRef.value?.scrollTo({ top: messageListRef.value.scrollHeight, behavior: 'auto' })
  },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ai-layer">
      <button class="ai-backdrop" type="button" aria-label="关闭 AI 助教" @click="$emit('close')" />
      <aside class="ai-drawer" role="dialog" aria-modal="true" aria-label="AI 题目助教">
        <header class="ai-header">
          <div><strong>AI 题目助教</strong><span>当前题目与解析会自动作为上下文</span></div>
          <button class="close-button" type="button" aria-label="关闭" @click="$emit('close')">×</button>
        </header>
        <section ref="messageList" class="message-list" aria-live="polite">
          <div v-if="loading" class="loading-block"><span class="spinner" /></div>
          <div v-else-if="!messages.length" class="ai-welcome">
            <span>AI</span>
            <h2>这道题哪里不清楚？</h2>
            <p>可以问“为什么选 A”“另外几个选项错在哪”或“帮我换个例子解释”。</p>
          </div>
          <article v-for="(message, index) in messages" :key="`${message.role}-${index}`" class="message" :class="message.role">
            <span class="message-role">{{ message.role === 'user' ? '我' : 'AI' }}</span>
            <p v-if="message.role === 'user'" class="message-bubble">{{ message.content }}</p>
            <div v-else class="message-bubble assistant-bubble">
              <MarkdownContent v-if="message.content" :content="message.content" />
              <span v-else class="thinking-copy">正在思考…</span>
              <span v-if="message.streaming" class="stream-cursor" aria-hidden="true" />
            </div>
          </article>
        </section>
        <footer class="composer">
          <p v-if="error" class="error-message">{{ error }}</p>
          <form @submit.prevent="submit">
            <textarea v-model="draft" class="textarea" rows="3" maxlength="2000" placeholder="输入你对这道题的疑问…" @keydown.ctrl.enter="submit" />
            <button class="button" type="submit" :disabled="sending || !draft.trim()">发送</button>
          </form>
          <small>AI 回答可能有误，请结合校订解析判断。</small>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.ai-layer { position: fixed; z-index: 110; inset: 0; }
.ai-backdrop { position: absolute; inset: 0; width: 100%; border: 0; background: rgba(15, 30, 43, 0.38); backdrop-filter: blur(3px); }
.ai-drawer { position: absolute; inset: 0 0 0 auto; width: min(480px, 92vw); display: grid; grid-template-rows: auto 1fr auto; background: #f4f7f8; box-shadow: -18px 0 45px rgba(15, 30, 43, 0.18); }
.ai-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: calc(18px + env(safe-area-inset-top)) 20px 18px; border-bottom: 1px solid var(--line); background: white; }
.ai-header div { display: grid; gap: 3px; }
.ai-header strong { color: var(--navy); font-size: 1.05rem; }
.ai-header span { color: var(--muted); font-size: 0.78rem; }
.close-button { width: 40px; height: 40px; border: 0; border-radius: 10px; background: #eef3f6; color: var(--navy); cursor: pointer; font-size: 1.4rem; }
.message-list { overflow-y: auto; padding: 20px; }
.ai-welcome { display: grid; justify-items: center; padding: 50px 15px; text-align: center; }
.ai-welcome > span { width: 52px; height: 52px; display: grid; place-items: center; border-radius: 15px; background: var(--blue-soft); color: var(--blue); font-weight: 800; }
.ai-welcome h2 { margin: 15px 0 7px; color: var(--navy); font-size: 1.1rem; }
.ai-welcome p { max-width: 330px; margin: 0; color: var(--muted); line-height: 1.65; font-size: 0.87rem; }
.message { display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: start; gap: 9px; margin-bottom: 15px; }
.message-role { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 9px; background: var(--navy); color: white; font-size: 0.74rem; font-weight: 750; }
.message.user .message-role { background: #8da3b2; }
.message-bubble { min-width: 0; margin: 0; padding: 11px 13px; border: 1px solid var(--line); border-radius: 4px 13px 13px; background: white; color: #334957; line-height: 1.7; }
.message.user .message-bubble { border-radius: 13px 4px 13px 13px; background: var(--blue-soft); white-space: pre-wrap; }
.assistant-bubble { position: relative; }
.thinking-copy { color: var(--muted); }
.stream-cursor { position: absolute; right: 9px; bottom: 11px; width: 3px; height: 14px; border-radius: 2px; background: var(--blue); animation: cursor-pulse 780ms ease-in-out infinite; }
.composer { padding: 14px 16px calc(14px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line); background: white; }
.composer form { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 8px; }
.composer .textarea { min-height: 76px; }
.composer small { display: block; margin-top: 7px; color: var(--muted); text-align: center; font-size: 0.72rem; }
.composer .error-message { margin-bottom: 9px; }
@media (max-width: 560px) { .ai-drawer { width: 100%; } }
@keyframes cursor-pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
</style>
