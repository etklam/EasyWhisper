<template>
  <n-card class="drop-zone" :bordered="true">
    <div
      class="drop-target"
      :class="{ active: isDragging }"
      @dragenter.prevent="isDragging = true"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <p class="title">Drop audio/video files here</p>
      <p class="hint">or pick files manually</p>
      <n-button tertiary type="primary" @click="openFilePicker">Choose Files</n-button>
      <input
        ref="inputRef"
        type="file"
        class="hidden-input"
        multiple
        accept=".mp3,.wav,.m4a,.mp4,.mov,.mkv"
        @change="handleFileInput"
      />
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  files: [paths: string[]]
}>()

const isDragging = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

function extractPaths(list: FileList | null): string[] {
  if (!list) return []
  return Array.from(list)
    .map((file) => (file as File & { path?: string }).path)
    .filter((path): path is string => Boolean(path))
}

function handleDrop(event: DragEvent) {
  isDragging.value = false
  emit('files', extractPaths(event.dataTransfer?.files ?? null))
}

function handleFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  emit('files', extractPaths(input.files))
  input.value = ''
}

function openFilePicker() {
  inputRef.value?.click()
}
</script>

<style scoped>
.drop-zone {
  border-radius: 16px;
}

.drop-target {
  border: 2px dashed #94a3b8;
  border-radius: 12px;
  padding: 28px;
  display: grid;
  justify-items: center;
  gap: 10px;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.drop-target.active {
  border-color: #0f766e;
  background-color: #ecfeff;
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.hint {
  margin: 0;
  color: #64748b;
}

.hidden-input {
  display: none;
}
</style>
