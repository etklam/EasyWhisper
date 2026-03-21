export const TRANSCRIPTION_LANGUAGE_VALUES = [
  'auto',
  'en',
  'zh',
  'ja',
  'ko'
] as const

export type TranscriptionLanguageValue = (typeof TRANSCRIPTION_LANGUAGE_VALUES)[number]
