<template>
  <n-card title="Task Queue" class="queue-card">
    <n-empty v-if="tasks.length === 0" description="No tasks yet" />
    <n-space v-else vertical size="large">
      <n-card v-for="task in tasks" :key="task.id" size="small">
        <n-space vertical size="small">
          <n-text strong>{{ task.audioPath || task.url || 'Pending task' }}</n-text>
          <n-progress
            type="line"
            :status="toProgressStatus(task.status)"
            :percentage="task.progress"
            :show-indicator="true"
            :height="14"
          />
          <n-space justify="space-between">
            <n-tag :type="toTagType(task.status)" size="small">{{ task.status }}</n-tag>
            <n-text depth="3">{{ task.message || '-' }}</n-text>
          </n-space>
          <n-text v-if="task.transcript" depth="3" class="preview">
            Transcript: {{ truncate(task.transcript) }}
          </n-text>
          <n-text
            v-for="(result, key) in task.aiResults"
            :key="key"
            depth="3"
            class="preview"
          >
            {{ key }}: {{ truncate(result || '') }}
          </n-text>
        </n-space>
      </n-card>
    </n-space>
  </n-card>
</template>

<script setup lang="ts">
import type { AiTaskType, WhisperTaskStatus } from '@shared/types'

defineProps<{
  tasks: Array<{
    id: string
    audioPath: string
    url?: string
    progress: number
    status: WhisperTaskStatus
    message?: string
    transcript?: string
    aiResults?: Partial<Record<AiTaskType, string>>
  }>
}>()

function toProgressStatus(status: WhisperTaskStatus): 'default' | 'success' | 'error' {
  if (status === 'completed') return 'success'
  if (status === 'error') return 'error'
  return 'default'
}

function toTagType(status: WhisperTaskStatus): 'default' | 'success' | 'error' | 'warning' {
  if (status === 'completed') return 'success'
  if (status === 'error') return 'error'
  if (status === 'running') return 'warning'
  return 'default'
}

function truncate(text: string): string {
  if (text.length <= 120) {
    return text
  }
  return `${text.slice(0, 117)}...`
}
</script>

<style scoped>
.preview {
  white-space: pre-wrap;
}
</style>
