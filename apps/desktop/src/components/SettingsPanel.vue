<template>
  <n-card title="转录设置">
    <n-form label-placement="top" :model="localSettings">
      <n-form-item label="模型路径">
        <n-input v-model:value="localSettings.modelPath" placeholder="/models/ggml-base.bin" />
      </n-form-item>
      <n-form-item label="线程数">
        <n-input-number v-model:value="localSettings.threads" :min="1" :max="16" />
      </n-form-item>
      <n-form-item label="语言">
        <n-input v-model:value="localSettings.language" placeholder="auto" />
      </n-form-item>
      <n-form-item label="输出目录">
        <n-input v-model:value="localSettings.outputDir" placeholder="default: ./outputs" />
      </n-form-item>
      <n-form-item label="yt-dlp 音频格式">
        <n-input v-model:value="localSettings.ytdlpAudioFormat" placeholder="mp3 / wav / m4a" />
      </n-form-item>
      <n-form-item label="yt-dlp Cookies 路径">
        <n-input v-model:value="localSettings.ytdlpCookiesPath" placeholder="optional cookies.txt path" />
      </n-form-item>
      <n-form-item>
        <n-switch v-model:value="localSettings.useMetal" />
        <n-text class="switch-label">启用 Metal GPU 加速</n-text>
      </n-form-item>
      <n-button type="primary" @click="apply">应用设置</n-button>
    </n-form>
  </n-card>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'

import type { WorkflowSettings } from '@shared/types'

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
