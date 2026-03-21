<template>
  <div class="settings-view">
    <section class="settings-hero">
      <div>
        <div class="settings-eyebrow">{{ t('settings.eyebrow') }}</div>
        <h2>{{ t('app.subtitleSettings') }}</h2>
        <p class="settings-copy">
          {{ t('settings.heroCopy') }}
        </p>
      </div>
      <div class="settings-hero-panel">
        <div class="settings-hero-stat">
          <span>{{ t('settings.transcription.title') }}</span>
          <strong>{{ localSettings.threads }}</strong>
        </div>
        <div class="settings-hero-stat">
          <span>{{ t('settings.language.title') }}</span>
          <strong>{{ currentLocaleLabel }}</strong>
        </div>
      </div>
    </section>

    <n-space vertical :size="16">
      <!-- Language Settings Card (NEW) -->
      <n-card class="settings-card">
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

      <n-card class="settings-card">
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

      <n-card class="settings-card">
        <template #header>
          <span class="section-title">{{ t('settings.transcription.title') }}</span>
        </template>
        <div class="transcription-summary" data-testid="transcription-summary">
          <div class="transcription-summary-card">
            <span>{{ t('settings.transcription.summaryPerformance') }}</span>
            <strong>{{ localSettings.threads }} {{ t('settings.transcription.summaryThreadsUnit') }}</strong>
          </div>
          <div class="transcription-summary-card">
            <span>{{ t('settings.transcription.summaryLanguage') }}</span>
            <strong>{{ transcriptionLanguageLabel }}</strong>
          </div>
          <div class="transcription-summary-card">
            <span>{{ t('settings.transcription.summaryOutput') }}</span>
            <strong>{{ defaultOutputLocationLabel }}</strong>
          </div>
        </div>

        <n-form label-placement="top" :model="localSettings">
          <div class="setting-group">
            <div class="setting-group-head">
              <h3>{{ t('settings.transcription.groupRuntime') }}</h3>
              <p>{{ t('settings.transcription.groupRuntimeHint') }}</p>
            </div>
            <n-grid :cols="2" :x-gap="12" :y-gap="8" responsive="screen" item-responsive>
              <n-form-item-gi span="2 m:1" :label="t('settings.transcription.threads')">
                <n-input-number v-model:value="localSettings.threads" :min="1" :max="16" />
              </n-form-item-gi>
              <n-form-item-gi span="2 m:1" :label="t('settings.transcription.useMetal')">
                <div class="inline-switch-field">
                  <n-switch v-model:value="localSettings.useMetal" />
                  <n-text class="switch-label">{{ t('settings.transcription.useMetalHint') }}</n-text>
                </div>
              </n-form-item-gi>
            </n-grid>
          </div>

          <div class="setting-group">
            <div class="setting-group-head">
              <h3>{{ t('settings.transcription.groupLanguage') }}</h3>
              <p>{{ t('settings.transcription.groupLanguageHint') }}</p>
            </div>
            <n-form-item :label="t('settings.transcription.defaultLanguage')">
              <n-select
                data-testid="default-language-select"
                v-model:value="localSettings.language"
                :options="transcriptionLanguageOptions"
              />
            </n-form-item>
          </div>

          <div class="setting-group">
            <div class="setting-group-head">
              <h3>{{ t('settings.transcription.groupOutput') }}</h3>
              <p>{{ t('settings.transcription.groupOutputHint') }}</p>
            </div>
            <n-grid :cols="2" :x-gap="12" :y-gap="8" responsive="screen" item-responsive>
              <n-form-item-gi span="2 m:1" :label="t('settings.transcription.defaultOutputLocation')">
                <n-select
                  v-model:value="defaultOutputLocation"
                  data-testid="default-output-location-select"
                  :options="defaultOutputLocationOptions"
                />
              </n-form-item-gi>
              <n-form-item-gi span="2 m:1" :label="t('settings.transcription.defaultOutputDir')">
                <n-input
                  v-model:value="localSettings.outputDir"
                  :placeholder="t('settings.transcription.outputDirPlaceholder')"
                />
              </n-form-item-gi>
            </n-grid>
          </div>

          <n-button type="primary" class="save-button" data-testid="save-transcription-settings" @click="applyTranscriptionSettings">
            {{ t('settings.transcription.save') }}
          </n-button>
        </n-form>
      </n-card>

      <n-card class="settings-card">
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

      <AiPanel />

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
import AiPanel from '@/components/AiPanel.vue'
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
const currentLocaleLabel = computed(
  () => localeOptions.find((option) => option.value === currentLocale.value)?.label ?? currentLocale.value
)

const transcriptionLanguageOptions = computed(() => [
  { label: t('transcriptionLanguage.auto'), value: 'auto' },
  { label: t('transcriptionLanguage.en'), value: 'en' },
  { label: t('transcriptionLanguage.zh'), value: 'zh' },
  { label: t('transcriptionLanguage.ja'), value: 'ja' },
  { label: t('transcriptionLanguage.ko'), value: 'ko' }
])
const defaultOutputLocationOptions = computed(() => [
  { label: t('settings.transcription.outputLocationDefault'), value: 'default' },
  { label: t('settings.transcription.outputLocationSource'), value: 'source' }
])
const transcriptionLanguageLabel = computed(
  () =>
    transcriptionLanguageOptions.value.find((option) => option.value === localSettings.language)?.label ??
    localSettings.language
)
const defaultOutputLocationLabel = computed(
  () =>
    defaultOutputLocationOptions.value.find((option) => option.value === defaultOutputLocation.value)?.label ??
    defaultOutputLocation.value
)
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
  gap: 18px;
}

.settings-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(260px, 0.8fr);
  gap: 16px;
  padding: 20px;
  border-radius: var(--fw-radius-xl);
  border: 1px solid var(--fw-border);
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(236, 254, 255, 0.84));
  box-shadow: var(--fw-shadow);
}

.settings-eyebrow {
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--fw-primary-strong);
}

.settings-hero h2 {
  margin: 0;
  color: var(--fw-title);
  font-size: clamp(24px, 3vw, 34px);
  line-height: 1.1;
  font-family: 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
}

.settings-copy {
  margin: 10px 0 0;
  max-width: 62ch;
  color: var(--fw-text-muted);
}

.settings-hero-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.settings-hero-stat {
  display: grid;
  align-content: center;
  gap: 8px;
  min-height: 110px;
  padding: 18px;
  border-radius: var(--fw-radius-lg);
  border: 1px solid var(--fw-border);
  background: rgba(255, 255, 255, 0.8);
}

.settings-hero-stat span {
  color: var(--fw-text-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.settings-hero-stat strong {
  color: var(--fw-title);
  font-size: 24px;
}

.settings-card :deep(.n-card) {
  border-radius: var(--fw-radius-lg);
}

.settings-card :deep(.n-card-header__main) {
  color: var(--fw-title);
  font-weight: 700;
}

.settings-card {
  border-radius: var(--fw-radius-lg);
  border: 1px solid var(--fw-border);
  background: linear-gradient(180deg, var(--fw-surface-strong), rgba(255, 255, 255, 0.84));
  box-shadow: var(--fw-shadow-soft);
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

.transcription-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.transcription-summary-card {
  display: grid;
  gap: 8px;
  min-height: 88px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(8, 145, 178, 0.14);
  background: rgba(248, 250, 252, 0.72);
}

.transcription-summary-card span {
  color: var(--fw-text-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.transcription-summary-card strong {
  color: var(--fw-title);
  font-size: 18px;
  line-height: 1.2;
}

.setting-group {
  padding: 16px;
  margin-bottom: 14px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(248, 250, 252, 0.58);
}

.setting-group-head {
  margin-bottom: 12px;
}

.setting-group-head h3 {
  margin: 0;
  color: var(--fw-title);
  font-size: 15px;
}

.setting-group-head p {
  margin: 6px 0 0;
  color: var(--fw-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.inline-switch-field {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px;
}

.switch-label {
  margin-left: 0;
  color: var(--fw-text-muted);
}

.save-button {
  margin-top: 4px;
}

@media (max-width: 900px) {
  .settings-hero {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .settings-hero-panel {
    grid-template-columns: 1fr;
  }

  .transcription-summary {
    grid-template-columns: 1fr;
  }
}
</style>
