<template>
  <n-card :title="t('settings.ffmpeg.title')">
    <n-space vertical>
      <!-- 模式選擇 -->
      <n-form-item :label="t('settings.ffmpeg.mode')">
        <n-radio-group v-model:value="mode" @update:value="onModeChange">
          <n-radio value="system">
            {{ t('settings.ffmpeg.systemMode') }}
          </n-radio>
          <n-radio value="managed">
            {{ t('settings.ffmpeg.managedMode') }}
          </n-radio>
        </n-radio-group>
      </n-form-item>

      <!-- 系統模式 -->
      <template v-if="mode === 'system'">
        <n-spin :show="detecting">
          <n-alert :type="systemStatusType" :bordered="false">
            {{ systemStatusText }}
          </n-alert>
        </n-spin>

        <n-form-item v-if="systemInstallation.path" :label="t('settings.ffmpeg.path')">
          <n-input :value="systemInstallation.path" readonly>
            <template #suffix>
              <n-button text @click="openFolder(systemInstallation.path)">
                📁
              </n-button>
            </template>
          </n-input>
        </n-form-item>

        <n-space v-if="systemInstallation.version" vertical>
          <n-text>
            {{ t('settings.ffmpeg.version') }}: {{ systemInstallation.version }}
          </n-text>
          <n-text v-if="systemInstallation.source" depth="3">
            {{ t('settings.ffmpeg.source') }}: {{ sourceText }}
          </n-text>
        </n-space>

        <n-alert type="info" :bordered="false">
          {{ t('settings.ffmpeg.systemModeHint') }}
        </n-alert>

        <n-button @click="detectSystem" :loading="detecting">
          {{ t('settings.ffmpeg.refresh') }}
        </n-button>
      </template>

      <!-- 管理模式 -->
      <template v-else>
        <n-spin :show="detecting">
          <n-alert :type="managedStatusType" :bordered="false">
            {{ managedStatusText }}
          </n-alert>
        </n-spin>

        <n-form-item v-if="managedInstallation.path" :label="t('settings.ffmpeg.path')">
          <n-input :value="managedInstallation.path" readonly>
            <template #suffix>
              <n-button text @click="openFolder(managedInstallation.path)">
                📁
              </n-button>
            </template>
          </n-input>
        </n-form-item>

        <n-space v-if="managedInstallation.version" vertical>
          <n-text>
            {{ t('settings.ffmpeg.version') }}: {{ managedInstallation.version }}
          </n-text>
        </n-space>

        <n-alert type="info" :bordered="false">
          {{ t('settings.ffmpeg.managedModeHint') }}
        </n-alert>

        <n-space>
          <n-button
            v-if="!managedInstallation.path"
            type="primary"
            @click="download"
            :loading="downloading"
          >
            {{ t('settings.ffmpeg.download') }}
          </n-button>
          <n-button
            v-else
            @click="update"
            :loading="downloading"
          >
            {{ t('settings.ffmpeg.update') }}
          </n-button>
          <n-button @click="detectManaged" :loading="detecting">
            {{ t('settings.ffmpeg.refresh') }}
          </n-button>
        </n-space>
        <n-text v-if="downloading && managedProgressText" depth="3">
          {{ managedProgressText }}
        </n-text>
      </template>
    </n-space>
  </n-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { FfmpegInstallation, ToolProgressEvent } from '@shared/types'

const { t } = useI18n()

const props = defineProps<{
  settings: { ffmpegMode?: 'system' | 'managed' }
}>()

const emit = defineEmits<{
  'update:settings': [settings: { ffmpegMode: 'system' | 'managed' }]
}>()

const mode = ref<'system' | 'managed'>(props.settings.ffmpegMode ?? 'system')
const systemInstallation = ref<FfmpegInstallation>({ type: 'none' })
const managedInstallation = ref<FfmpegInstallation>({ type: 'none' })
const detecting = ref(false)
const downloading = ref(false)
const managedProgress = ref<ToolProgressEvent | null>(null)
let unsubscribeManagedProgress: (() => void) | null = null

// 系統模式狀態
const systemStatusType = computed(() => {
  if (detecting.value) return 'default'
  if (!systemInstallation.value.path) return 'warning'
  return 'success'
})

const systemStatusText = computed(() => {
  if (detecting.value) return t('settings.ffmpeg.detecting')
  if (!systemInstallation.value.path) return t('settings.ffmpeg.notInstalled')
  if (systemInstallation.value.type === 'system') return t('settings.ffmpeg.systemDetected')
  return t('settings.ffmpeg.ready')
})

// 管理模式狀態
const managedStatusType = computed(() => {
  if (detecting.value) return 'default'
  if (!managedInstallation.value.path) return 'warning'
  return 'success'
})

const managedStatusText = computed(() => {
  if (detecting.value) return t('settings.ffmpeg.detecting')
  if (!managedInstallation.value.path) return t('settings.ffmpeg.notInstalled')
  if (managedInstallation.value.type === 'managed') return t('settings.ffmpeg.managedDetected')
  return t('settings.ffmpeg.ready')
})

// 安裝來源顯示
const sourceText = computed(() => {
  if (systemInstallation.value.source === 'homebrew') return 'Homebrew'
  if (systemInstallation.value.source === 'apt') return 'apt'
  if (systemInstallation.value.source === 'manual') return t('settings.ffmpeg.manualInstall')
  return systemInstallation.value.source ?? ''
})

// 模式切換
function onModeChange(newMode: 'system' | 'managed') {
  mode.value = newMode
  emit('update:settings', { ffmpegMode: newMode })

  // 切換後檢測
  if (newMode === 'system') {
    detectSystem()
  } else {
    detectManaged()
  }
}

// 檢測系統 ffmpeg
async function detectSystem() {
  detecting.value = true
  try {
    const result = await window.fosswhisper.detectSystemFfmpeg()
    systemInstallation.value = result
  } catch (error) {
    console.error('Failed to detect system ffmpeg:', error)
  } finally {
    detecting.value = false
  }
}

// 檢測管理版本
async function detectManaged() {
  detecting.value = true
  try {
    const result = await window.fosswhisper.detectManagedFfmpeg()
    managedInstallation.value = result
  } catch (error) {
    console.error('Failed to detect managed ffmpeg:', error)
  } finally {
    detecting.value = false
  }
}

// 下載管理版本
async function download() {
  downloading.value = true
  try {
    const response = await window.fosswhisper.downloadManagedFfmpeg()
    if (!response.ok) {
      throw new Error(response.error ?? 'Download failed')
    }
    if (response.installation) {
      managedInstallation.value = response.installation
    }
    await detectManaged()
  } catch (error) {
    console.error('Failed to download ffmpeg:', error)
  } finally {
    downloading.value = false
  }
}

// 更新管理版本
async function update() {
  downloading.value = true
  try {
    const response = await window.fosswhisper.updateManagedFfmpeg()
    if (!response.ok) {
      throw new Error(response.error ?? 'Update failed')
    }
    if (response.installation) {
      managedInstallation.value = response.installation
    }
    await detectManaged()
  } catch (error) {
    console.error('Failed to update ffmpeg:', error)
  } finally {
    downloading.value = false
  }
}

// 開啟資料夾
function openFolder(filePath: string) {
  const dir = filePath.split(/[\\/]/).slice(0, -1).join('/')
  void window.fosswhisper.openFolder(dir)
}

// 監聽設定變化
watch(
  () => props.settings.ffmpegMode,
  (newMode) => {
    if (newMode && newMode !== mode.value) {
      mode.value = newMode
      // 切換後檢測
      if (newMode === 'system') {
        detectSystem()
      } else {
        detectManaged()
      }
    }
  }
)

// 初始化
const managedProgressText = computed(() => {
  if (!managedProgress.value) return ''
  const percent =
    managedProgress.value.percent !== undefined ? `${managedProgress.value.percent.toFixed(0)}%` : ''
  
  // 映射阶段到翻译键
  const phaseKey = `settings.ffmpeg.phase.${managedProgress.value.phase}`
  const phase = managedProgress.value.phase ? t(phaseKey) : ''
  
  return percent ? `${phase} ${percent}` : phase
})

onMounted(() => {
  unsubscribeManagedProgress = window.fosswhisper.onFfmpegManagedProgress((event) => {
    managedProgress.value = event
  })
  if (mode.value === 'system') {
    detectSystem()
  } else {
    detectManaged()
  }
})

onBeforeUnmount(() => {
  unsubscribeManagedProgress?.()
})
</script>
