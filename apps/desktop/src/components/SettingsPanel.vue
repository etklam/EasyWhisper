<template>
  <n-card title="Workflow Settings">
    <n-form label-placement="top" :model="localSettings">
      <n-form-item label="Model Path">
        <n-input v-model:value="localSettings.modelPath" placeholder="/models/ggml-base.bin" />
      </n-form-item>
      <n-form-item label="Threads">
        <n-input-number v-model:value="localSettings.threads" :min="1" :max="16" />
      </n-form-item>
      <n-form-item label="Language">
        <n-input v-model:value="localSettings.language" placeholder="auto" />
      </n-form-item>
      <n-form-item label="Output Directory">
        <n-input v-model:value="localSettings.outputDir" placeholder="default: ./outputs" />
      </n-form-item>
      <n-form-item label="yt-dlp Audio Format">
        <n-input v-model:value="localSettings.ytdlpAudioFormat" placeholder="mp3 / wav / m4a" />
      </n-form-item>
      <n-form-item label="yt-dlp Cookies Path">
        <n-input v-model:value="localSettings.ytdlpCookiesPath" placeholder="optional cookies.txt path" />
      </n-form-item>
      <n-form-item>
        <n-switch v-model:value="localSettings.useMetal" />
        <n-text class="switch-label">Use Metal GPU acceleration</n-text>
      </n-form-item>
      <n-form-item>
        <n-switch v-model:value="localSettings.aiEnabled" />
        <n-text class="switch-label">Enable AI post-processing</n-text>
      </n-form-item>
      <n-form-item label="AI Model">
        <n-input v-model:value="localSettings.aiModel" placeholder="e.g. llama3.1" />
      </n-form-item>
      <n-form-item label="AI Target Language">
        <n-input v-model:value="localSettings.aiTargetLang" placeholder="zh-TW" />
      </n-form-item>
      <n-form-item>
        <n-switch v-model:value="localSettings.aiCorrect" />
        <n-text class="switch-label">Correct transcript</n-text>
      </n-form-item>
      <n-form-item>
        <n-switch v-model:value="localSettings.aiTranslate" />
        <n-text class="switch-label">Translate transcript</n-text>
      </n-form-item>
      <n-form-item>
        <n-switch v-model:value="localSettings.aiSummary" />
        <n-text class="switch-label">Summarize transcript</n-text>
      </n-form-item>
      <n-form-item v-if="aiModels.length > 0" label="Detected Ollama Models">
        <n-text depth="3">{{ aiModels.join(', ') }}</n-text>
      </n-form-item>
      <n-button type="primary" @click="apply">Apply</n-button>
    </n-form>
  </n-card>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'

import type { WorkflowSettings } from '@shared/types'

const props = defineProps<{
  settings: WorkflowSettings
  aiModels: string[]
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
