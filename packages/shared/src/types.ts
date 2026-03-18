export type WhisperTaskStatus = 'pending' | 'running' | 'completed' | 'error'
export type OutputFormat = 'txt' | 'srt' | 'vtt' | 'json'

export const WHISPER_MODEL_IDS = [
  'ggml-base.bin',
  'ggml-small.bin',
  'ggml-medium.bin',
  'ggml-large-v3.bin'
] as const

export type WhisperModelId = (typeof WHISPER_MODEL_IDS)[number]

export interface WhisperModelInfo {
  id: WhisperModelId
  label: string
  path: string
  downloadUrl: string
  sizeBytes?: number
  downloaded: boolean
}

export interface WhisperModelDownloadPayload {
  modelId: WhisperModelId
}

export interface WhisperModelDownloadProgressEvent {
  modelId: WhisperModelId
  progress: number
  receivedBytes: number
  totalBytes?: number
}

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
  outputFormats: OutputFormat[]
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

export interface AiStopPayload {
  taskId: string
}

export interface AiStopResponse {
  taskId: string
  stopped: boolean
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
  connected: boolean
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

export interface YtDlpCancelPayload {
  taskId: string
}

export interface YtDlpCancelResponse {
  taskId: string
  cancelled: boolean
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

export interface AudioConvertPayload {
  taskId?: string
  inputPath: string
  outputPath?: string
}

export interface AudioConvertResponse {
  taskId: string
  outputPath: string
}

export interface AudioProgressEvent {
  taskId: string
  progress: number
  time: string
}

export interface WhisperModelDownloadResponse {
  modelId: WhisperModelId
  path: string
}

export interface OutputFormatPayload {
  outputPath: string
  format: OutputFormat
}

export interface OutputFormatResponse {
  content: string
  extension: string
  outputPath: string
}
