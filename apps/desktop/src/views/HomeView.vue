<template>
  <n-message-provider>
    <div class="layout">
      <header class="header">
        <h1>{{ t('app.title') }}</h1>
        <p>{{ t('app.subtitleHome') }}</p>
      </header>

      <section class="main-grid">
        <div class="left-column">
          <ImportPanel />
          <QueueTable />
        </div>
        <div class="right-column">
          <AiQuickToggles />
          <n-card :title="t('home.transcriptionLanguage.title')">
            <n-form-item :label="t('home.transcriptionLanguage.label')">
              <n-select
                data-testid="temporary-language-select"
                :value="effectiveLanguage"
                :options="transcriptionLanguageOptions"
                @update:value="handleTemporaryLanguageChange"
              />
            </n-form-item>
            <n-text depth="3">
              {{ t('home.transcriptionLanguage.hint') }}
            </n-text>
          </n-card>
          <n-card :title="t('home.outputFormats')">
            <n-checkbox-group
              :value="whisperStore.settings.outputFormats"
              @update:value="handleOutputFormatsChange"
            >
              <n-space vertical>
                <n-checkbox v-for="format in whisperStore.outputFormats" :key="format" :value="format">
                  {{ format.toUpperCase() }}
                </n-checkbox>
              </n-space>
            </n-checkbox-group>
          </n-card>
        </div>
      </section>
    </div>
  </n-message-provider>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import type { OutputFormat } from '@shared/types'
import AiQuickToggles from '@/components/AiQuickToggles.vue'
import ImportPanel from '@/components/ImportPanel.vue'
import QueueTable from '@/components/QueueTable.vue'
import { useAiStore } from '@/stores/ai'
import { useQueueStore } from '@/stores/queue'
import { useWhisperStore } from '@/stores/whisper'
import type { TranscriptionLanguageValue } from '@/utils/transcription-language'

const { t } = useI18n()
const whisperStore = useWhisperStore()
const queueStore = useQueueStore()
const aiStore = useAiStore()

const effectiveLanguage = computed(() => whisperStore.getEffectiveLanguage())
const transcriptionLanguageOptions = computed(() => [
  { label: t('transcriptionLanguage.auto'), value: 'auto' },
  { label: t('transcriptionLanguage.en'), value: 'en' },
  { label: t('transcriptionLanguage.zh'), value: 'zh' },
  { label: t('transcriptionLanguage.ja'), value: 'ja' },
  { label: t('transcriptionLanguage.ko'), value: 'ko' }
])

onMounted(async () => {
  queueStore.bindIpcListeners()
  whisperStore.bindIpcListeners()
  aiStore.bindIpcListeners()
  await whisperStore.initialize()
  await aiStore.initialize()
})

onBeforeUnmount(() => {
  queueStore.reset()
  whisperStore.reset()
  aiStore.reset()
})

function handleOutputFormatsChange(formats: string[]) {
  const nextFormats = formats as OutputFormat[]
  if (nextFormats.length === 0) {
    return
  }

  void whisperStore.updateSettings({
    outputFormats: nextFormats
  })
}

function handleTemporaryLanguageChange(language: string) {
  whisperStore.setTemporaryLanguage(language as TranscriptionLanguageValue)
}
</script>

<style scoped>
.layout {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdfa 0%, #f8fafc 38%, #ffffff 100%);
  color: #0f172a;
  padding: 20px;
}

.header h1 {
  margin: 0;
  font-size: 30px;
}

.header p {
  margin-top: 6px;
  color: #334155;
}

.main-grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 2fr minmax(320px, 1fr);
  gap: 16px;
}

.left-column {
  display: grid;
  gap: 16px;
}

.right-column {
  display: grid;
  gap: 16px;
}

@media (max-width: 980px) {
  .main-grid {
    grid-template-columns: 1fr;
  }
}
</style>
