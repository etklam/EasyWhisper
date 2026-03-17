// 支援的語言環境

export const VALID_LOCALES = ['en', 'zh-TW', 'zh-CN'] as const
export type Locale = typeof VALID_LOCALES[number]
