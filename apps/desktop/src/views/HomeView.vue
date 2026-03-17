<template>
  <n-config-provider>
    <n-message-provider>
      <div class="layout">
        <header class="header">
          <h1>FOSSWhisper</h1>
          <p>Mac local transcription with whisper.cpp + Metal</p>
        </header>

        <section class="main-grid">
          <div class="left-column">
            <DropZone @files="handleFiles" />
            <TaskQueue :tasks="store.tasks" />
          </div>
          <SettingsPanel :settings="store.settings" @apply="store.updateSettings" />
        </section>
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import DropZone from '@/components/DropZone.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import TaskQueue from '@/components/TaskQueue.vue'
import { useWhisperStore } from '@/stores/whisper'

const store = useWhisperStore()

onMounted(() => {
  store.bindIpcListeners()
})

onBeforeUnmount(() => {
  store.reset()
})

async function handleFiles(paths: string[]) {
  if (paths.length === 0) {
    return
  }
  await store.enqueueFiles(paths)
}
</script>

<style scoped>
.layout {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0fdfa 0%, #f8fafc 38%, #ffffff 100%);
  color: #0f172a;
  padding: 20px;
}

.header h1 {
  margin: 0;
  font-size: 30px;
}

.header p {
  margin-top: 6px;
  color: #334155;
}

.main-grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 2fr minmax(320px, 1fr);
  gap: 16px;
}

.left-column {
  display: grid;
  gap: 16px;
}

@media (max-width: 980px) {
  .main-grid {
    grid-template-columns: 1fr;
  }
}
</style>
