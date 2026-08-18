<script setup lang="ts">
import { onMounted, reactive, ref, shallowRef } from 'vue'

import { api } from '@/lib/api'
import AdminSectionNav from '@/components/admin/AdminSectionNav.vue'

interface ManagedUser {
  id: number
  username: string
  displayName: string
  role: 'admin' | 'user'
  isActive: boolean
  createdAt: string
}

interface AiSettings {
  endpointUrl: string
  model: string
  apiKeyMasked: string
  systemPrompt: string
  updatedAt: string | null
}

const users = ref<ManagedUser[]>([])
const userLimit = shallowRef(5)
const loading = shallowRef(true)
const userError = shallowRef('')
const aiError = shallowRef('')
const notice = shallowRef('')
const creatingUser = shallowRef(false)
const savingAi = shallowRef(false)
const userForm = reactive({ username: '', displayName: '', password: '' })
const aiForm = reactive({ endpointUrl: '', model: '', apiKey: '', systemPrompt: '' })

async function load(): Promise<void> {
  loading.value = true
  try {
    const [userPayload, aiPayload] = await Promise.all([
      api<{ users: ManagedUser[]; userLimit: number }>('/admin/users'),
      api<{ settings: AiSettings }>('/admin/ai/settings'),
    ])
    users.value = userPayload.users
    userLimit.value = userPayload.userLimit
    Object.assign(aiForm, {
      endpointUrl: aiPayload.settings.endpointUrl,
      model: aiPayload.settings.model,
      apiKey: '',
      systemPrompt: aiPayload.settings.systemPrompt,
    })
  } catch (caught) {
    userError.value = caught instanceof Error ? caught.message : '管理数据加载失败'
  } finally {
    loading.value = false
  }
}

async function createUser(): Promise<void> {
  creatingUser.value = true
  userError.value = ''
  notice.value = ''
  try {
    await api('/admin/users', { method: 'POST', body: JSON.stringify(userForm) })
    Object.assign(userForm, { username: '', displayName: '', password: '' })
    notice.value = '学习账号已创建'
    const payload = await api<{ users: ManagedUser[]; userLimit: number }>('/admin/users')
    users.value = payload.users
  } catch (caught) {
    userError.value = caught instanceof Error ? caught.message : '创建用户失败'
  } finally {
    creatingUser.value = false
  }
}

async function toggleUser(user: ManagedUser): Promise<void> {
  userError.value = ''
  try {
    await api(`/admin/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !user.isActive }),
    })
    users.value = users.value.map((item) => item.id === user.id ? { ...item, isActive: !item.isActive } : item)
  } catch (caught) {
    userError.value = caught instanceof Error ? caught.message : '修改用户失败'
  }
}

async function saveAi(): Promise<void> {
  savingAi.value = true
  aiError.value = ''
  notice.value = ''
  try {
    await api('/admin/ai/settings', {
      method: 'PUT',
      body: JSON.stringify({
        endpointUrl: aiForm.endpointUrl,
        model: aiForm.model,
        ...(aiForm.apiKey ? { apiKey: aiForm.apiKey } : {}),
        systemPrompt: aiForm.systemPrompt,
      }),
    })
    aiForm.apiKey = ''
    notice.value = 'AI 服务配置已安全保存'
  } catch (caught) {
    aiError.value = caught instanceof Error ? caught.message : '保存 AI 配置失败'
  } finally {
    savingAi.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page admin-page">
    <AdminSectionNav />
    <header class="page-header">
      <div>
        <h1 class="page-title">系统管理</h1>
        <p class="page-subtitle">管理学习账号、AI 快问服务与题库内容。</p>
      </div>
    </header>

    <div v-if="loading" class="loading-block"><span class="spinner" /></div>
    <template v-else>
      <p v-if="notice" class="notice-message">{{ notice }}</p>
      <section class="admin-section panel">
        <div class="admin-heading">
          <div><h2>用户账号</h2><p>当前 {{ users.filter((user) => user.isActive).length }} / {{ userLimit }} 个启用账号</p></div>
        </div>
        <form class="user-form" @submit.prevent="createUser">
          <label class="field"><span class="field-label">用户名</span><input v-model.trim="userForm.username" class="input" placeholder="例如 xiaoming" required minlength="3" /></label>
          <label class="field"><span class="field-label">显示名称</span><input v-model.trim="userForm.displayName" class="input" placeholder="例如 小明" required /></label>
          <label class="field"><span class="field-label">初始密码</span><input v-model="userForm.password" class="input" type="password" autocomplete="new-password" required minlength="8" /></label>
          <button class="button" type="submit" :disabled="creatingUser">{{ creatingUser ? '创建中…' : '创建账号' }}</button>
        </form>
        <p v-if="userError" class="error-message">{{ userError }}</p>
        <div class="user-list">
          <div v-for="user in users" :key="user.id" class="user-row">
            <div class="user-avatar">{{ user.displayName.slice(0, 1) }}</div>
            <div class="user-copy"><strong>{{ user.displayName }}</strong><span>@{{ user.username }} · {{ user.role === 'admin' ? '管理员' : '学习账号' }}</span></div>
            <span class="status" :class="{ off: !user.isActive }">{{ user.isActive ? '已启用' : '已停用' }}</span>
            <button v-if="user.role !== 'admin'" class="button secondary compact" type="button" @click="toggleUser(user)">{{ user.isActive ? '停用' : '启用' }}</button>
          </div>
        </div>
      </section>

      <section class="admin-section panel">
        <div class="admin-heading">
          <div><h2>AI 快问服务</h2><p>支持 OpenAI 兼容的 Chat Completions 或 Responses 接口。</p></div>
          <span class="secure-note">Key 加密存储</span>
        </div>
        <form class="ai-form" @submit.prevent="saveAi">
          <label class="field wide"><span class="field-label">完整接口 URL</span><input v-model.trim="aiForm.endpointUrl" class="input" type="url" placeholder="https://example.com/v1/chat/completions" required /></label>
          <label class="field"><span class="field-label">模型名称</span><input v-model.trim="aiForm.model" class="input" placeholder="模型 ID" required /></label>
          <label class="field"><span class="field-label">API Key</span><input v-model.trim="aiForm.apiKey" class="input" type="password" autocomplete="off" placeholder="留空表示不修改" /></label>
          <label class="field wide"><span class="field-label">助教系统提示词</span><textarea v-model.trim="aiForm.systemPrompt" class="textarea" required /></label>
          <p v-if="aiError" class="error-message wide">{{ aiError }}</p>
          <button class="button ai-save" type="submit" :disabled="savingAi">{{ savingAi ? '保存中…' : '保存 AI 配置' }}</button>
        </form>
      </section>
    </template>
  </div>
</template>

<style scoped>
.admin-page { display: grid; gap: 16px; }
.admin-section { padding: 24px 25px; }
.admin-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 20px; padding-left: 12px; border-left: 3px solid var(--blue); }
.admin-heading h2 { margin-bottom: 4px; color: var(--navy); font-size: 1.15rem; }
.admin-heading p { margin-bottom: 0; color: var(--muted); font-size: 0.84rem; }
.user-form { display: grid; grid-template-columns: 1fr 1fr 1fr auto; align-items: end; gap: 11px; padding-bottom: 22px; border-bottom: 1px solid var(--line); }
.user-list { display: grid; }
.user-row { display: grid; grid-template-columns: 40px 1fr auto auto; align-items: center; gap: 12px; padding: 14px 0; border-bottom: 1px solid #edf1f3; }
.user-row:last-child { border-bottom: 0; }
.user-avatar { width: 40px; height: 40px; display: grid; place-items: center; border-radius: var(--radius-control); background: var(--blue-soft); color: var(--blue); font-weight: 750; }
.user-copy { display: grid; gap: 3px; }
.user-copy strong { color: #344a5a; }
.user-copy span { color: var(--muted); font-size: 0.78rem; }
.status { padding: 4px 8px; border-radius: var(--radius-small); background: var(--green-soft); color: var(--green); font-size: 0.76rem; font-weight: 650; }
.status.off { background: #edf1f3; color: var(--muted); }
.secure-note { padding: 6px 9px; border-radius: var(--radius-small); background: var(--green-soft); color: var(--green); font-size: 0.78rem; font-weight: 650; }
.ai-form { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.wide { grid-column: 1 / -1; }
.ai-save { grid-column: 2; justify-self: end; }
.notice-message { margin: 0; padding: 11px 14px; border: 1px solid #b9dccc; border-radius: var(--radius-control); background: var(--green-soft); color: #286d5b; }
.admin-section > .error-message { margin-top: 14px; }
@media (max-width: 940px) { .user-form { grid-template-columns: 1fr 1fr; } }
@media (max-width: 620px) { .admin-section { padding: 18px; } .user-form, .ai-form { grid-template-columns: 1fr; } .wide, .ai-save { grid-column: 1; } .ai-save { width: 100%; } .user-row { grid-template-columns: 40px 1fr auto; } .user-row > .button { grid-column: 2 / -1; } .status { grid-column: 3; grid-row: 1; } }
</style>
