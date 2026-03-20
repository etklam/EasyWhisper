// Settings Schema for FOSSWhisper
// This file defines the structure for persisted settings and queue data

/** 使用者設定 schema（存於 userData/settings.json） */
export interface SettingsSchema {
  locale: 'en' | 'zh-TW' | 'zh-CN'
  whisperModel: string              // e.g. 'ggml-base.bin'
  whisperThreads: number
  whisperLanguage?: string
  whisperUseMetal?: boolean
  outputDir: string
  outputFormats: ('txt' | 'srt' | 'vtt' | 'json')[]
  maxTranscribeConcurrency: number  // Whisper 佇列並行數，預設 1
  maxAiConcurrency: number          // AI 佇列並行數，預設 2
  ytdlpAudioFormat: 'mp3' | 'wav' | 'm4a'
  ytdlpCookiesPath?: string
  ytdlpMode: 'system' | 'managed'   // 系統模式 vs 管理模式
  ffmpegMode: 'system' | 'managed'  // 系統模式 vs 管理模式
  ai: {
    enabled: boolean
    model: string                   // Ollama 模型名稱
    tasks: {
      correct: boolean
      translate: boolean
      summary: boolean
    }
    targetLang: string              // 翻譯目標語言
    customPrompts?: {
      correct?: string
      translate?: string
      summary?: string
    }
  }
}

/** 佇列持久化 schema（存於 userData/queue.json） */
export interface QueueSchema {
  items: PersistedQueueItem[]
}

export interface PersistedQueueItem {
  id: string
  source: 'file' | 'ytdlp'
  filePath?: string
  url?: string
  title?: string
  status: 'pending' | 'done' | 'error'  // 只持久化終態和 pending
  outputPath?: string
  error?: string
}

/** Whisper result structure */
export interface WhisperResult {
  text: string
  segments: WhisperSegment[]
}

export interface WhisperSegment {
  id: number
  seek: number
  start: number
  end: number
  text: string
  tokens: number[]
  temperature: number
  avg_logprob: number
  compression_ratio: number
  no_speech_prob: number
}
