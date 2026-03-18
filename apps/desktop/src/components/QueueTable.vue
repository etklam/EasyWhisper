<template>
  <n-card title="批次任务列表" class="queue-table">
    <div class="summary">
      <n-text depth="3">总计 {{ queueStore.items.length }} 项</n-text>
      <n-text depth="3">进行中 {{ activeCount }} 项</n-text>
      <n-text depth="3">已完成 {{ doneCount }} 项</n-text>
      <n-text depth="3">失败 {{ errorCount }} 项</n-text>
    </div>

    <n-empty v-if="queueStore.items.length === 0" description="队列为空，先导入文件或 URL" />
    <div v-else class="list">
      <QueueItem v-for="task in queueStore.items" :key="task.id" :task="task" />
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import QueueItem from '@/components/QueueItem.vue'
import { useQueueStore } from '@/stores/queue'

const queueStore = useQueueStore()

const activeCount = computed(() =>
  queueStore.items.filter((item) =>
    ['downloading', 'converting', 'transcribing', 'ai'].includes(item.status)
  ).length
)
const doneCount = computed(() => queueStore.items.filter((item) => item.status === 'done').length)
const errorCount = computed(() => queueStore.items.filter((item) => item.status === 'error').length)
</script>

<style scoped>
.queue-table {
  border-radius: 18px;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 16px;
}

.list {
  display: grid;
  gap: 12px;
}
</style>
