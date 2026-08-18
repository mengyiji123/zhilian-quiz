import { createRouter, createWebHistory } from 'vue-router'

import AppShell from '@/components/layout/AppShell.vue'
import { useAuthStore } from '@/stores/auth'
import AdminView from '@/views/AdminView.vue'
import AdminQuestionsView from '@/views/AdminQuestionsView.vue'
import DashboardView from '@/views/DashboardView.vue'
import LibraryView from '@/views/LibraryView.vue'
import LoginView from '@/views/LoginView.vue'
import PracticeSetupView from '@/views/PracticeSetupView.vue'
import PracticeView from '@/views/PracticeView.vue'
import StatsView from '@/views/StatsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    {
      path: '/',
      component: AppShell,
      children: [
        { path: '', name: 'dashboard', component: DashboardView },
        { path: 'practice/setup', name: 'practice-setup', component: PracticeSetupView },
        { path: 'practice/:sessionId', name: 'practice', component: PracticeView },
        { path: 'wrong', name: 'wrong', component: LibraryView, props: { kind: 'wrong' } },
        { path: 'favorites', name: 'favorites', component: LibraryView, props: { kind: 'favorites' } },
        { path: 'stats', name: 'stats', component: StatsView },
        { path: 'admin', name: 'admin', component: AdminView, meta: { admin: true } },
        { path: 'admin/questions', name: 'admin-questions', component: AdminQuestionsView, meta: { admin: true } },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.restore()
  if (!to.meta.public && !auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.name === 'login' && auth.isAuthenticated) return { name: 'dashboard' }
  if (to.meta.admin && !auth.isAdmin) return { name: 'dashboard' }
  return true
})
