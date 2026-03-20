<template>
  <n-card :title="t('components.settingsPanel.title')">
    <n-form label-placement="top" :model="localSettings">
      <n-form-item :label="t('components.settingsPanel.modelPath')">
        <n-input
          v-model:value="localSettings.modelPath"
          :placeholder="t('components.settingsPanel.modelPathPlaceholder')"
        />
      </n-form-item>
      <n-form-item :label="t('components.settingsPanel.threads')">
        <n-input-number v-model:value="localSettings.threads" :min="1" :max="16" />
      </n-form-item>
      <n-form-item :label="t('components.settingsPanel.language')">
        <n-input
          v-model:value="localSettings.language"
          :placeholder="t('components.settingsPanel.languagePlaceholder')"
        />
      </n-form-item>
      <n-form-item :label="t('components.settingsPanel.outputDir')">
        <n-input
          v-model:value="localSettings.outputDir"
          :placeholder="t('components.settingsPanel.outputDirPlaceholder')"
        />
      </n-form-item>
      <n-form-item :label="t('components.settingsPanel.ytdlpAudioFormat')">
        <n-input
          v-model:value="localSettings.ytdlpAudioFormat"
          :placeholder="t('components.settingsPanel.ytdlpAudioFormatPlaceholder')"
        />
      </n-form-item>
      <n-form-item :label="t('components.settingsPanel.ytdlpCookiesPath')">
        <n-input
          v-model:value="localSettings.ytdlpCookiesPath"
          :placeholder="t('components.settingsPanel.ytdlpCookiesPathPlaceholder')"
        />
      </n-form-item>
      <n-form-item>
        <n-switch v-model:value="localSettings.useMetal" />
        <n-text class="switch-label">{{ t('components.settingsPanel.enableMetal') }}</n-text>
      </n-form-item>
      <n-button type="primary" @click="apply">{{ t('components.settingsPanel.applySettings') }}</n-button>
    </n-form>
  </n-card>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { WorkflowSettings } from '@shared/types'

const { t } = useI18n()

const props = defineProps<{
  settings: WorkflowSettings
}>()

const emit = defineEmits<{
  apply: [settings: WorkflowSettings]
}>()

const localSettings = reactive<WorkflowSettings>({ ...props.settings })

watch(
  () => props.settings,
  (next) => {
    Object.assign(localSettings, next)
  },
  { deep: true }
)

function apply() {
  emit('apply', { ...localSettings })
}
</script>

<style scoped>
.switch-label {
  margin-left: 10px;
}
</style>
