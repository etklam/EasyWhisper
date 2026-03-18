<template>
  <div class="settings-view">
    <n-space vertical :size="16">
      <n-card>
        <template #header>
          <span class="section-title">模型设置</span>
        </template>
        <ModelSelector />
      </n-card>

      <n-card>
        <template #header>
          <span class="section-title">转录设置</span>
        </template>
        <n-form label-placement="top" :model="localSettings">
          <n-grid :cols="2" :x-gap="12" :y-gap="8" responsive="screen" item-responsive>
            <n-form-item-gi span="2 m:1" label="线程数">
              <n-input-number v-model:value="localSettings.threads" :min="1" :max="16" />
            </n-form-item-gi>
            <n-form-item-gi span="2 m:1" label="语言">
              <n-input v-model:value="localSettings.language" placeholder="auto" />
            </n-form-item-gi>
            <n-form-item-gi span="2" label="输出目录">
              <n-input v-model:value="localSettings.outputDir" placeholder="默认使用文稿目录/FOSSWhisper" />
            </n-form-item-gi>
          </n-grid>

          <n-form-item>
            <n-switch v-model:value="localSettings.useMetal" />
            <n-text class="switch-label">启用 Metal GPU 加速</n-text>
          </n-form-item>

          <n-button type="primary" data-testid="save-transcription-settings" @click="applyTranscriptionSettings">保存转录设置</n-button>
        </n-form>
      </n-card>

      <n-card>
        <template #header>
          <span class="section-title">下载设置</span>
        </template>
        <n-form label-placement="top" :model="localSettings">
          <n-form-item label="yt-dlp 音频格式">
            <n-input v-model:value="localSettings.ytdlpAudioFormat" placeholder="mp3 / wav / m4a" />
          </n-form-item>
          <n-form-item label="yt-dlp Cookies 路径">
            <n-input v-model:value="localSettings.ytdlpCookiesPath" placeholder="可选 cookies.txt 路径" />
          </n-form-item>
          <n-button type="primary" data-testid="save-download-settings" @click="applyDownloadSettings">保存下载设置</n-button>
        </n-form>
      </n-card>
    </n-space>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useMessage } from 'naive-ui'

import type { WorkflowSettings } from '@shared/types'
import ModelSelector from '@/components/ModelSelector.vue'
import { useWhisperStore } from '@/stores/whisper'

const whisperStore = useWhisperStore()
const message = useMessage()

const localSettings = reactive({ ...whisperStore.settings })

watch(
  () => whisperStore.settings,
  (next) => {
    Object.assign(localSettings, next)
  },
  { deep: true }
)

async function applyTranscriptionSettings() {
  try {
    await whisperStore.updateSettings({
      threads: localSettings.threads,
      language: localSettings.language,
      useMetal: localSettings.useMetal,
      outputDir: localSettings.outputDir
    })
    message.success('转录设置已保存')
  } catch {
    message.error('保存失败，请重试')
  }
}

async function applyDownloadSettings() {
  try {
    await whisperStore.updateSettings({
      ytdlpAudioFormat: localSettings.ytdlpAudioFormat,
      ytdlpCookiesPath: localSettings.ytdlpCookiesPath
    })
    message.success('下载设置已保存')
  } catch {
    message.error('保存失败，请重试')
  }
}
</script>

<style scoped>
.settings-view {
  display: grid;
  gap: 16px;
}

.section-title {
  font-weight: 600;
}

.switch-label {
  margin-left: 10px;
}
</style>
