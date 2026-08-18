<script setup lang="ts">
const items = [
  { to: '/admin/questions', label: '题库管理', description: '校订题目与处理报错' },
  { to: '/admin', label: '系统设置', description: '账号与 AI 服务配置' },
] as const
</script>

<template>
  <nav class="admin-section-nav" aria-label="管理功能">
    <RouterLink v-for="item in items" :key="item.to" class="admin-section-link" :to="item.to">
      <strong>{{ item.label }}</strong>
      <span>{{ item.description }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.admin-section-nav { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 22px; padding: 7px; border: 1px solid var(--line); border-radius: var(--radius); background: #e9eef1; }
.admin-section-link { min-width: 0; display: grid; gap: 2px; padding: 12px 14px; border: 1px solid transparent; border-radius: var(--radius-control); color: var(--muted); transition: border-color 120ms ease, background-color 120ms ease, color 120ms ease, transform 120ms ease; }
.admin-section-link:hover { background: rgba(255, 255, 255, 0.62); color: var(--navy); }
.admin-section-link:active { transform: translateY(1px); }
.admin-section-link strong { font-size: 0.91rem; }
.admin-section-link span { overflow: hidden; font-size: 0.72rem; text-overflow: ellipsis; white-space: nowrap; }
.admin-section-link.router-link-exact-active { border-color: #c9dce6; background: white; color: var(--navy); box-shadow: 0 5px 14px rgba(26, 57, 78, 0.07); }
.admin-section-link.router-link-exact-active strong { color: var(--blue); }
@media (max-width: 560px) { .admin-section-link { padding-inline: 10px; } .admin-section-link span { display: none; } }
</style>
