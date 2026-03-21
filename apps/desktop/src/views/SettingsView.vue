<template>
  <div class="settings-view">
    <n-space vertical :size="16">
      <!-- Language Settings Card (NEW) -->
      <n-card>
        <template #header>
          <span class="section-title">{{ t('settings.language.title') }}</span>
        </template>
        <n-form-item :label="t('settings.language.title')">
          <n-select
            v-model:value="currentLocale"
            :options="localeOptions"
            @update:value="handleLocaleChange"
          />
        </n-form-item>
      </n-card>

      <n-card>
        <template #header>
          <div class="section-header">
            <span class="section-title">{{ t('settings.model.title') }}</span>
            <n-button
              size="small"
              quaternary
              type="primary"
              data-testid="open-model-folder"
              @click="openModelFolder"
            >
              {{ t('settings.model.openFolder') }}
            </n-button>
          </div>
        </template>
        <ModelSelector />
      </n-card>

      <n-card>
        <template #header>
          <span class="section-title">{{ t('settings.transcription.title') }}</span>
        </template>
        <n-form label-placement="top" :model="localSettings">
          <n-grid :cols="2" :x-gap="12" :y-gap="8" responsive="screen" item-responsive>
            <n-form-item-gi span="2 m:1" :label="t('settings.transcription.threads')">
              <n-input-number v-model:value="localSettings.threads" :min="1" :max="16" />
            </n-form-item-gi>
            <n-form-item-gi span="2 m:1" :label="t('settings.transcription.defaultLanguage')">
              <n-select
                data-testid="default-language-select"
                v-model:value="localSettings.language"
                :options="transcriptionLanguageOptions"
              />
            </n-form-item-gi>
            <n-form-item-gi span="2 m:1" :label="t('settings.transcription.defaultOutputLocation')">
              <n-select
                v-model:value="defaultOutputLocation"
                data-testid="default-output-location-select"
                :options="defaultOutputLocationOptions"
              />
            </n-form-item-gi>
            <n-form-item-gi span="2" :label="t('settings.transcription.defaultOutputDir')">
              <n-input
                v-model:value="localSettings.outputDir"
                :placeholder="t('settings.transcription.outputDirPlaceholder')"
              />
            </n-form-item-gi>
          </n-grid>

          <n-form-item>
            <n-switch v-model:value="localSettings.useMetal" />
            <n-text class="switch-label">{{ t('settings.transcription.useMetal') }}</n-text>
          </n-form-item>

          <n-button type="primary" data-testid="save-transcription-settings" @click="applyTranscriptionSettings">
            {{ t('settings.transcription.save') }}
          </n-button>
        </n-form>
      </n-card>

      <n-card>
        <template #header>
          <div class="section-header">
            <span class="section-title">{{ t('settings.download.title') }}</span>
            <n-button
              size="small"
              quaternary
              type="primary"
              data-testid="open-output-folder"
              @click="openOutputFolder"
            >
              {{ t('settings.download.openOutputFolder') }}
            </n-button>
          </div>
        </template>
        <n-form label-placement="top" :model="localSettings">
          <n-form-item :label="t('settings.download.audioFormat')">
            <n-input v-model:value="localSettings.ytdlpAudioFormat" placeholder="mp3 / wav / m4a" />
          </n-form-item>
          <n-form-item :label="t('settings.download.cookiesPath')">
            <n-input v-model:value="localSettings.ytdlpCookiesPath" :placeholder="t('settings.download.cookiesPlaceholder')" />
          </n-form-item>
          <n-button type="primary" data-testid="save-download-settings" @click="applyDownloadSettings">
            {{ t('settings.download.save') }}
          </n-button>
        </n-form>
      </n-card>

      <!-- yt-dlp Settings Card -->
      <YtDlpStatus :settings="whisperStore.settings" @update:settings="handleToolSettingsUpdate" />

      <!-- ffmpeg Settings Card -->
      <FfmpegStatus :settings="whisperStore.settings" @update:settings="handleToolSettingsUpdate" />
    </n-space>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import type { WorkflowSettings } from '@shared/types'
import ModelSelector from '@/components/ModelSelector.vue'
import YtDlpStatus from '@/components/YtDlpStatus.vue'
import FfmpegStatus from '@/components/FfmpegStatus.vue'
import { useWhisperStore } from '@/stores/whisper'
import { useLocale } from '@/composables/useLocale'

const whisperStore = useWhisperStore()
const { t } = useI18n()
const { setLocale } = useLocale()
const message = useMessage()

const localSettings = reactive({ ...whisperStore.settings })
const currentLocale = ref(whisperStore.settings.locale || 'en')

const localeOptions = [
  { label: 'English', value: 'en' },
  { label: '简体中文', value: 'zh-CN' },
  { label: '繁體中文', value: 'zh-TW' }
]

const transcriptionLanguageOptions = [
  { label: t('transcriptionLanguage.auto'), value: 'auto' },
  { label: t('transcriptionLanguage.en'), value: 'en' },
  { label: t('transcriptionLanguage.zh'), value: 'zh' },
  { label: t('transcriptionLanguage.ja'), value: 'ja' },
  { label: t('transcriptionLanguage.ko'), value: 'ko' }
]
const defaultOutputLocationOptions = computed(() => [
  { label: t('settings.transcription.outputLocationDefault'), value: 'default' },
  { label: t('settings.transcription.outputLocationSource'), value: 'source' }
])
const defaultOutputLocation = computed<'default' | 'source'>({
  get: () => (localSettings.outputToSourceDir ? 'source' : 'default'),
  set: (value) => {
    localSettings.outputToSourceDir = value === 'source'
  }
})

watch(
  () => whisperStore.settings,
  (next) => {
    Object.assign(localSettings, next)
  },
  { deep: true }
)

async function handleLocaleChange(value: string) {
  await setLocale(value as 'en' | 'zh-CN' | 'zh-TW')
}

async function openModelFolder() {
  try {
    const result = await window.fosswhisper.openModelFolder()
    if (result.ok) {
      message.success(t('settings.messages.folderOpened'))
    } else {
      message.error(t('settings.messages.openFolderFailed', { error: result.error }))
    }
  } catch (error) {
    message.error(t('settings.messages.openFolderFailed', { error: error instanceof Error ? error.message : String(error) }))
  }
}

async function openOutputFolder() {
  try {
    const result = await window.fosswhisper.openOutputFolder()
    if (result.ok) {
      message.success(t('settings.messages.folderOpened'))
    } else {
      message.error(t('settings.messages.openFolderFailed', { error: result.error }))
    }
  } catch (error) {
    message.error(t('settings.messages.openFolderFailed', { error: error instanceof Error ? error.message : String(error) }))
  }
}

async function applyTranscriptionSettings() {
  try {
    await whisperStore.updateSettings({
      threads: localSettings.threads,
      language: localSettings.language,
      useMetal: localSettings.useMetal,
      outputDir: localSettings.outputDir,
      outputToSourceDir: localSettings.outputToSourceDir
    })
    message.success(t('settings.transcription.saved'))
  } catch {
    message.error(t('settings.transcription.saveFailed'))
  }
}

async function applyDownloadSettings() {
  try {
    await whisperStore.updateSettings({
      ytdlpAudioFormat: localSettings.ytdlpAudioFormat,
      ytdlpCookiesPath: localSettings.ytdlpCookiesPath
    })
    message.success(t('settings.download.saved'))
  } catch {
    message.error(t('settings.download.saveFailed'))
  }
}

async function handleToolSettingsUpdate(settings: Partial<WorkflowSettings>) {
  try {
    await whisperStore.updateSettings(settings)
  } catch {
    message.error(t('settings.messages.saveFailed'))
  }
}
</script>

<style scoped>
.settings-view {
  display: grid;
  gap: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.section-title {
  font-weight: 600;
}

.switch-label {
  margin-left: 10px;
}
</style>
