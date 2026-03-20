<template>
  <n-card :title="t('components.aiPanel.title')" class="ai-panel">
    <div class="panel-head">
      <div>
        <div class="status-row">
          <n-text depth="3">{{ t('components.aiPanel.ollamaStatus') }}</n-text>
          <n-tag :type="statusTagType">{{ statusLabel }}</n-tag>
        </div>
        <n-text depth="3">
          {{ statusHint }}
        </n-text>
      </div>
      <n-button size="small" secondary :loading="aiStore.loadingModels" @click="refreshOllama">
        {{ t('components.aiPanel.refresh') }}
      </n-button>
    </div>

    <n-divider />

    <n-form label-placement="top" :model="localSettings">
      <n-form-item>
        <div class="switch-row">
          <div>
            <n-text strong>{{ t('components.aiPanel.enableAiPost') }}</n-text>
            <div class="switch-hint">{{ t('components.aiPanel.enableAiHint') }}</div>
          </div>
          <n-switch v-model:value="localSettings.aiEnabled" />
        </div>
      </n-form-item>

      <n-form-item :label="t('components.aiPanel.ollamaModel')">
        <n-select
          v-model:value="localSettings.aiModel"
          :options="modelOptions"
          :placeholder="t('components.aiPanel.selectModelPlaceholder')"
          :disabled="aiStore.connectionStatus !== 'connected'"
          clearable
        />
      </n-form-item>

      <n-form-item :label="t('components.aiPanel.targetLanguage')">
        <n-select v-model:value="localSettings.aiTargetLang" :options="targetLanguageOptions" />
      </n-form-item>

      <n-form-item :label="t('components.aiPanel.aiSteps')">
        <div class="step-grid">
          <label class="step-toggle">
            <span>{{ t('components.aiPanel.stepCorrect') }}</span>
            <n-switch v-model:value="localSettings.aiCorrect" />
          </label>
          <label class="step-toggle">
            <span>{{ t('components.aiPanel.stepTranslate') }}</span>
            <n-switch v-model:value="localSettings.aiTranslate" />
          </label>
          <label class="step-toggle">
            <span>{{ t('components.aiPanel.stepSummary') }}</span>
            <n-switch v-model:value="localSettings.aiSummary" />
          </label>
        </div>
      </n-form-item>

      <n-form-item :label="t('components.aiPanel.correctPrompt')">
        <n-input
          v-model:value="localSettings.aiCustomPrompts.correct"
          type="textarea"
          :placeholder="t('components.aiPanel.promptPlaceholder')"
          :autosize="{ minRows: 3, maxRows: 6 }"
        />
      </n-form-item>

      <n-form-item :label="t('components.aiPanel.translatePrompt')">
        <n-input
          v-model:value="localSettings.aiCustomPrompts.translate"
          type="textarea"
          :placeholder="t('components.aiPanel.promptPlaceholder')"
          :autosize="{ minRows: 3, maxRows: 6 }"
        />
      </n-form-item>

      <n-form-item :label="t('components.aiPanel.summaryPrompt')">
        <n-input
          v-model:value="localSettings.aiCustomPrompts.summary"
          type="textarea"
          :placeholder="t('components.aiPanel.promptPlaceholder')"
          :autosize="{ minRows: 3, maxRows: 6 }"
        />
      </n-form-item>

      <n-button type="primary" @click="applySettings">{{ t('components.aiPanel.saveSettings') }}</n-button>
    </n-form>

    <n-divider />

    <div class="queue-head">
      <n-text strong>{{ t('components.aiPanel.aiTaskStatus') }}</n-text>
      <n-text depth="3">
        {{ t('components.aiPanel.waitingCount', { count: aiStore.pendingCount, active: aiStore.activeCount }) }}
      </n-text>
    </div>

    <n-empty v-if="aiStore.workflows.length === 0" :description="t('components.aiPanel.noAiTasks')" size="small" />
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
                {{
                  workflow.currentStep
                    ? t('components.aiPanel.currentStep', { step: getStepLabel(workflow.currentStep) })
                    : t('components.aiPanel.waiting')
                }}
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
import { useI18n } from 'vue-i18n'

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

const { t } = useI18n()
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
  if (aiStore.connectionStatus === 'checking') return t('components.aiPanel.statusChecking')
  if (aiStore.connectionStatus === 'connected') return t('components.aiPanel.statusConnected')
  if (aiStore.connectionStatus === 'disconnected') return t('components.aiPanel.statusDisconnected')
  return t('components.aiPanel.statusNotChecked')
})

const statusTagType = computed(() => {
  if (aiStore.connectionStatus === 'connected') return 'success'
  if (aiStore.connectionStatus === 'disconnected') return 'error'
  if (aiStore.connectionStatus === 'checking') return 'info'
  return 'default'
})

const statusHint = computed(() => {
  if (aiStore.connectionStatus === 'connected') {
    return aiStore.models.length > 0
      ? t('components.aiPanel.hintConnectedFound', { count: aiStore.models.length })
      : t('components.aiPanel.hintConnectedNotFound')
  }

  if (aiStore.connectionStatus === 'disconnected') {
    return t('components.aiPanel.hintDisconnected')
  }

  return t('components.aiPanel.hintNotChecked')
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
    message.success(t('components.aiPanel.settingsSaved'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

function getWorkflowStatusLabel(status: AiWorkflowStatus): string {
  if (status === 'pending') return t('components.aiPanel.workflowStatusPending')
  if (status === 'running') return t('components.aiPanel.workflowStatusRunning')
  if (status === 'done') return t('components.aiPanel.workflowStatusDone')
  return t('components.aiPanel.workflowStatusError')
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
  if (step === 'correct') return t('components.aiPanel.stepCorrect')
  if (step === 'translate') return t('components.aiPanel.stepTranslate')
  return t('components.aiPanel.stepSummary')
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
