<script setup lang="ts">
import { reactive, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const form = reactive({ username: '', password: '' })
const submitting = shallowRef(false)
const error = shallowRef('')
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

async function submit(): Promise<void> {
  submitting.value = true
  error.value = ''
  try {
    await auth.login(form.username, form.password)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '登录失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-card panel">
      <div class="login-brand">
        <img class="login-icon" src="/app-icon.svg" alt="" />
        <div>
          <span class="login-kicker">知练</span>
          <h1>知练刷题</h1>
          <p>把每一次练习，都变成看得见的进步</p>
        </div>
      </div>

      <div class="login-content">
        <div class="login-heading">
          <h2>登录继续学习</h2>
          <p>你的进度、错题和收藏会回到原来的位置。</p>
        </div>
        <form class="login-form" @submit.prevent="submit">
          <label class="field">
            <span class="field-label">用户名</span>
            <input v-model.trim="form.username" class="input" autocomplete="username" required />
          </label>
          <label class="field">
            <span class="field-label">密码</span>
            <input v-model="form.password" class="input" type="password" autocomplete="current-password" required />
          </label>
          <p v-if="error" class="error-message" role="alert">{{ error }}</p>
          <button class="button full" type="submit" :disabled="submitting">
            {{ submitting ? '正在登录…' : '登录' }}
          </button>
        </form>

        <p class="login-note">账号由管理员创建。首次部署请使用环境变量中设置的管理员账号。</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--canvas); }
.login-card { width: min(760px, 100%); display: grid; grid-template-columns: minmax(240px, 0.85fr) minmax(340px, 1.15fr); overflow: hidden; }
.login-brand { display: grid; align-content: center; gap: 24px; min-height: 480px; padding: 42px 34px; background: var(--navy); }
.login-icon { width: 64px; height: 64px; border-radius: 15px; box-shadow: 0 10px 24px rgba(4, 23, 37, 0.25); }
.login-kicker { display: block; margin-bottom: 8px; color: #8bc7e1; font-size: 0.78rem; font-weight: 720; letter-spacing: 0.12em; }
.login-brand h1 { margin-bottom: 8px; color: white; font-size: 1.75rem; letter-spacing: -0.02em; }
.login-brand p { max-width: 230px; margin-bottom: 0; color: #bfd1dc; font-size: 0.9rem; line-height: 1.65; }
.login-content { display: grid; align-content: center; padding: 42px; background: white; }
.login-heading { margin-bottom: 24px; }
.login-heading h2 { margin-bottom: 7px; color: var(--navy); font-size: 1.28rem; }
.login-heading p { margin: 0; color: var(--muted); font-size: 0.84rem; line-height: 1.55; }
.login-form { display: grid; gap: 17px; }
.login-note { margin: 22px 0 0; color: var(--muted); text-align: center; font-size: 0.8rem; line-height: 1.6; }
@media (max-width: 680px) { .login-page { padding: 16px; } .login-card { grid-template-columns: 1fr; } .login-brand { min-height: 0; grid-template-columns: 52px 1fr; align-items: center; gap: 15px; padding: 23px; } .login-icon { width: 52px; height: 52px; } .login-kicker { display: none; } .login-brand h1 { margin-bottom: 3px; font-size: 1.3rem; } .login-brand p { max-width: none; font-size: 0.78rem; } .login-content { padding: 28px 23px; } }
</style>
