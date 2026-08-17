import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import { api } from '@/lib/api'
import type { User } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = shallowRef<User | null>(null)
  const initialized = shallowRef(false)
  const isAuthenticated = computed(() => Boolean(user.value))
  const isAdmin = computed(() => user.value?.role === 'admin')

  async function restore(): Promise<void> {
    if (initialized.value) return
    try {
      const payload = await api<{ user: User }>('/auth/me')
      user.value = payload.user
    } catch {
      user.value = null
    } finally {
      initialized.value = true
    }
  }

  async function login(username: string, password: string): Promise<void> {
    const payload = await api<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    user.value = payload.user
    initialized.value = true
  }

  async function logout(): Promise<void> {
    try {
      await api('/auth/logout', { method: 'POST' })
    } finally {
      user.value = null
    }
  }

  return { user, initialized, isAuthenticated, isAdmin, restore, login, logout }
})
