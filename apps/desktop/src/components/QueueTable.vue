<template>
  <n-card :title="t('components.queueTable.title')" class="queue-table">
    <div class="summary">
      <div class="summary-chip">
        <span>{{ t('components.queueTable.summaryTotal', { count: queueStore.items.length }) }}</span>
      </div>
      <div class="summary-chip">
        <span>{{ t('components.queueTable.summaryActive', { count: activeCount }) }}</span>
      </div>
      <div class="summary-chip">
        <span>{{ t('components.queueTable.summaryDone', { count: doneCount }) }}</span>
      </div>
      <div class="summary-chip summary-chip-error">
        <span>{{ t('components.queueTable.summaryError', { count: errorCount }) }}</span>
      </div>
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
  border-radius: var(--fw-radius-lg);
  border: 1px solid var(--fw-border);
  background: linear-gradient(180deg, var(--fw-surface-strong), rgba(255, 255, 255, 0.84));
  box-shadow: var(--fw-shadow-soft);
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}

.summary-chip {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(8, 145, 178, 0.08);
  border: 1px solid rgba(8, 145, 178, 0.12);
  color: var(--fw-primary-strong);
  font-size: 13px;
  font-weight: 600;
}

.summary-chip-error {
  color: #b91c1c;
  background: rgba(248, 113, 113, 0.08);
  border-color: rgba(248, 113, 113, 0.16);
}

.list {
  display: grid;
  gap: 12px;
}

</style>
