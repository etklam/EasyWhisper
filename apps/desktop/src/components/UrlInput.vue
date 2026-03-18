<template>
  <n-card title="批量导入 URL">
    <div class="panel">
      <n-input
        v-model:value="rawValue"
        type="textarea"
        placeholder="每行输入一个 URL，支持以 # 开头的注释行"
        :autosize="{ minRows: 5, maxRows: 10 }"
      />

      <div class="toolbar">
        <n-text depth="3">已解析 {{ parsedUrls.length }} 个 URL</n-text>
        <n-button type="primary" secondary :disabled="parsedUrls.length === 0" @click="submit">
          加入队列
        </n-button>
      </div>

      <div class="preview">
        <n-text strong>预览列表</n-text>
        <n-empty v-if="parsedUrls.length === 0" description="尚未检测到有效 URL" size="small" />
        <div v-else class="preview-list">
          <div v-for="(url, index) in parsedUrls" :key="`${index}:${url}`" class="preview-item">
            <span class="preview-index">{{ index + 1 }}</span>
            <n-text class="preview-text">{{ url }}</n-text>
          </div>
        </div>
      </div>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMessage } from 'naive-ui'

import { parseUrlList } from '@shared/url'
import { useQueueStore } from '@/stores/queue'

const rawValue = ref('')
const message = useMessage()
const queueStore = useQueueStore()

const parsedUrls = computed(() => parseUrlList(rawValue.value))

function submit() {
  if (parsedUrls.value.length === 0) {
    message.error('请输入至少一个有效 URL')
    return
  }

  queueStore.enqueueUrls(parsedUrls.value)
  message.success(`已加入 ${parsedUrls.value.length} 个 URL`)
  rawValue.value = ''
}
</script>

<style scoped>
.panel {
  display: grid;
  gap: 14px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.preview {
  display: grid;
  gap: 10px;
}

.preview-list {
  display: grid;
  gap: 8px;
  max-height: 180px;
  overflow: auto;
}

.preview-item {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f8fafc;
}

.preview-index {
  color: #64748b;
  font-size: 12px;
  line-height: 22px;
}

.preview-text {
  word-break: break-all;
}
</style>
