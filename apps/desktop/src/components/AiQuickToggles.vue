<template>
  <n-card title="AI 快捷设置" class="ai-quick-toggles">
    <n-form label-placement="top" :model="localSettings">
      <n-form-item>
        <div class="switch-row">
          <div>
            <n-text strong>启用 AI 后处理</n-text>
            <div class="switch-hint">转录完成后自动进入 AI 队列</div>
          </div>
          <n-switch v-model:value="localSettings.aiEnabled" />
        </div>
      </n-form-item>

      <n-form-item label="AI 步骤">
        <div class="step-grid">
          <label class="step-toggle" data-testid="toggle-correct">
            <span>修正</span>
            <n-switch v-model:value="localSettings.aiCorrect" />
          </label>
          <label class="step-toggle" data-testid="toggle-translate">
            <span>翻译</span>
            <n-switch v-model:value="localSettings.aiTranslate" />
          </label>
          <label class="step-toggle" data-testid="toggle-summary">
            <span>摘要</span>
            <n-switch v-model:value="localSettings.aiSummary" />
          </label>
        </div>
      </n-form-item>

      <n-button type="primary" block data-testid="save-ai-settings" @click="applySettings">
        保存 AI 设置
      </n-button>
    </n-form>
  </n-card>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useMessage } from 'naive-ui'

import type { WorkflowSettings } from '@shared/types'
import { useWhisperStore } from '@/stores/whisper'

type AiQuickSettings = Pick<
  WorkflowSettings,
  'aiEnabled' | 'aiCorrect' | 'aiTranslate' | 'aiSummary'
>

const whisperStore = useWhisperStore()
const message = useMessage()

const localSettings = reactive<AiQuickSettings>(createFormState(whisperStore.settings))

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
      aiSummary: localSettings.aiSummary
    })
    message.success('AI 设置已保存')
  } catch (error) {
    message.error('保存失败，请重试')
  }
}

function createFormState(settings: WorkflowSettings): AiQuickSettings {
  return {
    aiEnabled: settings.aiEnabled,
    aiCorrect: settings.aiCorrect,
    aiTranslate: settings.aiTranslate,
    aiSummary: settings.aiSummary
  }
}
</script>

<style scoped>
.ai-quick-toggles {
  border-radius: 18px;
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
  color: #64748b;
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
  padding: 10px 12px;
  border-radius: 12px;
  background: #f8fafc;
}
</style>
