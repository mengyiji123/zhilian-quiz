<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const learningNavigation = computed(() => [
  { to: '/', label: '首页', glyph: '⌂' },
  { to: '/practice/setup', label: '刷题', glyph: '✓' },
  { to: '/wrong', label: '错题', glyph: '!' },
  { to: '/favorites', label: '收藏', glyph: '☆' },
  { to: '/stats', label: '统计', glyph: '▥' },
])

const adminNavigation = computed(() => auth.isAdmin
  ? [
      { to: '/admin/questions', label: '题库管理', glyph: '题' },
      { to: '/admin', label: '系统设置', glyph: '⚙' },
    ]
  : [])

const bottomNavigation = computed(() => [
  ...learningNavigation.value,
  ...(auth.isAdmin ? [{ to: '/admin/questions', label: '管理', glyph: '题' }] : []),
])

async function logout(): Promise<void> {
  await auth.logout()
  await router.replace('/login')
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink class="brand" to="/">
        <img class="brand-icon" src="/app-icon.svg" alt="" />
        <span>知练</span>
      </RouterLink>

      <nav class="side-nav" aria-label="主要导航">
        <RouterLink v-for="item in learningNavigation" :key="item.to" class="nav-link" :to="item.to">
          <span class="nav-glyph" aria-hidden="true">{{ item.glyph }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <nav v-if="adminNavigation.length" class="side-nav admin-nav" aria-label="管理导航">
        <span class="nav-section-label">管理工具</span>
        <RouterLink v-for="item in adminNavigation" :key="item.to" class="nav-link" :to="item.to">
          <span class="nav-glyph" aria-hidden="true">{{ item.glyph }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="account">
        <div class="avatar">{{ auth.user?.displayName.slice(0, 1) }}</div>
        <div class="account-copy">
          <strong>{{ auth.user?.displayName }}</strong>
          <small>{{ auth.isAdmin ? '管理员' : '学习账号' }}</small>
        </div>
        <button class="logout" type="button" aria-label="退出登录" title="退出登录" @click="logout">↪</button>
      </div>
    </aside>

    <main class="main-content">
      <RouterView />
    </main>

    <nav class="bottom-nav" aria-label="移动端主要导航">
      <RouterLink v-for="item in bottomNavigation" :key="item.to" class="bottom-link" :to="item.to">
        <span class="bottom-glyph" aria-hidden="true">{{ item.glyph }}</span>
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.app-shell { min-height: 100vh; padding-left: 216px; }
.sidebar { position: fixed; z-index: 20; inset: 0 auto 0 0; width: 216px; display: flex; flex-direction: column; padding: 24px 16px 18px; border-right: 1px solid rgba(255, 255, 255, 0.08); background: var(--navy); color: #dce8f0; }
.brand { display: flex; align-items: center; gap: 11px; padding: 0 10px 25px; color: white; font-size: 1.28rem; font-weight: 780; letter-spacing: 0.06em; }
.brand-icon { width: 36px; height: 36px; border-radius: 9px; box-shadow: 0 7px 18px rgba(4, 23, 37, 0.2); }
.side-nav { display: grid; gap: 5px; }
.admin-nav { margin-top: 18px; padding-top: 15px; border-top: 1px solid rgba(255, 255, 255, 0.1); }
.nav-section-label { padding: 0 13px 5px; color: #819dab; font-size: 0.68rem; font-weight: 650; letter-spacing: 0.06em; }
.nav-link { position: relative; min-height: 48px; display: flex; align-items: center; gap: 12px; padding: 10px 13px; border-radius: var(--radius-control); color: #c5d4dd; font-weight: 600; transition: background-color 120ms ease, color 120ms ease, transform 120ms ease; }
.nav-link:hover { background: rgba(255, 255, 255, 0.07); color: white; }
.nav-link:active { transform: translateY(1px); }
.nav-link.router-link-exact-active { background: rgba(255, 255, 255, 0.13); color: white; }
.nav-link.router-link-exact-active::before { position: absolute; inset: 13px auto 13px 0; width: 3px; border-radius: 2px; background: #7bc0df; content: ''; }
.nav-glyph { width: 24px; text-align: center; font-size: 1.18rem; font-weight: 800; }
.account { margin-top: auto; display: grid; grid-template-columns: 40px 1fr 32px; align-items: center; gap: 10px; padding: 15px 9px 0; border-top: 1px solid rgba(255, 255, 255, 0.12); }
.avatar { width: 40px; height: 40px; display: grid; place-items: center; border-radius: var(--radius-control); background: #e4edf3; color: var(--navy); font-weight: 800; }
.account-copy { min-width: 0; display: grid; }
.account-copy strong { overflow: hidden; color: white; text-overflow: ellipsis; white-space: nowrap; font-size: 0.92rem; }
.account-copy small { margin-top: 2px; color: #a9bfcd; }
.logout { width: 32px; height: 32px; border: 0; border-radius: var(--radius-small); background: transparent; color: #c4d4de; cursor: pointer; font-size: 1.25rem; }
.logout:hover { background: rgba(255, 255, 255, 0.08); color: white; }
.main-content { min-height: 100vh; }
.bottom-nav { display: none; }

@media (max-width: 760px) {
  .app-shell { padding-left: 0; }
  .sidebar { display: none; }
  .bottom-nav { position: fixed; z-index: 30; inset: auto 0 0; display: flex; justify-content: space-around; min-height: calc(68px + env(safe-area-inset-bottom)); padding: 7px 6px env(safe-area-inset-bottom); border-top: 1px solid var(--line); background: rgba(255, 255, 255, 0.96); backdrop-filter: blur(16px); }
  .bottom-link { flex: 1; min-width: 0; display: grid; justify-items: center; align-content: center; gap: 2px; color: #71808d; font-size: 0.72rem; }
  .bottom-glyph { font-size: 1.2rem; line-height: 1.2; font-weight: 800; }
  .bottom-link.router-link-exact-active { color: var(--blue); }
}
</style>
