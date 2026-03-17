<template>
  <n-card title="Whisper Settings">
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
      <n-form-item>
        <n-switch v-model:value="localSettings.useMetal" />
        <n-text class="switch-label">Use Metal GPU acceleration</n-text>
      </n-form-item>
      <n-button type="primary" @click="apply">Apply</n-button>
    </n-form>
  </n-card>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'

import type { WhisperSettings } from '@shared/types'

const props = defineProps<{
  settings: WhisperSettings
}>()

const emit = defineEmits<{
  apply: [settings: WhisperSettings]
}>()

const localSettings = reactive<WhisperSettings>({ ...props.settings })

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
