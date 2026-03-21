<template>
  <n-card :title="t('components.aiQuickToggles.title')" class="ai-quick-toggles">
    <n-form label-placement="top" :model="localSettings">
      <n-form-item>
        <div class="switch-row">
          <div>
            <n-text strong>{{ t('components.aiQuickToggles.enableAiPost') }}</n-text>
            <div class="switch-hint">{{ t('components.aiQuickToggles.enableAiHint') }}</div>
          </div>
          <n-switch v-model:value="localSettings.aiEnabled" />
        </div>
      </n-form-item>

      <n-form-item :label="t('components.aiQuickToggles.aiSteps')">
        <div class="step-grid">
          <label class="step-toggle" data-testid="toggle-correct">
            <span>{{ t('components.aiQuickToggles.stepCorrect') }}</span>
            <n-switch v-model:value="localSettings.aiCorrect" />
          </label>
          <label class="step-toggle" data-testid="toggle-translate">
            <span>{{ t('components.aiQuickToggles.stepTranslate') }}</span>
            <n-switch v-model:value="localSettings.aiTranslate" />
          </label>
          <label class="step-toggle" data-testid="toggle-summary">
            <span>{{ t('components.aiQuickToggles.stepSummary') }}</span>
            <n-switch v-model:value="localSettings.aiSummary" />
          </label>
        </div>
      </n-form-item>

      <n-form-item
        v-if="localSettings.aiTranslate"
        :label="t('components.aiQuickToggles.targetLanguage')"
      >
        <n-select
          v-model:value="localSettings.aiTargetLang"
          data-testid="ai-target-language-select"
          :options="targetLanguageOptions"
        />
      </n-form-item>

      <n-button type="primary" block data-testid="save-ai-settings" @click="applySettings">
        {{ t('components.aiQuickToggles.saveSettings') }}
      </n-button>
    </n-form>
  </n-card>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'

import type { WorkflowSettings } from '@shared/types'
import { useWhisperStore } from '@/stores/whisper'

type AiQuickSettings = Pick<
  WorkflowSettings,
  'aiEnabled' | 'aiCorrect' | 'aiTranslate' | 'aiSummary' | 'aiTargetLang'
>

const { t } = useI18n()
const whisperStore = useWhisperStore()
const message = useMessage()

const localSettings = reactive<AiQuickSettings>(createFormState(whisperStore.settings))
const targetLanguageOptions = [
  { label: '繁体中文', value: 'zh-TW' },
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en' },
  { label: '日本語', value: 'ja' },
  { label: '한국어', value: 'ko' }
]

watch(
  () => whisperStore.settings,
  (next) => {
    Object.assign(localSettings, createFormState(next))
  },
  { deep: true }
)

async function applySettings() {
  try {
    await whisperStore.updateSettings({
      aiEnabled: localSettings.aiEnabled,
      aiCorrect: localSettings.aiCorrect,
      aiTranslate: localSettings.aiTranslate,
      aiSummary: localSettings.aiSummary,
      aiTargetLang: localSettings.aiTargetLang
    })
    message.success(t('components.aiQuickToggles.settingsSaved'))
  } catch (error) {
    message.error(t('components.aiQuickToggles.saveFailed'))
  }
}

function createFormState(settings: WorkflowSettings): AiQuickSettings {
  return {
    aiEnabled: settings.aiEnabled,
    aiCorrect: settings.aiCorrect,
    aiTranslate: settings.aiTranslate,
    aiSummary: settings.aiSummary,
    aiTargetLang: settings.aiTargetLang
  }
}
</script>

<style scoped>
.ai-quick-toggles {
  border-radius: var(--fw-radius-lg);
  border: 1px solid var(--fw-border);
  background: linear-gradient(180deg, var(--fw-surface-strong), rgba(255, 255, 255, 0.84));
  box-shadow: var(--fw-shadow-soft);
}

.switch-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.switch-hint {
  margin-top: 4px;
  color: var(--fw-text-muted);
}

.step-grid {
  display: grid;
  gap: 12px;
}

.step-toggle {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.78);
  border: 1px solid rgba(148, 163, 184, 0.14);
  transition: border-color 0.2s ease, background-color 0.2s ease;
  cursor: pointer;
}

.step-toggle:hover {
  border-color: var(--fw-border-strong);
  background: rgba(236, 254, 255, 0.78);
}
</style>
