<template>
  <n-card size="small" class="queue-item">
    <div class="header">
      <div class="title-wrap">
        <span class="status-dot" :class="`status-${task.status}`" />
        <div>
          <div class="title-line">
            <n-text strong>{{ task.title }}</n-text>
            <n-tag size="small" :type="sourceTagType">{{ sourceLabel }}</n-tag>
            <n-tag size="small" :type="statusTagType">{{ statusLabel }}</n-tag>
            <n-tag v-if="task.paused && task.status === 'pending'" size="small">已暂停</n-tag>
          </div>
          <n-text depth="3" class="subline">{{ task.filePath || task.url || '等待处理' }}</n-text>
        </div>
      </div>

      <div class="actions">
        <n-button size="small" tertiary @click="queueStore.togglePause(task.id)" :disabled="pauseDisabled">
          {{ task.paused ? '继续' : '暂停' }}
        </n-button>
        <n-button size="small" tertiary type="warning" @click="queueStore.cancelTask(task.id)" :disabled="cancelDisabled">
          取消
        </n-button>
        <n-button size="small" tertiary type="primary" @click="queueStore.retryTask(task.id)" :disabled="retryDisabled">
          重试
        </n-button>
      </div>
    </div>

    <div class="progress-grid">
      <div v-if="task.source === 'ytdlp'" class="progress-block">
        <div class="progress-label">
          <n-text depth="3">下载进度</n-text>
          <n-text depth="3">{{ task.downloadProgress }}%</n-text>
        </div>
        <n-progress type="line" :percentage="task.downloadProgress" :height="10" :show-indicator="false" />
      </div>

      <div class="progress-block">
        <div class="progress-label">
          <n-text depth="3">转录进度</n-text>
          <n-text depth="3">{{ task.transcribeProgress }}%</n-text>
        </div>
        <n-progress
          type="line"
          :percentage="task.transcribeProgress"
          :status="task.status === 'error' ? 'error' : task.status === 'done' ? 'success' : 'default'"
          :height="10"
          :show-indicator="false"
        />
      </div>

      <div v-if="task.status === 'ai' || task.aiProgress > 0 || hasAiResults" class="progress-block">
        <div class="progress-label">
          <n-text depth="3">
            AI 进度{{ task.aiCurrentStep ? `（${aiStepLabel(task.aiCurrentStep)}）` : '' }}
          </n-text>
          <n-text depth="3">{{ task.aiProgress }}%</n-text>
        </div>
        <n-progress
          type="line"
          :percentage="task.aiProgress"
          :status="task.aiError ? 'error' : task.status === 'done' && hasAiResults ? 'success' : 'default'"
          :height="10"
          :show-indicator="false"
        />
      </div>
    </div>

    <n-text v-if="task.message" depth="3" class="message">{{ task.message }}</n-text>
    <n-text v-if="task.error" type="error" class="message">{{ task.error }}</n-text>
    <n-text v-if="hasAiResults" depth="3" class="message">
      已生成：{{ aiResultLabels.join('、') }}
    </n-text>
  </n-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import type { AiTaskType } from '@shared/types'
import type { QueueTask } from '@/stores/queue'
import { useQueueStore } from '@/stores/queue'

const props = defineProps<{
  task: QueueTask
}>()

const queueStore = useQueueStore()

const sourceLabel = computed(() => (props.task.source === 'file' ? '文件' : 'URL'))
const sourceTagType = computed(() => (props.task.source === 'file' ? 'default' : 'info'))
const pauseDisabled = computed(() => props.task.status !== 'pending' && !props.task.paused)
const cancelDisabled = computed(() => props.task.status === 'done' || props.task.status === 'error')
const retryDisabled = computed(() => props.task.status !== 'error')
const hasAiResults = computed(() => Object.keys(props.task.aiResults).length > 0)
const aiResultLabels = computed(() =>
  Object.keys(props.task.aiResults).map((taskType) => aiStepLabel(taskType as AiTaskType))
)

const statusLabel = computed(() => {
  const labels: Record<QueueTask['status'], string> = {
    pending: '等待中',
    downloading: '下载中',
    converting: '准备中',
    transcribing: '转录中',
    ai: 'AI 处理中',
    done: '已完成',
    error: '失败'
  }
  return labels[props.task.status]
})

const statusTagType = computed(() => {
  if (props.task.status === 'done') return 'success'
  if (props.task.status === 'error') return 'error'
  if (props.task.status === 'downloading' || props.task.status === 'transcribing' || props.task.status === 'ai') {
    return 'warning'
  }
  return 'default'
})

function aiStepLabel(step: AiTaskType): string {
  if (step === 'correct') return '修正'
  if (step === 'translate') return '翻译'
  return '摘要'
}
</script>

<style scoped>
.queue-item {
  border-radius: 16px;
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.title-wrap {
  display: flex;
  gap: 10px;
  min-width: 0;
}

.title-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.subline {
  display: block;
  margin-top: 6px;
  word-break: break-all;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  margin-top: 7px;
  flex: 0 0 auto;
  background: #94a3b8;
}

.status-pending {
  background: #94a3b8;
}

.status-downloading,
.status-converting,
.status-transcribing,
.status-ai {
  background: #f59e0b;
}

.status-done {
  background: #16a34a;
}

.status-error {
  background: #dc2626;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.progress-grid {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.progress-block {
  display: grid;
  gap: 6px;
}

.progress-label {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.message {
  display: block;
  margin-top: 10px;
}

@media (max-width: 720px) {
  .header {
    flex-direction: column;
  }
}
</style>
