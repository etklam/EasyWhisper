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

export interface WorkflowSettings extends WhisperSettings {
  ytdlpAudioFormat: 'mp3' | 'wav' | 'm4a'
  ytdlpCookiesPath: string
  aiEnabled: boolean
  aiModel: string
  aiTargetLang: string
  aiCorrect: boolean
  aiTranslate: boolean
  aiSummary: boolean
  aiCustomPrompts?: AiCustomPrompts
}

export interface AppSettings {
  whisper: WhisperSettings
}

export type AiTaskType = 'correct' | 'translate' | 'summary'

export interface AiCustomPrompts {
  correct?: string
  translate?: string
  summary?: string
}

export interface AiRunPayload {
  id?: string
  model?: string
  text: string
  taskType: AiTaskType
  targetLang?: string
  batchMode?: boolean
  chunkSize?: number
  timeout?: number
  customPrompts?: AiCustomPrompts
}

export interface AiProgressEvent {
  taskId: string
  taskType: AiTaskType
  progress: number
  currentChunk?: number
  totalChunks?: number
  tokensUsed?: number
}

export interface AiSuccessResult {
  taskId: string
  taskType: AiTaskType
  result: string
  tokensUsed?: number
  durationMs: number
}

export interface AiErrorResult {
  taskId: string
  taskType: AiTaskType
  error: string
  detail?: string
}

export interface AiSkippedResult {
  taskId: string
  taskType: AiTaskType
  skipped: true
  reason: string
}

export type AiRunResult = AiSuccessResult | AiErrorResult | AiSkippedResult

export interface AiStatusResponse {
  running: boolean
  activeTasks: number
  queueLength: number
}

export interface YtDlpStartPayload {
  taskId?: string
  url: string
  format?: 'mp3' | 'wav' | 'm4a'
  cookiesPath?: string
}

export interface YtDlpStartResponse {
  taskId: string
  accepted: true
}

export interface YtDlpProgressEvent {
  taskId: string
  progress: number
}

export interface YtDlpCompleteEvent {
  taskId: string
  outputPath: string
}

export interface YtDlpErrorEvent {
  taskId: string
  error: string
}
