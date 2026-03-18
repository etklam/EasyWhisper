<template>
  <n-card class="drop-zone" :bordered="true">
    <div
      class="drop-target"
      :class="{ active: isDragging }"
      @dragenter.prevent="isDragging = true"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <p class="title">{{ t('home.dropZone.title') }}</p>
      <p class="hint">{{ t('home.dropZone.hint', { formats: acceptedLabel }) }}</p>
      <n-button tertiary type="primary" @click="openFilePicker">{{ t('home.dropZone.selectFiles') }}</n-button>
      <input
        ref="inputRef"
        type="file"
        class="hidden-input"
        multiple
        :accept="acceptedInput"
        @change="handleFileInput"
      />
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'

import { SUPPORTED_AUDIO_FORMATS, SUPPORTED_VIDEO_FORMATS } from '@shared/formats'
import { useQueueStore } from '@/stores/queue'

const queueStore = useQueueStore()
const message = useMessage()
const { t } = useI18n()
const inputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)

const acceptedFormats = [...SUPPORTED_AUDIO_FORMATS, ...SUPPORTED_VIDEO_FORMATS].filter((format) =>
  ['mp3', 'wav', 'm4a', 'mp4', 'mov', 'mkv'].includes(format)
)
const acceptedInput = acceptedFormats.map((format) => `.${format}`).join(',')
const acceptedLabel = acceptedInput.replaceAll(',', ' ')

function openFilePicker() {
  inputRef.value?.click()
}

function handleDragLeave(event: DragEvent) {
  const currentTarget = event.currentTarget as HTMLElement | null
  if (currentTarget?.contains(event.relatedTarget as Node | null)) {
    return
  }
  isDragging.value = false
}

function handleDrop(event: DragEvent) {
  isDragging.value = false
  queueFiles(extractPaths(event.dataTransfer?.files ?? null))
}

function handleFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  queueFiles(extractPaths(input.files))
  input.value = ''
}

function extractPaths(list: FileList | null): string[] {
  if (!list) {
    return []
  }

  return Array.from(list)
    .map((file) => (file as File & { path?: string }).path)
    .filter((filePath): filePath is string => Boolean(filePath))
}

function queueFiles(filePaths: string[]) {
  const validFiles = filePaths.filter(isSupportedFile)
  const rejectedCount = filePaths.length - validFiles.length

  if (rejectedCount > 0) {
    message.warning(t('messages.ignoredFiles', { count: rejectedCount }))
  }

  if (validFiles.length === 0) {
    if (filePaths.length > 0) {
      message.error(t('messages.noValidFiles'))
    }
    return
  }

  queueStore.enqueueFiles(validFiles)
  message.success(t('messages.filesAdded', { count: validFiles.length }))
}

function isSupportedFile(filePath: string): boolean {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? ''
  return acceptedFormats.includes(extension as (typeof acceptedFormats)[number])
}
</script>

<style scoped>
.drop-zone {
  border-radius: 18px;
}

.drop-target {
  border: 2px dashed #9ca3af;
  border-radius: 14px;
  padding: 32px 20px;
  display: grid;
  justify-items: center;
  gap: 10px;
  text-align: center;
  transition: border-color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
  background:
    radial-gradient(circle at top, rgba(34, 197, 94, 0.08), transparent 46%),
    linear-gradient(180deg, rgba(240, 253, 244, 0.7), rgba(255, 255, 255, 0.95));
}

.drop-target.active {
  border-color: #15803d;
  background:
    radial-gradient(circle at top, rgba(34, 197, 94, 0.14), transparent 52%),
    linear-gradient(180deg, rgba(220, 252, 231, 0.95), rgba(255, 255, 255, 0.98));
  transform: translateY(-1px);
}

.title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #14532d;
}

.hint {
  margin: 0;
  color: #4b5563;
  line-height: 1.5;
}

.hidden-input {
  display: none;
}
</style>
