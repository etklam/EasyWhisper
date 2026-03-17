// 支援的音訊/視訊/輸出格式

export const SUPPORTED_AUDIO_FORMATS = ['mp3', 'wav', 'm4a', 'flac'] as const
export const SUPPORTED_VIDEO_FORMATS = ['mp4', 'mov', 'mkv', 'avi'] as const
export const SUPPORTED_OUTPUT_FORMATS = ['txt', 'srt', 'vtt', 'json'] as const
export const YTDLP_AUDIO_FORMATS = ['mp3', 'wav', 'm4a'] as const

// 驗證別名（與 SettingsManager 導入匹配）
export const VALID_OUTPUT_FORMATS = SUPPORTED_OUTPUT_FORMATS

export type AudioFormat = typeof SUPPORTED_AUDIO_FORMATS[number]
export type VideoFormat = typeof SUPPORTED_VIDEO_FORMATS[number]
export type OutputFormat = typeof SUPPORTED_OUTPUT_FORMATS[number]
export type YtdlpAudioFormat = typeof YTDLP_AUDIO_FORMATS[number]

// 合併音訊和視訊格式
export const SUPPORTED_INPUT_FORMATS = [...SUPPORTED_AUDIO_FORMATS, ...SUPPORTED_VIDEO_FORMATS] as const
export type InputFormat = typeof SUPPORTED_INPUT_FORMATS[number]
