<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'

import QuestionAdminFilters from '@/components/admin/QuestionAdminFilters.vue'
import QuestionAdminList from '@/components/admin/QuestionAdminList.vue'
import QuestionEditorPanel from '@/components/admin/QuestionEditorPanel.vue'
import AdminSectionNav from '@/components/admin/AdminSectionNav.vue'
import { useQuestionAdmin } from '@/composables/useQuestionAdmin'

const {
  subjects,
  items,
  detail,
  filters,
  page,
  pageSize,
  total,
  selectedId,
  loading,
  detailLoading,
  saving,
  error,
  notice,
  initialize,
  updateFilters,
  setPage,
  selectQuestion,
  saveQuestion,
  resolveReports,
} = useQuestionAdmin()

const editorDirty = shallowRef(false)

onMounted(initialize)

function selectWithGuard(questionId: number): void {
  if (questionId === selectedId.value) return
  if (editorDirty.value && !window.confirm('当前题目有未保存修改，确定切换到其他题目吗？')) return
  editorDirty.value = false
  void selectQuestion(questionId)
}

function updateFiltersWithGuard(change: Parameters<typeof updateFilters>[0]): void {
  if (editorDirty.value && !window.confirm('当前题目有未保存修改，确定更改筛选条件吗？')) return
  editorDirty.value = false
  updateFilters(change)
}

function setPageWithGuard(nextPage: number): void {
  if (editorDirty.value && !window.confirm('当前题目有未保存修改，确定切换页面吗？')) return
  editorDirty.value = false
  setPage(nextPage)
}
</script>

<template>
  <div class="page question-admin-page">
    <AdminSectionNav />
    <header class="page-header admin-page-header">
      <div>
        <h1 class="page-title">题目管理</h1>
        <p class="page-subtitle">检索并校订题干、选项、答案与解析，优先处理学习用户报告的问题。</p>
      </div>
      <div class="header-note">
        <strong>{{ total }}</strong>
        <span>道匹配题目</span>
      </div>
    </header>

    <QuestionAdminFilters
      :filters="filters"
      :subjects="subjects"
      :total="total"
      @update="updateFiltersWithGuard"
    />

    <p v-if="notice" class="notice-message">{{ notice }}</p>
    <p v-if="error" class="error-message page-message">{{ error }}</p>

    <div class="management-workspace">
      <QuestionAdminList
        :items="items"
        :selected-id="selectedId"
        :loading="loading"
        :page="page"
        :page-size="pageSize"
        :total="total"
        @select="selectWithGuard"
        @page="setPageWithGuard"
      />
      <QuestionEditorPanel
        :question="detail"
        :subjects="subjects"
        :loading="detailLoading"
        :saving="saving"
        @save="saveQuestion"
        @resolve-reports="resolveReports"
        @dirty-change="editorDirty = $event"
      />
    </div>
  </div>
</template>

<style scoped>
.question-admin-page { width: min(1480px, 100%); }
.admin-page-header { align-items: flex-end; }
.header-note { min-width: 112px; display: grid; justify-items: end; padding: 10px 0; }
.header-note strong { color: var(--navy); font-size: 1.4rem; }
.header-note span { color: var(--muted); font-size: 0.76rem; }
.management-workspace { display: grid; grid-template-columns: minmax(310px, 0.76fr) minmax(0, 1.55fr); align-items: start; gap: 14px; margin-top: 14px; }
.notice-message { margin: 12px 0 0; padding: 10px 13px; border: 1px solid #b9dccc; border-radius: var(--radius-control); background: var(--green-soft); color: #286d5b; }
.page-message { margin: 12px 0 0; }
@media (min-width: 901px) { .management-workspace > :first-child { position: sticky; top: 14px; max-height: calc(100vh - 28px); } }
@media (max-width: 900px) { .management-workspace { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .admin-page-header { align-items: stretch; } .header-note { display: none; } }
</style>
