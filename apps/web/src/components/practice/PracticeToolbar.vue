<script setup lang="ts">
defineProps<{
  index: number
  total: number
  isFavorite: boolean
}>()

defineEmits<{
  toggleFavorite: []
  openDrawing: []
  openAnswerSheet: []
}>()
</script>

<template>
  <div class="practice-toolbar">
    <div class="progress-copy">
      <strong>{{ index + 1 }} / {{ total }}</strong>
      <div class="progress-track"><span :style="{ width: `${((index + 1) / total) * 100}%` }" /></div>
    </div>
    <div class="toolbar-actions">
      <button class="toolbar-button" type="button" @click="$emit('openAnswerSheet')">
        <span aria-hidden="true">▦</span> 答题卡
      </button>
      <button class="toolbar-button" type="button" @click="$emit('openDrawing')">
        <span aria-hidden="true">✎</span> 草稿
      </button>
      <button class="toolbar-button" :class="{ active: isFavorite }" type="button" @click="$emit('toggleFavorite')">
        <span aria-hidden="true">{{ isFavorite ? '★' : '☆' }}</span> 收藏
      </button>
    </div>
  </div>
</template>

<style scoped>
.practice-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 14px; }
.progress-copy { display: flex; align-items: center; gap: 12px; min-width: 220px; }
.progress-copy strong { color: var(--navy); font-variant-numeric: tabular-nums; white-space: nowrap; }
.progress-track { width: min(260px, 30vw); height: 6px; overflow: hidden; border-radius: 3px; background: #dbe4e9; }
.progress-track span { display: block; height: 100%; border-radius: inherit; background: var(--blue); transition: width 180ms ease; }
.toolbar-actions { display: flex; gap: 8px; }
.toolbar-button { min-height: 42px; display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border: 1px solid var(--line); border-radius: var(--radius-control); background: white; color: #405666; cursor: pointer; transition: transform 120ms ease, border-color 120ms ease, background-color 120ms ease; }
.toolbar-button:hover { border-color: var(--line-strong); background: var(--panel-subtle); }
.toolbar-button:active { transform: translateY(1px); }
.toolbar-button.active { border-color: #e7bd72; background: #fff7e8; color: #a76300; }
@media (max-width: 560px) { .progress-copy { min-width: 0; flex: 1; } .progress-track { width: 100%; } .toolbar-button { width: 44px; padding: 8px; justify-content: center; font-size: 0; } .toolbar-button span { font-size: 1.1rem; } }
</style>
