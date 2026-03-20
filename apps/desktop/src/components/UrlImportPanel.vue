<template>
  <n-card :title="t('components.urlImportPanel.title')">
    <n-space vertical size="medium">
      <n-input
        v-model:value="localValue"
        type="textarea"
        :placeholder="t('components.urlImportPanel.placeholder')"
        :autosize="{ minRows: 4, maxRows: 8 }"
      />
      <n-space justify="space-between" align="center">
        <n-text depth="3">{{ t('components.urlImportPanel.hint') }}</n-text>
        <n-button type="primary" secondary @click="submit">{{ t('components.urlImportPanel.queueUrls') }}</n-button>
      </n-space>
    </n-space>
  </n-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const emit = defineEmits<{
  submit: [value: string]
}>()

const localValue = ref('')

function submit() {
  emit('submit', localValue.value)
  localValue.value = ''
}
</script>
