<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'

const props = defineProps<{
  open: boolean
  questionLabel: string
}>()

const emit = defineEmits<{ close: [] }>()
const canvasRef = useTemplateRef<HTMLCanvasElement>('drawingCanvas')
const drawing = shallowRef(false)
const color = shallowRef('#172d40')
const tool = shallowRef<'pen' | 'eraser'>('pen')
const baseWidth = shallowRef(3)
const backgroundTransparency = shallowRef(65)
const canvasStyle = computed(() => ({
  backgroundColor: `rgba(255, 255, 255, ${1 - backgroundTransparency.value / 100})`,
}))
const undoStack: string[] = []
let resizeObserver: ResizeObserver | null = null
let activePointerId: number | null = null

function context(): CanvasRenderingContext2D | null {
  return canvasRef.value?.getContext('2d') ?? null
}

function drawImage(dataUrl: string): Promise<void> {
  return new Promise((resolve) => {
    const canvas = canvasRef.value
    const ctx = context()
    if (!canvas || !ctx) return resolve()
    const image = new Image()
    image.onload = () => {
      ctx.save()
      ctx.globalCompositeOperation = 'source-over'
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      ctx.restore()
      resolve()
    }
    image.onerror = () => resolve()
    image.src = dataUrl
  })
}

async function sizeCanvas(): Promise<void> {
  const canvas = canvasRef.value
  if (!canvas || !props.open) return
  const previous = canvas.width && canvas.height ? canvas.toDataURL('image/png') : null
  const rect = canvas.getBoundingClientRect()
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.max(Math.round(rect.width * ratio), 1)
  canvas.height = Math.max(Math.round(rect.height * ratio), 1)
  const ctx = context()
  if (ctx) {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }
  if (previous) await drawImage(previous)
}

async function initialize(): Promise<void> {
  await nextTick()
  if (canvasRef.value && resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver.observe(canvasRef.value)
  }
  await sizeCanvas()
}

function point(event: PointerEvent): { x: number; y: number; pressure: number } {
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
    pressure: event.pressure > 0 ? event.pressure : 0.5,
  }
}

function beginStroke(event: PointerEvent): void {
  if (event.pointerType !== 'pen') return
  const canvas = canvasRef.value
  const ctx = context()
  if (!canvas || !ctx) return
  event.preventDefault()
  activePointerId = event.pointerId
  canvas.setPointerCapture(event.pointerId)
  undoStack.push(canvas.toDataURL('image/png'))
  if (undoStack.length > 20) undoStack.shift()
  drawing.value = true
  const current = point(event)
  ctx.beginPath()
  ctx.moveTo(current.x, current.y)
}

function continueStroke(event: PointerEvent): void {
  if (!drawing.value || event.pointerType !== 'pen' || event.pointerId !== activePointerId) return
  event.preventDefault()
  const ctx = context()
  if (!ctx) return
  const events = event.getCoalescedEvents?.() ?? [event]
  for (const item of events) {
    const current = point(item)
    ctx.globalCompositeOperation = tool.value === 'eraser' ? 'destination-out' : 'source-over'
    ctx.strokeStyle = color.value
    ctx.lineWidth = tool.value === 'eraser'
      ? baseWidth.value * 7
      : baseWidth.value * (0.55 + current.pressure * 1.25) * Math.min(window.devicePixelRatio || 1, 2)
    ctx.lineTo(current.x, current.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(current.x, current.y)
  }
}

function endStroke(event: PointerEvent): void {
  if (!drawing.value || event.pointerType !== 'pen' || event.pointerId !== activePointerId) return
  drawing.value = false
  if (canvasRef.value?.hasPointerCapture(event.pointerId)) {
    canvasRef.value.releasePointerCapture(event.pointerId)
  }
  activePointerId = null
  context()?.closePath()
}

async function undo(): Promise<void> {
  const snapshot = undoStack.pop()
  const canvas = canvasRef.value
  const ctx = context()
  if (!snapshot || !canvas || !ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  await drawImage(snapshot)
}

function clear(): void {
  const canvas = canvasRef.value
  const ctx = context()
  if (!canvas || !ctx) return
  undoStack.push(canvas.toDataURL('image/png'))
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

function close(): void {
  const canvas = canvasRef.value
  const ctx = context()
  if (canvas && ctx) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  drawing.value = false
  activePointerId = null
  undoStack.length = 0
  emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) void initialize()
  },
)

onMounted(() => {
  resizeObserver = new ResizeObserver(() => { void sizeCanvas() })
  if (canvasRef.value) resizeObserver.observe(canvasRef.value)
})

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="drawing-overlay" role="dialog" aria-modal="true" aria-label="题目草稿板">
      <section class="drawing-modal">
        <header class="drawing-header">
          <div><strong>草稿板</strong><span>{{ questionLabel }} · 仅 Apple Pencil / 手写笔可书写，手指触摸不会落笔</span></div>
          <button class="close-button" type="button" aria-label="关闭草稿板" @click="close">×</button>
        </header>
        <div class="drawing-tools">
          <button class="tool-button" :class="{ active: tool === 'pen' }" type="button" @click="tool = 'pen'">画笔</button>
          <button class="tool-button" :class="{ active: tool === 'eraser' }" type="button" @click="tool = 'eraser'">橡皮</button>
          <span class="tool-divider" />
          <button v-for="value in ['#172d40', '#bd4c4c', '#2c6f9f']" :key="value" class="color-button" :class="{ active: color === value }" type="button" :style="{ backgroundColor: value }" :aria-label="`使用颜色 ${value}`" @click="color = value; tool = 'pen'" />
          <label class="width-control">粗细 <input v-model.number="baseWidth" type="range" min="1" max="8" /></label>
          <label class="transparency-control">
            背景透明度
            <input v-model.number="backgroundTransparency" type="range" min="25" max="80" step="1" aria-label="草稿板背景透明度" />
            <output>{{ backgroundTransparency }}%</output>
          </label>
          <span class="tool-spacer" />
          <button class="tool-button" type="button" @click="undo">撤销</button>
          <button class="tool-button" type="button" @click="clear">清空</button>
        </div>
        <canvas
          ref="drawingCanvas"
          class="drawing-canvas"
          :style="canvasStyle"
          aria-label="仅支持手写笔输入的草稿画布"
          @pointerdown="beginStroke"
          @pointermove="continueStroke"
          @pointerup="endStroke"
          @pointercancel="endStroke"
        />
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.drawing-overlay { position: fixed; z-index: 100; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(15, 30, 43, 0.08); }
.drawing-modal { width: min(960px, 100%); height: min(760px, calc(100vh - 48px)); display: grid; grid-template-rows: auto auto 1fr; overflow: hidden; border: 1px solid rgba(205, 219, 227, 0.8); border-radius: 20px; background: rgba(226, 236, 241, 0.2); box-shadow: 0 18px 60px rgba(15, 30, 43, 0.2); }
.drawing-header { display: flex; align-items: center; justify-content: space-between; gap: 15px; padding: 14px 18px; background: rgba(255, 255, 255, 0.82); border-bottom: 1px solid rgba(205, 219, 227, 0.78); backdrop-filter: blur(4px); }
.drawing-header div { display: grid; gap: 3px; }
.drawing-header strong { color: var(--navy); font-size: 1.08rem; }
.drawing-header span { color: var(--muted); font-size: 0.8rem; }
.close-button { width: 42px; height: 42px; border: 0; border-radius: 11px; background: #eef3f6; color: var(--navy); cursor: pointer; font-size: 1.45rem; }
.drawing-tools { display: flex; align-items: center; gap: 8px; padding: 9px 13px; border-bottom: 1px solid rgba(205, 219, 227, 0.78); background: rgba(248, 250, 251, 0.78); overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; backdrop-filter: blur(4px); }
.tool-button { min-height: 38px; flex: 0 0 auto; padding: 7px 11px; border: 1px solid var(--line); border-radius: 9px; background: white; color: #435867; cursor: pointer; }
.tool-button.active { border-color: var(--blue); background: var(--blue-soft); color: #245f85; }
.tool-divider { width: 1px; height: 26px; flex: 0 0 auto; background: var(--line); }
.color-button { width: 30px; height: 30px; flex: 0 0 auto; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 0 1px #bbc8d0; cursor: pointer; }
.color-button.active { box-shadow: 0 0 0 2px var(--blue); }
.width-control { display: flex; align-items: center; gap: 5px; color: var(--muted); font-size: 0.8rem; white-space: nowrap; }
.width-control input { width: 90px; }
.transparency-control { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 0.8rem; white-space: nowrap; }
.transparency-control input { width: 105px; accent-color: var(--blue); }
.transparency-control output { min-width: 32px; color: #486171; font-variant-numeric: tabular-nums; }
.tool-spacer { flex: 1; }
.drawing-canvas { width: calc(100% - 24px); height: calc(100% - 24px); margin: 12px; border: 1px solid rgba(190, 207, 216, 0.76); border-radius: 12px; box-shadow: 0 3px 12px rgba(30, 53, 70, 0.06); touch-action: none; cursor: crosshair; transition: background-color 140ms ease; }
@media (max-width: 760px) { .drawing-overlay { padding: 0; } .drawing-modal { width: 100%; height: 100%; border: 0; border-radius: 0; padding-top: env(safe-area-inset-top); } .width-control { display: none; } .transparency-control input { width: 88px; } }
</style>
