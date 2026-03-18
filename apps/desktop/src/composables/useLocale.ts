import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWhisperStore } from '@/stores/whisper'

export function useLocale() {
  const { locale } = useI18n()
  const whisperStore = useWhisperStore()

  async function setLocale(newLocale: 'en' | 'zh-CN' | 'zh-TW') {
    locale.value = newLocale
    await whisperStore.updateSettings({ locale: newLocale })
  }

  // Detect system locale and map to supported locales
  function detectSystemLocale(): 'en' | 'zh-CN' | 'zh-TW' {
    const systemLocale = navigator.language || 'en'

    // Map system locale to supported locales
    if (systemLocale.startsWith('zh-CN') || systemLocale === 'zh-SG') {
      return 'zh-CN'
    }
    if (systemLocale.startsWith('zh-TW') || systemLocale === 'zh-HK') {
      return 'zh-TW'
    }
    if (systemLocale.startsWith('zh')) {
      return 'zh-CN' // Default zh to Simplified Chinese
    }
    return 'en'
  }

  // Initialize locale from settings or detect system locale
  function initializeLocale() {
    const savedLocale = whisperStore.settings.locale
    if (savedLocale) {
      locale.value = savedLocale
    } else {
      // First launch - use system locale detection
      const detectedLocale = detectSystemLocale()
      locale.value = detectedLocale
      // Persist the detected locale
      void setLocale(detectedLocale)
    }
  }

  // Watch for settings changes (e.g., from IPC)
  watch(
    () => whisperStore.settings.locale,
    (newLocale) => {
      if (newLocale && newLocale !== locale.value) {
        locale.value = newLocale
      }
    }
  )

  return {
    locale,
    setLocale,
    initializeLocale,
    detectSystemLocale
  }
}
