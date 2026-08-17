<script setup lang="ts">
defineProps<{
  items: ReadonlyArray<{
    label: string
    value: string | number
    suffix?: string
    detail: string
    to?: string
    tone?: 'primary' | 'warning'
  }>
}>()
</script>

<template>
  <section class="metric-strip panel" aria-label="学习概况">
    <template v-for="item in items" :key="item.label">
      <RouterLink
        v-if="item.to"
        class="metric-item metric-link"
        :class="item.tone"
        :to="item.to"
      >
        <span class="metric-label">{{ item.label }}</span>
        <span class="metric-value">{{ item.value }}<small v-if="item.suffix">{{ item.suffix }}</small></span>
        <span class="metric-detail">{{ item.detail }}</span>
      </RouterLink>
      <div v-else class="metric-item" :class="item.tone">
        <span class="metric-label">{{ item.label }}</span>
        <span class="metric-value">{{ item.value }}<small v-if="item.suffix">{{ item.suffix }}</small></span>
        <span class="metric-detail">{{ item.detail }}</span>
      </div>
    </template>
  </section>
</template>

<style scoped>
.metric-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  overflow: hidden;
}

.metric-item {
  position: relative;
  min-width: 0;
  display: grid;
  align-content: center;
  gap: 5px;
  min-height: 124px;
  padding: 20px 22px;
}

.metric-item + .metric-item::before {
  position: absolute;
  inset: 20px auto 20px 0;
  width: 1px;
  background: var(--line);
  content: '';
}

.metric-label {
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 650;
}

.metric-value {
  color: var(--navy);
  font-size: clamp(1.65rem, 2.4vw, 2rem);
  font-weight: 780;
  letter-spacing: -0.035em;
  line-height: 1.1;
}

.metric-value small {
  margin-left: 3px;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0;
}

.metric-detail {
  overflow: hidden;
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-item.primary {
  background: var(--blue-soft);
}

.metric-item.primary .metric-label,
.metric-item.primary .metric-value {
  color: var(--blue-strong);
}

.metric-item.warning .metric-value {
  color: #9b6312;
}

.metric-link {
  transition: background-color 120ms ease;
}

.metric-link:hover {
  background: var(--panel-subtle);
}

.metric-link.primary:hover {
  background: #dfedf3;
}

@media (max-width: 940px) {
  .metric-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .metric-item:nth-child(3)::before { display: none; }
  .metric-item:nth-child(n + 3) { border-top: 1px solid var(--line); }
}

@media (max-width: 460px) {
  .metric-item { min-height: 106px; padding: 16px; }
  .metric-detail { white-space: normal; }
}
</style>
