<template>
  <n-card title="Task Queue" class="queue-card">
    <n-empty v-if="tasks.length === 0" description="No tasks yet" />
    <n-space v-else vertical size="large">
      <n-card v-for="task in tasks" :key="task.id" size="small">
        <n-space vertical size="small">
          <n-text strong>{{ task.audioPath }}</n-text>
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
        </n-space>
      </n-card>
    </n-space>
  </n-card>
</template>

<script setup lang="ts">
import type { WhisperTaskStatus } from '@shared/types'

defineProps<{
  tasks: Array<{
    id: string
    audioPath: string
    progress: number
    status: WhisperTaskStatus
    message?: string
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
</script>
