// AI 类型定义

export interface AiSettings {
  enabled: boolean
  model: string
  tasks: {
    correct: boolean
    translate: boolean
    summary: boolean
  }
  targetLang: string
  customPrompts?: {
    correct?: string
    translate?: string
    summary?: string
  }
}

export interface AiTask {
  id: string
  text: string
  taskType: 'correct' | 'translate' | 'summary'
  targetLang?: string
  batchMode?: boolean
  chunkSize?: number
  timeout?: number
  onProgress?: (progress: number | AiProgress) => void
  onResult?: (result: AiComplete | AiError) => void
}

export interface AiProgress {
  taskId: string
  taskType: 'correct' | 'translate' | 'summary'
  progress: number
  currentChunk?: number
  totalChunks?: number
  tokensUsed?: number
}

export interface AiComplete {
  taskId: string
  result: string
  tokensUsed?: number
  durationMs: number
}

export interface AiError {
  taskId: string
  taskType: 'correct' | 'translate' | 'summary'
  error: string
  detail?: string
}

export interface PipelineOptions {
  concurrency: number
  chunkSize: number
  timeout: number
  contextWindow: number
}

export interface OllamaModel {
  name: string
  modified_at: string
  size: number
}
