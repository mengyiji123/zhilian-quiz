import { readonly, ref, shallowRef } from 'vue'

import { api, ApiError } from '@/lib/api'
import { readNdjson } from '@/lib/ndjson'

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
  streaming?: boolean
}

type AiStreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export function useAiTutor() {
  const isOpen = shallowRef(false)
  const questionId = shallowRef<number | null>(null)
  const messages = ref<AiMessage[]>([])
  const sending = shallowRef(false)
  const loading = shallowRef(false)
  const error = shallowRef('')

  async function open(id: number): Promise<void> {
    questionId.value = id
    isOpen.value = true
    loading.value = true
    error.value = ''
    try {
      const payload = await api<{ messages: AiMessage[] }>(`/ai/questions/${id}/messages`)
      messages.value = payload.messages
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '无法加载 AI 对话'
    } finally {
      loading.value = false
    }
  }

  function close(): void {
    isOpen.value = false
  }

  async function send(content: string): Promise<void> {
    const id = questionId.value
    if (!id || !content.trim() || sending.value) return
    const initialLength = messages.value.length
    const userMessage: AiMessage = { role: 'user', content: content.trim() }
    const assistantMessage: AiMessage = { role: 'assistant', content: '', streaming: true }
    messages.value = [...messages.value, userMessage, assistantMessage]
    const assistantIndex = messages.value.length - 1
    sending.value = true
    error.value = ''
    try {
      const response = await fetch(`/api/ai/questions/${id}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content.trim() }),
        credentials: 'same-origin',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: '询问 AI 失败' })) as { error?: string }
        throw new ApiError(payload.error ?? `询问 AI 失败（${response.status}）`, response.status)
      }
      if (!response.body) throw new Error('浏览器无法读取 AI 流式回答')

      let completed = false
      for await (const event of readNdjson<AiStreamEvent>(response.body)) {
        if (event.type === 'error') throw new Error(event.message)
        if (event.type === 'done') {
          completed = true
          break
        }
        const current = messages.value[assistantIndex]
        if (current) {
          messages.value[assistantIndex] = { ...current, content: current.content + event.content }
        }
      }
      if (!completed) throw new Error('AI 回答连接意外中断')
      const current = messages.value[assistantIndex]
      if (current) messages.value[assistantIndex] = { ...current, streaming: false }
    } catch (caught) {
      const partialAnswer = messages.value[assistantIndex]?.content ?? ''
      if (partialAnswer) {
        const current = messages.value[assistantIndex]
        if (current) messages.value[assistantIndex] = { ...current, streaming: false }
      } else {
        messages.value = messages.value.slice(0, initialLength)
      }
      error.value = caught instanceof Error ? caught.message : '询问 AI 失败'
    } finally {
      sending.value = false
    }
  }

  return {
    isOpen: readonly(isOpen),
    messages: readonly(messages),
    sending: readonly(sending),
    loading: readonly(loading),
    error: readonly(error),
    open,
    close,
    send,
  }
}
