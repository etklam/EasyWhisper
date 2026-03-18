import { enUS, zhCN, zhTW } from 'naive-ui'
import type { NLocale } from 'naive-ui/es/locales/common/enUS'

export type SupportedLocale = 'en' | 'zh-CN' | 'zh-TW'

export const naiveUILocales: Record<SupportedLocale, NLocale> = {
  en: enUS,
  'zh-CN': zhCN,
  'zh-TW': zhTW
}

export function getNaiveLocale(locale: SupportedLocale): NLocale {
  return naiveUILocales[locale] || enUS
}
