<template>
  <n-card title="AI 功能面板" class="ai-panel">
    <div class="panel-head">
      <div>
        <div class="status-row">
          <n-text depth="3">Ollama 状态</n-text>
          <n-tag :type="statusTagType">{{ statusLabel }}</n-tag>
        </div>
        <n-text depth="3">
          {{ statusHint }}
        </n-text>
      </div>
      <n-button size="small" secondary :loading="aiStore.loadingModels" @click="refreshOllama">
        刷新
      </n-button>
    </div>

    <n-divider />

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

      <n-form-item label="Ollama 模型">
        <n-select
          v-model:value="localSettings.aiModel"
          :options="modelOptions"
          placeholder="请选择模型"
          :disabled="aiStore.connectionStatus !== 'connected'"
          clearable
        />
      </n-form-item>

      <n-form-item label="翻译目标语言">
        <n-select v-model:value="localSettings.aiTargetLang" :options="targetLanguageOptions" />
      </n-form-item>

      <n-form-item label="AI 步骤">
        <div class="step-grid">
          <label class="step-toggle">
            <span>修正</span>
            <n-switch v-model:value="localSettings.aiCorrect" />
          </label>
          <label class="step-toggle">
            <span>翻译</span>
            <n-switch v-model:value="localSettings.aiTranslate" />
          </label>
          <label class="step-toggle">
            <span>摘要</span>
            <n-switch v-model:value="localSettings.aiSummary" />
          </label>
        </div>
      </n-form-item>

      <n-form-item label="修正 Prompt">
        <n-input
          v-model:value="localSettings.aiCustomPrompts.correct"
          type="textarea"
          placeholder="留空则使用预设 prompt"
          :autosize="{ minRows: 3, maxRows: 6 }"
        />
      </n-form-item>

      <n-form-item label="翻译 Prompt">
        <n-input
          v-model:value="localSettings.aiCustomPrompts.translate"
          type="textarea"
          placeholder="留空则使用预设 prompt"
          :autosize="{ minRows: 3, maxRows: 6 }"
        />
      </n-form-item>

      <n-form-item label="摘要 Prompt">
        <n-input
          v-model:value="localSettings.aiCustomPrompts.summary"
          type="textarea"
          placeholder="留空则使用预设 prompt"
          :autosize="{ minRows: 3, maxRows: 6 }"
        />
      </n-form-item>

      <n-button type="primary" @click="applySettings">保存 AI 设置</n-button>
    </n-form>

    <n-divider />

    <div class="queue-head">
      <n-text strong>AI 任务状态</n-text>
      <n-text depth="3">等待 {{ aiStore.pendingCount }} 项，执行中 {{ aiStore.activeCount }} 项</n-text>
    </div>

    <n-empty v-if="aiStore.workflows.length === 0" description="暂无 AI 任务" size="small" />
    <div v-else class="workflow-list">
      <div v-for="workflow in aiStore.workflows.slice(0, 6)" :key="workflow.id" class="workflow-item">
        <div class="workflow-meta">
          <div>
            <n-text strong>{{ workflow.title }}</n-text>
            <div class="workflow-subline">
              <n-tag size="small" :type="getWorkflowTagType(workflow.status)">
                {{ getWorkflowStatusLabel(workflow.status) }}
              </n-tag>
              <n-text depth="3">
                {{ workflow.currentStep ? `当前步骤：${getStepLabel(workflow.currentStep)}` : '等待中' }}
              </n-text>
            </div>
          </div>
          <n-text depth="3">{{ workflow.progress }}%</n-text>
        </div>

        <n-progress
          type="line"
          :percentage="workflow.progress"
          :status="workflow.status === 'error' ? 'error' : workflow.status === 'done' ? 'success' : 'default'"
          :show-indicator="false"
          :height="8"
        />

        <div class="step-status">
          <n-tag v-for="step in workflow.steps" :key="step.taskType" size="small" :type="getStepTagType(step.status)">
            {{ getStepLabel(step.taskType) }}
          </n-tag>
        </div>

        <n-text v-if="workflow.error" type="error" class="workflow-error">
          {{ workflow.error }}
        </n-text>
      </div>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useMessage } from 'naive-ui'

import type { AiTaskType, WorkflowSettings } from '@shared/types'
import { useAiStore, type AiStepStatus, type AiWorkflowStatus } from '@/stores/ai'
import { useWhisperStore } from '@/stores/whisper'

type AiSettingsForm = Pick<
  WorkflowSettings,
  | 'aiEnabled'
  | 'aiModel'
  | 'aiTargetLang'
  | 'aiCorrect'
  | 'aiTranslate'
  | 'aiSummary'
> & {
  aiCustomPrompts: {
    correct: string
    translate: string
    summary: string
  }
}

const whisperStore = useWhisperStore()
const aiStore = useAiStore()
const message = useMessage()

const localSettings = reactive<AiSettingsForm>(createFormState(whisperStore.settings))

const modelOptions = computed(() =>
  aiStore.models.map((model) => ({
    label: model,
    value: model
  }))
)

const targetLanguageOptions = [
  { label: '繁体中文', value: 'zh-TW' },
  { label: '简体中文', value: 'zh-CN' },
  { label: '英文', value: 'en' },
  { label: '日文', value: 'ja' },
  { label: '韩文', value: 'ko' }
]

const statusLabel = computed(() => {
  if (aiStore.connectionStatus === 'checking') return '检查中'
  if (aiStore.connectionStatus === 'connected') return '已连接'
  if (aiStore.connectionStatus === 'disconnected') return '未连接'
  return '未检查'
})

const statusTagType = computed(() => {
  if (aiStore.connectionStatus === 'connected') return 'success'
  if (aiStore.connectionStatus === 'disconnected') return 'error'
  if (aiStore.connectionStatus === 'checking') return 'info'
  return 'default'
})

const statusHint = computed(() => {
  if (aiStore.connectionStatus === 'connected') {
    return aiStore.models.length > 0 ? `已发现 ${aiStore.models.length} 个模型` : '已连接，但尚未找到模型'
  }

  if (aiStore.connectionStatus === 'disconnected') {
    return '请确认 Ollama 已启动，并且本机 API 可访问'
  }

  return '点击刷新以检查 Ollama 状态'
})

watch(
  () => whisperStore.settings,
  (next) => {
    Object.assign(localSettings, createFormState(next))
  },
  { deep: true }
)

async function refreshOllama() {
  await Promise.allSettled([aiStore.refreshStatus(), aiStore.refreshModels()])
}

async function applySettings() {
  try {
    await whisperStore.updateSettings({
      aiEnabled: localSettings.aiEnabled,
      aiModel: localSettings.aiModel,
      aiTargetLang: localSettings.aiTargetLang,
      aiCorrect: localSettings.aiCorrect,
      aiTranslate: localSettings.aiTranslate,
      aiSummary: localSettings.aiSummary,
      aiCustomPrompts: normalizePrompts(localSettings.aiCustomPrompts)
    })
    message.success('AI 设置已保存')
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

function getWorkflowStatusLabel(status: AiWorkflowStatus): string {
  if (status === 'pending') return '排队中'
  if (status === 'running') return '处理中'
  if (status === 'done') return '已完成'
  return '失败'
}

function getWorkflowTagType(status: AiWorkflowStatus): 'default' | 'warning' | 'success' | 'error' {
  if (status === 'running') return 'warning'
  if (status === 'done') return 'success'
  if (status === 'error') return 'error'
  return 'default'
}

function getStepTagType(status: AiStepStatus): 'default' | 'warning' | 'success' | 'error' {
  if (status === 'running') return 'warning'
  if (status === 'done' || status === 'skipped') return 'success'
  if (status === 'error') return 'error'
  return 'default'
}

function getStepLabel(step: AiTaskType): string {
  if (step === 'correct') return '修正'
  if (step === 'translate') return '翻译'
  return '摘要'
}

function createFormState(settings: WorkflowSettings): AiSettingsForm {
  return {
    aiEnabled: settings.aiEnabled,
    aiModel: settings.aiModel,
    aiTargetLang: settings.aiTargetLang,
    aiCorrect: settings.aiCorrect,
    aiTranslate: settings.aiTranslate,
    aiSummary: settings.aiSummary,
    aiCustomPrompts: {
      correct: settings.aiCustomPrompts?.correct ?? '',
      translate: settings.aiCustomPrompts?.translate ?? '',
      summary: settings.aiCustomPrompts?.summary ?? ''
    }
  }
}

function normalizePrompts(prompts: AiSettingsForm['aiCustomPrompts']) {
  return {
    correct: prompts?.correct?.trim() || undefined,
    translate: prompts?.translate?.trim() || undefined,
    summary: prompts?.summary?.trim() || undefined
  }
}
</script>

<style scoped>
.ai-panel {
  border-radius: 18px;
}

.panel-head,
.queue-head,
.workflow-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.status-row,
.workflow-subline,
.step-status {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
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

.step-grid,
.workflow-list {
  display: grid;
  gap: 12px;
}

.step-toggle,
.workflow-item {
  display: grid;
  gap: 8px;
}

.workflow-item {
  padding: 14px;
  border-radius: 14px;
  background: #f8fafc;
}

.workflow-error {
  display: block;
}

@media (max-width: 720px) {
  .panel-head,
  .queue-head,
  .workflow-meta,
  .switch-row {
    grid-template-columns: 1fr;
    display: grid;
  }
}
</style>
