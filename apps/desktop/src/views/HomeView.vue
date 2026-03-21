<template>
  <n-message-provider>
    <div class="layout">
      <header class="header">
        <div class="header-copy">
          <div class="workspace-badge">{{ t('home.workspaceBadge') }}</div>
          <h1>{{ t('app.title') }}</h1>
          <p>{{ t('app.subtitleHome') }}</p>
        </div>

        <div class="workspace-stats" aria-label="workspace summary">
          <div class="stat-card">
            <span class="stat-label">{{ t('components.queueTable.summaryTotal', { count: queueStore.items.length }) }}</span>
            <strong>{{ queueStore.items.length }}</strong>
          </div>
          <div class="stat-card">
            <span class="stat-label">{{ t('components.queueTable.summaryActive', { count: activeCount }) }}</span>
            <strong>{{ activeCount }}</strong>
          </div>
          <div class="stat-card">
            <span class="stat-label">{{ t('components.queueTable.summaryDone', { count: doneCount }) }}</span>
            <strong>{{ doneCount }}</strong>
          </div>
        </div>
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
import { computed, onMounted } from 'vue'
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
const activeCount = computed(() =>
  queueStore.items.filter((item) =>
    ['downloading', 'converting', 'transcribing', 'ai'].includes(item.status)
  ).length
)
const doneCount = computed(() => queueStore.items.filter((item) => item.status === 'done').length)
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
  color: var(--fw-text);
}

.header {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.9fr);
  gap: 16px;
  align-items: stretch;
  padding: 6px 0 2px;
}

.header-copy {
  min-width: 0;
}

.workspace-badge {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  margin-bottom: 12px;
  border-radius: 999px;
  background: rgba(8, 145, 178, 0.1);
  border: 1px solid rgba(8, 145, 178, 0.12);
  color: var(--fw-primary-strong);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.header h1 {
  margin: 0;
  font-size: clamp(28px, 3.6vw, 40px);
  line-height: 1.05;
  color: var(--fw-title);
  font-family: 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
}

.header p {
  margin: 10px 0 0;
  max-width: 58ch;
  color: var(--fw-text-muted);
  font-size: 15px;
}

.workspace-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.stat-card {
  display: grid;
  gap: 10px;
  align-content: center;
  min-height: 112px;
  padding: 18px;
  border-radius: var(--fw-radius-lg);
  border: 1px solid var(--fw-border);
  background: linear-gradient(180deg, var(--fw-surface-strong), var(--fw-surface-soft));
  box-shadow: var(--fw-shadow-soft);
}

.stat-label {
  color: var(--fw-text-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.stat-card strong {
  font-size: clamp(22px, 3vw, 30px);
  line-height: 1;
  color: var(--fw-title);
}

.main-grid {
  margin-top: 20px;
  display: grid;
  grid-template-columns: 2fr minmax(320px, 1fr);
  gap: 18px;
}

.left-column {
  display: grid;
  gap: 18px;
}

.right-column {
  display: grid;
  gap: 18px;
}

.right-column :deep(.n-card),
.left-column :deep(.n-card) {
  border-radius: var(--fw-radius-lg);
  border: 1px solid var(--fw-border);
  background: linear-gradient(180deg, var(--fw-surface-strong), rgba(255, 255, 255, 0.84));
  box-shadow: var(--fw-shadow-soft);
}

.right-column :deep(.n-card-header),
.left-column :deep(.n-card-header) {
  padding-bottom: 10px;
}

.right-column :deep(.n-card-header__main),
.left-column :deep(.n-card-header__main) {
  color: var(--fw-title);
  font-weight: 700;
}

.right-column :deep(.n-checkbox),
.right-column :deep(.n-select),
.left-column :deep(.n-select) {
  width: 100%;
}

@media (max-width: 980px) {
  .header {
    grid-template-columns: 1fr;
  }

  .main-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .workspace-stats {
    grid-template-columns: 1fr;
  }
}
</style>
