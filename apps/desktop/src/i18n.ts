import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'
import zhTW from './locales/zh-TW.json'

const i18n = createI18n({
  legacy: false,
  locale: 'en', // default, will be overridden by saved settings
  fallbackLocale: 'en',
  missing: (locale, key) => {
    // Log missing translation keys during development
    if (import.meta.env.DEV) {
      console.warn(`[i18n] Missing translation: ${key} for locale: ${locale}`)
    }
    return key
  },
  messages: { en, 'zh-CN': zhCN, 'zh-TW': zhTW }
})

export default i18n
