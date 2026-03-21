<template>
  <n-card :title="t('settings.model.whisperModel')">
    <div class="selector">
      <n-radio-group :value="selectedModelId" @update:value="handleSelect">
        <div class="model-list">
          <div v-for="model in orderedModels" :key="model.id" class="model-item">
            <label class="model-main">
              <n-radio :value="model.id" />
              <div class="model-copy">
                <div class="model-header">
                  <n-text strong>{{ model.label }}</n-text>
                  <n-tag size="small" :type="getStatusType(model.id)">
                    {{ getStatusText(model.id, model.downloaded) }}
                  </n-tag>
                </div>
                <n-text depth="3">{{ model.id }}</n-text>
                <n-text v-if="getModelHint(model.id)" depth="3" class="model-hint">
                  {{ getModelHint(model.id) }}
                </n-text>
              </div>
            </label>

            <div class="model-actions">
              <n-progress
                v-if="isDownloading(model.id)"
                type="line"
                :percentage="downloadProgress(model.id)"
                :show-indicator="false"
                :height="8"
              />
              <n-button
                size="small"
                secondary
                :loading="isDownloading(model.id)"
                :disabled="model.downloaded || isModelDisabled(model.id)"
                @click="download(model.id)"
              >
                {{ model.downloaded ? t('components.modelSelector.downloaded') : t('components.modelSelector.download') }}
              </n-button>
            </div>
          </div>
        </div>
      </n-radio-group>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'

import {
  WHISPER_MODEL_IDS,
  WHISPER_WINDOWS_UNSUPPORTED_MODEL_IDS,
  type WhisperModelId,
  type WhisperModelInfo
} from '@shared/types'
import { useWhisperStore } from '@/stores/whisper'

const { t } = useI18n()
const whisperStore = useWhisperStore()
const message = useMessage()

const MODEL_LABELS: Record<WhisperModelId, string> = {
  'ggml-base.bin': 'Base',
  'ggml-small.bin': 'Small',
  'ggml-medium.bin': 'Medium',
  'ggml-large-v2.bin': 'Large v2',
  'ggml-large-v3.bin': 'Large v3'
}

const isWindows = navigator.userAgent.toLowerCase().includes('windows')

const selectedModelId = computed(() => normalizeModelId(whisperStore.settings.modelPath))

const orderedModels = computed(() => {
  const byId = new Map(whisperStore.models.map((model) => [model.id, model]))
  return WHISPER_MODEL_IDS.map<WhisperModelInfo>((modelId) => {
    return (
      byId.get(modelId) ?? {
        id: modelId,
        label: MODEL_LABELS[modelId],
        path: modelId,
        downloadUrl: '',
        downloaded: false
      }
    )
  })
})

onMounted(() => {
  if (whisperStore.models.length === 0) {
    void whisperStore.refreshModels()
  }
})

function normalizeModelId(value: string): WhisperModelId {
  const normalized = value.split(/[/\\]/).at(-1) ?? 'ggml-base.bin'
  if (WHISPER_MODEL_IDS.includes(normalized as WhisperModelId)) {
    return normalized as WhisperModelId
  }
  return 'ggml-base.bin'
}

function downloadProgress(modelId: WhisperModelId): number {
  return whisperStore.modelDownloadProgress[modelId] ?? 0
}

function isDownloading(modelId: WhisperModelId): boolean {
  const progress = whisperStore.modelDownloadProgress[modelId]
  return progress !== undefined && progress < 100
}

function getStatusText(modelId: WhisperModelId, downloaded: boolean): string {
  if (isDownloading(modelId)) {
    return t('components.modelSelector.downloadingProgress', { progress: downloadProgress(modelId) })
  }
  return downloaded ? t('components.modelSelector.downloaded') : t('components.modelSelector.notDownloaded')
}

function getStatusType(modelId: WhisperModelId): 'default' | 'info' | 'success' {
  if (isDownloading(modelId)) {
    return 'info'
  }
  return orderedModels.value.find((item) => item.id === modelId)?.downloaded ? 'success' : 'default'
}

function isModelDisabled(modelId: WhisperModelId): boolean {
  return isWindows && (WHISPER_WINDOWS_UNSUPPORTED_MODEL_IDS as readonly string[]).includes(modelId)
}

function getModelHint(modelId: WhisperModelId): string {
  if (isWindows && modelId === 'ggml-large-v3.bin') {
    return t('components.modelSelector.windowsUnsupportedLargeV3')
  }
  return ''
}

async function handleSelect(modelId: string) {
  if (isModelDisabled(modelId as WhisperModelId)) {
    message.warning(t('components.modelSelector.windowsUnsupportedLargeV3'))
    return
  }

  await whisperStore.updateSettings({
    modelPath: modelId
  })
}

async function download(modelId: WhisperModelId) {
  try {
    await whisperStore.downloadModel(modelId)
    message.success(t('settings.model.downloadComplete', { label: MODEL_LABELS[modelId] }))
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}
</script>

<style scoped>
.selector {
  display: grid;
}

.model-list {
  display: grid;
  gap: 12px;
}

.model-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 14px;
  border-radius: 14px;
  background: #f8fafc;
}

.model-main {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}

.model-copy {
  display: grid;
  gap: 4px;
}

.model-hint {
  color: #b45309;
}

.model-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-actions {
  width: 140px;
  display: grid;
  gap: 8px;
}

@media (max-width: 720px) {
  .model-item {
    grid-template-columns: 1fr;
  }

  .model-actions {
    width: 100%;
  }
}
</style>
