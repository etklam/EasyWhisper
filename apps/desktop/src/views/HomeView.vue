<template>
  <n-config-provider>
    <n-message-provider>
      <div class="layout">
        <header class="header">
          <h1>FOSSWhisper</h1>
          <p>本机转录工作台：下载、转 WAV、Whisper 转录与输出格式管理</p>
        </header>

        <section class="main-grid">
          <div class="left-column">
            <ImportPanel />
            <QueueTable />
          </div>
          <div class="right-column">
            <AiQuickToggles />
            <n-card title="输出格式">
              <n-checkbox-group
                :value="whisperStore.settings.outputFormats"
                @update:value="handleOutputFormatsChange"
              >
                <n-space vertical>
                  <n-checkbox v-for="format in whisperStore.outputFormats" :key="format" :value="format">
                    {{ format.toUpperCase() }}
                  </n-checkbox>
                </n-space>
              </n-checkbox-group>
            </n-card>
          </div>
        </section>
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import type { OutputFormat } from '@shared/types'
import AiQuickToggles from '@/components/AiQuickToggles.vue'
import ImportPanel from '@/components/ImportPanel.vue'
import QueueTable from '@/components/QueueTable.vue'
import { useAiStore } from '@/stores/ai'
import { useQueueStore } from '@/stores/queue'
import { useWhisperStore } from '@/stores/whisper'

const whisperStore = useWhisperStore()
const queueStore = useQueueStore()
const aiStore = useAiStore()

onMounted(async () => {
  queueStore.bindIpcListeners()
  whisperStore.bindIpcListeners()
  aiStore.bindIpcListeners()
  await whisperStore.initialize()
  await aiStore.initialize()
})

onBeforeUnmount(() => {
  queueStore.reset()
  whisperStore.reset()
  aiStore.reset()
})

function handleOutputFormatsChange(formats: string[]) {
  const nextFormats = formats as OutputFormat[]
  if (nextFormats.length === 0) {
    return
  }

  void whisperStore.updateSettings({
    outputFormats: nextFormats
  })
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

.right-column {
  display: grid;
  gap: 16px;
}

@media (max-width: 980px) {
  .main-grid {
    grid-template-columns: 1fr;
  }
}
</style>
