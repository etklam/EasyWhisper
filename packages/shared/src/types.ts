export type WhisperTaskStatus = 'pending' | 'running' | 'completed' | 'error'

export interface WhisperTask {
  id: string
  audioPath: string
  modelPath: string
  language?: string
  threads?: number
  useMetal?: boolean
  createdAt: string
  status: WhisperTaskStatus
  outputPath?: string
  errorMessage?: string
}

export interface WhisperStartPayload {
  taskId?: string
  audioPath: string
  modelPath: string
  language?: string
  threads?: number
  useMetal?: boolean
  outputDir?: string
}

export interface WhisperStartResponse {
  taskId: string
  accepted: true
}

export interface WhisperProgressEvent {
  taskId: string
  progress: number
  stage: 'preparing' | 'transcribing' | 'finalizing'
  message?: string
}

export interface WhisperCompleteEvent {
  taskId: string
  outputPath: string
  text: string
  durationMs: number
}

export interface WhisperErrorEvent {
  taskId: string
  error: string
}

export interface WhisperSettings {
  modelPath: string
  threads: number
  language: string
  useMetal: boolean
  outputDir: string
}

export interface AppSettings {
  whisper: WhisperSettings
}
