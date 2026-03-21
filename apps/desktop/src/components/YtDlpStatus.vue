<template>
  <n-card :title="t('settings.ytDlp.title')">
    <n-space vertical>
      <!-- 模式選擇 -->
      <n-form-item :label="t('settings.ytDlp.mode')">
        <n-radio-group v-model:value="mode" @update:value="onModeChange">
          <n-radio value="system">
            {{ t('settings.ytDlp.systemMode') }}
          </n-radio>
          <n-radio value="managed">
            {{ t('settings.ytDlp.managedMode') }}
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

        <n-form-item v-if="systemInstallation.path" :label="t('settings.ytDlp.path')">
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
            {{ t('settings.ytDlp.version') }}: {{ systemInstallation.version }}
          </n-text>
          <n-text v-if="systemInstallation.source" depth="3">
            {{ t('settings.ytDlp.source') }}: {{ sourceText }}
          </n-text>
        </n-space>

        <n-alert type="info" :bordered="false">
          {{ t('settings.ytDlp.systemModeHint') }}
        </n-alert>

        <n-button @click="refreshSystem" :loading="detecting">
          {{ t('settings.ytDlp.refresh') }}
        </n-button>
      </template>

      <!-- 管理模式 -->
      <template v-else>
        <n-spin :show="detecting">
          <n-alert :type="managedStatusType" :bordered="false">
            {{ managedStatusText }}
          </n-alert>
        </n-spin>

        <n-form-item v-if="managedInstallation.path" :label="t('settings.ytDlp.path')">
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
            {{ t('settings.ytDlp.version') }}: {{ managedInstallation.version }}
          </n-text>
        </n-space>

        <n-alert type="info" :bordered="false">
          {{ t('settings.ytDlp.managedModeHint') }}
        </n-alert>

        <n-space>
          <n-button
            v-if="!managedInstallation.path"
            type="primary"
            @click="download"
            :loading="downloading"
          >
            {{ t('settings.ytDlp.download') }}
          </n-button>
          <n-button
            v-else
            @click="update"
            :loading="downloading"
          >
            {{ t('settings.ytDlp.update') }}
          </n-button>
          <n-button
            v-if="downloading"
            @click="cancelDownload"
            type="warning"
          >
            {{ t('common.cancel') }}
          </n-button>
          <n-button @click="refreshManaged" :loading="detecting">
            {{ t('settings.ytDlp.refresh') }}
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

import type { ToolProgressEvent, YtDlpInstallation } from '@shared/types'

const { t } = useI18n()

const props = defineProps<{
  settings: { ytdlpMode?: 'system' | 'managed' }
}>()

const emit = defineEmits<{
  'update:settings': [settings: { ytdlpMode: 'system' | 'managed' }]
}>()

const mode = ref<'system' | 'managed'>(props.settings.ytdlpMode ?? 'system')
const systemInstallation = ref<YtDlpInstallation>({ type: 'none' })
const managedInstallation = ref<YtDlpInstallation>({ type: 'none' })
const detecting = ref(false)
const downloading = ref(false)
const managedProgress = ref<ToolProgressEvent | null>(null)
let unsubscribeManagedProgress: (() => void) | null = null
let abortController: AbortController | null = null

// 系統模式狀態
const systemStatusType = computed(() => {
  if (detecting.value) return 'default'
  if (!systemInstallation.value.path) return 'warning'
  return 'success'
})

const systemStatusText = computed(() => {
  if (detecting.value) return t('settings.ytDlp.detecting')
  if (!systemInstallation.value.path) return t('settings.ytDlp.notInstalled')
  if (systemInstallation.value.type === 'system') return t('settings.ytDlp.systemDetected')
  return t('settings.ytDlp.ready')
})

// 管理模式狀態
const managedStatusType = computed(() => {
  if (detecting.value) return 'default'
  if (!managedInstallation.value.path) return 'warning'
  return 'success'
})

const managedStatusText = computed(() => {
  if (detecting.value) return t('settings.ytDlp.detecting')
  if (!managedInstallation.value.path) return t('settings.ytDlp.notInstalled')
  if (managedInstallation.value.type === 'managed') return t('settings.ytDlp.managedDetected')
  return t('settings.ytDlp.ready')
})

// 安裝來源顯示
const sourceText = computed(() => {
  if (systemInstallation.value.source === 'homebrew') return 'Homebrew'
  if (systemInstallation.value.source === 'pip') return 'pip'
  if (systemInstallation.value.source === 'apt') return 'apt'
  if (systemInstallation.value.source === 'manual') return t('settings.ytDlp.manualInstall')
  return systemInstallation.value.source ?? ''
})

// 模式切換
function onModeChange(newMode: 'system' | 'managed') {
  mode.value = newMode
  emit('update:settings', { ytdlpMode: newMode })

  // 切換後檢測
  if (newMode === 'system') {
    detectSystem()
  } else {
    detectManaged()
  }
}

// 檢測系統 yt-dlp
async function detectSystem(options: { forceRefresh?: boolean } = {}) {
  detecting.value = true
  try {
    const result = await window.fosswhisper.detectSystemYtDlp(options)
    systemInstallation.value = result
  } catch (error) {
    console.error('Failed to detect system yt-dlp:', error)
  } finally {
    detecting.value = false
  }
}

// 檢測管理版本
async function detectManaged(options: { forceRefresh?: boolean } = {}) {
  detecting.value = true
  try {
    const result = await window.fosswhisper.detectManagedYtDlp(options)
    managedInstallation.value = result
  } catch (error) {
    console.error('Failed to detect managed yt-dlp:', error)
  } finally {
    detecting.value = false
  }
}

// 下載管理版本
async function download() {
  downloading.value = true
  abortController = new AbortController()
  try {
    const response = await window.fosswhisper.downloadManagedYtDlp({
      signal: abortController.signal
    })
    if (!response.ok) {
      throw new Error(response.error ?? 'Download failed')
    }
    if (response.installation) {
      managedInstallation.value = response.installation
    }
    await detectManaged({ forceRefresh: true })
  } catch (error) {
    console.error('Failed to download yt-dlp:', error)
    throw error
  } finally {
    downloading.value = false
    abortController = null
  }
}

// 更新管理版本
async function update() {
  downloading.value = true
  abortController = new AbortController()
  try {
    const response = await window.fosswhisper.updateManagedYtDlp({
      signal: abortController.signal
    })
    if (!response.ok) {
      throw new Error(response.error ?? 'Update failed')
    }
    if (response.installation) {
      managedInstallation.value = response.installation
    }
    await detectManaged({ forceRefresh: true })
  } catch (error) {
    console.error('Failed to update yt-dlp:', error)
    throw error
  } finally {
    downloading.value = false
    abortController = null
  }
}

// 取消下載
function cancelDownload() {
  abortController?.abort()
  downloading.value = false
}

function refreshSystem() {
  void detectSystem({ forceRefresh: true })
}

function refreshManaged() {
  void detectManaged({ forceRefresh: true })
}

// 開啟資料夾
function openFolder(filePath: string) {
  const dir = filePath.split(/[\\/]/).slice(0, -1).join('/')
  void window.fosswhisper.openFolder(dir)
}

// 監聽設定變化
watch(
  () => props.settings.ytdlpMode,
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
  const phaseKey = `settings.ytDlp.phase.${managedProgress.value.phase}`
  const phase = managedProgress.value.phase ? t(phaseKey) : ''
  
  return percent ? `${phase} ${percent}` : phase
})

onMounted(() => {
  unsubscribeManagedProgress = window.fosswhisper.onYtDlpManagedProgress((event) => {
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
