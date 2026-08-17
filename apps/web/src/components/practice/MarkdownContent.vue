<script setup lang="ts">
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { computed } from 'vue'

const props = defineProps<{
  content: string
}>()

const renderedHtml = computed(() => DOMPurify.sanitize(
  marked.parse(props.content, {
    async: false,
    breaks: true,
    gfm: true,
  }),
  {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['embed', 'iframe', 'img', 'object', 'style'],
    FORBID_ATTR: ['style'],
  },
))
</script>

<template>
  <div class="markdown-content" v-html="renderedHtml" />
</template>

<style scoped>
.markdown-content {
  min-width: 0;
  overflow-wrap: anywhere;
}

.markdown-content :deep(> :first-child) { margin-top: 0; }
.markdown-content :deep(> :last-child) { margin-bottom: 0; }
.markdown-content :deep(p) { margin: 0 0 0.75em; }
.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4) {
  margin: 1.05em 0 0.45em;
  color: var(--navy);
  line-height: 1.35;
}
.markdown-content :deep(h1) { font-size: 1.18rem; }
.markdown-content :deep(h2) { font-size: 1.08rem; }
.markdown-content :deep(h3),
.markdown-content :deep(h4) { font-size: 1rem; }
.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0.55em 0 0.8em;
  padding-left: 1.45em;
}
.markdown-content :deep(li + li) { margin-top: 0.32em; }
.markdown-content :deep(blockquote) {
  margin: 0.75em 0;
  padding: 0.25em 0 0.25em 0.8em;
  border-left: 3px solid #9bb9cc;
  color: var(--muted);
}
.markdown-content :deep(code) {
  padding: 0.12em 0.35em;
  border-radius: 5px;
  background: #edf2f5;
  color: #173d55;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.88em;
}
.markdown-content :deep(pre) {
  max-width: 100%;
  margin: 0.75em 0;
  padding: 11px 12px;
  overflow-x: auto;
  border: 1px solid #d8e1e6;
  border-radius: 9px;
  background: #172b38;
  color: #eff6f8;
  line-height: 1.55;
  -webkit-overflow-scrolling: touch;
}
.markdown-content :deep(pre code) {
  padding: 0;
  background: transparent;
  color: inherit;
  font-size: 0.82rem;
}
.markdown-content :deep(a) {
  color: var(--blue);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}
.markdown-content :deep(hr) {
  margin: 0.9em 0;
  border: 0;
  border-top: 1px solid var(--line);
}
.markdown-content :deep(table) {
  display: block;
  width: 100%;
  margin: 0.8em 0;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: 0.86rem;
  -webkit-overflow-scrolling: touch;
}
.markdown-content :deep(th),
.markdown-content :deep(td) {
  padding: 7px 9px;
  border: 1px solid #d8e1e6;
  text-align: left;
  white-space: nowrap;
}
.markdown-content :deep(th) { background: #edf3f6; }
</style>
