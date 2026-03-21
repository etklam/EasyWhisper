<template>
  <n-card class="import-panel" :bordered="true">
    <div class="panel-content">
      <!-- Drag and Drop Zone -->
      <div
        class="drop-target"
        :class="{ active: isDragging }"
        @dragenter.prevent="isDragging = true"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="handleDragLeave"
        @drop.prevent="handleDrop"
        data-testid="drop-target"
      >
        <div class="drop-target-badge">{{ t('components.importPanel.fileImport') }}</div>
        <p class="title">{{ t('components.importPanel.dragDropTitle') }}</p>
        <p class="hint">{{ t('components.importPanel.dragDropHint', { formats: acceptedLabel }) }}</p>
        <n-button tertiary type="primary" @click="openFilePicker">
          {{ t('components.importPanel.selectFiles') }}
        </n-button>
        <input
          ref="inputRef"
          type="file"
          class="hidden-input"
          multiple
          :accept="acceptedInput"
          @change="handleFileInput"
        />
      </div>

      <div class="file-options">
        <n-form-item
          :label="t('components.importPanel.outputLocation')"
          label-placement="top"
          class="output-location-field"
        >
          <n-select
            v-model:value="fileOutputLocation"
            data-testid="file-output-location-select"
            :options="fileOutputLocationOptions"
          />
        </n-form-item>
        <n-text depth="3">
          {{ t('components.importPanel.outputLocationHint') }}
        </n-text>
      </div>

      <n-divider />

      <!-- URL Batch Input -->
      <div class="url-input-area" data-testid="url-input-area">
        <div class="section-head">
          <h3 class="section-title">{{ t('components.importPanel.batchUrlTitle') }}</h3>
          <span class="section-chip">{{ parsedUrls.length }}</span>
        </div>
        <n-input
          v-model:value="rawUrlValue"
          type="textarea"
          :placeholder="t('components.importPanel.urlPlaceholder')"
          :autosize="{ minRows: 4, maxRows: 8 }"
        />

        <div class="toolbar">
          <n-text depth="3">
            {{ t('components.importPanel.urlsParsed', { count: parsedUrls.length }) }}
          </n-text>
          <n-button
            type="primary"
            secondary
            :disabled="parsedUrls.length === 0"
            data-testid="submit-urls"
            @click="submitUrls"
          >
            {{ t('components.importPanel.addToQueue') }}
          </n-button>
        </div>
      </div>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'

import { SUPPORTED_AUDIO_FORMATS, SUPPORTED_VIDEO_FORMATS } from '@shared/formats'
import { parseUrlList } from '@shared/url'
import { useQueueStore } from '@/stores/queue'
import { useWhisperStore } from '@/stores/whisper'
import type { TaskOutputLocation } from '@/stores/queue'

const { t } = useI18n()
const queueStore = useQueueStore()
const whisperStore = useWhisperStore()
const message = useMessage()
const inputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const rawUrlValue = ref('')
const fileOutputLocation = ref<TaskOutputLocation>(
  whisperStore.settings.outputToSourceDir ? 'source' : 'default'
)

const acceptedFormats = [...SUPPORTED_AUDIO_FORMATS, ...SUPPORTED_VIDEO_FORMATS].filter((format) =>
  ['mp3', 'wav', 'm4a', 'mp4', 'mov', 'mkv'].includes(format)
)
const acceptedInput = acceptedFormats.map((format) => `.${format}`).join(',')
const acceptedLabel = acceptedInput.replaceAll(',', ' ')

const parsedUrls = computed(() => parseUrlList(rawUrlValue.value))
const fileOutputLocationOptions = computed(() => [
  { label: t('components.importPanel.outputLocationDefault'), value: 'default' },
  { label: t('components.importPanel.outputLocationSource'), value: 'source' }
])

watch(
  () => whisperStore.settings.outputToSourceDir,
  (next) => {
    fileOutputLocation.value = next ? 'source' : 'default'
  }
)

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

  queueStore.enqueueFiles(validFiles, { outputLocation: fileOutputLocation.value })
  message.success(t('messages.filesAdded', { count: validFiles.length }))
}

function isSupportedFile(filePath: string): boolean {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? ''
  return acceptedFormats.includes(extension as (typeof acceptedFormats)[number])
}

function submitUrls() {
  if (parsedUrls.value.length === 0) {
    message.error(t('messages.enterValidUrl'))
    return
  }

  queueStore.enqueueUrls(parsedUrls.value)
  message.success(t('messages.urlsAdded', { count: parsedUrls.value.length }))
  rawUrlValue.value = ''
}
</script>

<style scoped>
.import-panel {
  border-radius: var(--fw-radius-lg);
  border: 1px solid var(--fw-border);
  background: linear-gradient(180deg, var(--fw-surface-strong), rgba(255, 255, 255, 0.84));
  box-shadow: var(--fw-shadow-soft);
}

.panel-content {
  display: grid;
  gap: 18px;
}

.drop-target {
  border: 1px dashed rgba(8, 145, 178, 0.32);
  border-radius: 20px;
  padding: 28px 20px;
  display: grid;
  justify-items: center;
  gap: 12px;
  text-align: center;
  transition: border-color 0.2s ease, background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  background:
    radial-gradient(circle at top, rgba(34, 211, 238, 0.14), transparent 46%),
    linear-gradient(180deg, rgba(236, 254, 255, 0.92), rgba(255, 255, 255, 0.98));
}

.drop-target.active {
  border-color: var(--fw-primary);
  background:
    radial-gradient(circle at top, rgba(34, 211, 238, 0.2), transparent 52%),
    linear-gradient(180deg, rgba(224, 247, 250, 0.98), rgba(255, 255, 255, 1));
  transform: translateY(-1px);
  box-shadow: 0 16px 30px rgba(8, 145, 178, 0.12);
}

.drop-target-badge {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(8, 145, 178, 0.1);
  color: var(--fw-primary-strong);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--fw-title);
}

.hint {
  margin: 0;
  max-width: 56ch;
  color: var(--fw-text-muted);
  line-height: 1.5;
}

.hidden-input {
  display: none;
}

.file-options {
  display: grid;
  gap: 8px;
}

.output-location-field :deep(.n-form-item-feedback-wrapper) {
  display: none;
}

.url-input-area {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--fw-title);
}

.section-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(8, 145, 178, 0.1);
  color: var(--fw-primary-strong);
  font-weight: 700;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

@media (max-width: 640px) {
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
