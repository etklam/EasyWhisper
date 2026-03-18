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
        <p class="title">拖放音频或视频文件</p>
        <p class="hint">支持批量导入，支持格式：{{ acceptedLabel }}</p>
        <n-button tertiary type="primary" @click="openFilePicker">选择文件</n-button>
        <input
          ref="inputRef"
          type="file"
          class="hidden-input"
          multiple
          :accept="acceptedInput"
          @change="handleFileInput"
        />
      </div>

      <n-divider />

      <!-- URL Batch Input -->
      <div class="url-input-area" data-testid="url-input-area">
        <h3 class="section-title">批量导入 URL</h3>
        <n-input
          v-model:value="rawUrlValue"
          type="textarea"
          placeholder="每行输入一个 URL，支持以 # 开头的注释行"
          :autosize="{ minRows: 4, maxRows: 8 }"
        />

        <div class="toolbar">
          <n-text depth="3">已解析 {{ parsedUrls.length }} 个 URL</n-text>
          <n-button
            type="primary"
            secondary
            :disabled="parsedUrls.length === 0"
            data-testid="submit-urls"
            @click="submitUrls"
          >
            加入队列
          </n-button>
        </div>
      </div>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMessage } from 'naive-ui'

import { SUPPORTED_AUDIO_FORMATS, SUPPORTED_VIDEO_FORMATS } from '@shared/formats'
import { parseUrlList } from '@shared/url'
import { useQueueStore } from '@/stores/queue'

const queueStore = useQueueStore()
const message = useMessage()
const inputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const rawUrlValue = ref('')

const acceptedFormats = [...SUPPORTED_AUDIO_FORMATS, ...SUPPORTED_VIDEO_FORMATS].filter((format) =>
  ['mp3', 'wav', 'm4a', 'mp4', 'mov', 'mkv'].includes(format)
)
const acceptedInput = acceptedFormats.map((format) => `.${format}`).join(',')
const acceptedLabel = acceptedInput.replaceAll(',', ' ')

const parsedUrls = computed(() => parseUrlList(rawUrlValue.value))

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
    message.warning(`已忽略 ${rejectedCount} 个不支持的文件`)
  }

  if (validFiles.length === 0) {
    if (filePaths.length > 0) {
      message.error('没有可导入的音频或视频文件')
    }
    return
  }

  queueStore.enqueueFiles(validFiles)
  message.success(`已加入 ${validFiles.length} 个文件`)
}

function isSupportedFile(filePath: string): boolean {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? ''
  return acceptedFormats.includes(extension as (typeof acceptedFormats)[number])
}

function submitUrls() {
  if (parsedUrls.value.length === 0) {
    message.error('请输入至少一个有效 URL')
    return
  }

  queueStore.enqueueUrls(parsedUrls.value)
  message.success(`已加入 ${parsedUrls.value.length} 个 URL`)
  rawUrlValue.value = ''
}
</script>

<style scoped>
.import-panel {
  border-radius: 18px;
}

.panel-content {
  display: grid;
  gap: 16px;
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

.url-input-area {
  display: grid;
  gap: 12px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
