<template>
  <n-card :title="t('components.queueTable.title')" class="queue-table">
    <div class="summary">
      <n-text depth="3">{{ t('components.queueTable.summaryTotal', { count: queueStore.items.length }) }}</n-text>
      <n-text depth="3">{{ t('components.queueTable.summaryActive', { count: activeCount }) }}</n-text>
      <n-text depth="3">{{ t('components.queueTable.summaryDone', { count: doneCount }) }}</n-text>
      <n-text depth="3">{{ t('components.queueTable.summaryError', { count: errorCount }) }}</n-text>
    </div>

    <n-empty v-if="queueStore.items.length === 0" :description="t('components.queueTable.empty')" />
    <div v-else class="list">
      <QueueItem v-for="task in queueStore.items" :key="task.id" :task="task" />
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import QueueItem from '@/components/QueueItem.vue'
import { useQueueStore } from '@/stores/queue'

const { t } = useI18n()
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
