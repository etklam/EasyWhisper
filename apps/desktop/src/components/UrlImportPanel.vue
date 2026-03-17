<template>
  <n-card title="Import From URLs">
    <n-space vertical size="medium">
      <n-input
        v-model:value="localValue"
        type="textarea"
        placeholder="Paste one video URL per line"
        :autosize="{ minRows: 4, maxRows: 8 }"
      />
      <n-space justify="space-between" align="center">
        <n-text depth="3">Supports YouTube-style batch input and ignores comment lines.</n-text>
        <n-button type="primary" secondary @click="submit">Queue URLs</n-button>
      </n-space>
    </n-space>
  </n-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  submit: [value: string]
}>()

const localValue = ref('')

function submit() {
  emit('submit', localValue.value)
  localValue.value = ''
}
</script>
