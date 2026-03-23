import type {
  AiCustomPrompts,
  AiErrorResult,
  AiProgressEvent,
  AiRunPayload,
  AiRunResult,
  AiSkippedResult,
  AiSuccessResult,
  AiTaskType
} from '@shared/types'

export type { AiCustomPrompts, AiProgressEvent, AiRunPayload, AiRunResult, AiTaskType }

export interface AiSettings {
  enabled: boolean
  model: string
  tasks: {
    correct: boolean
    translate: boolean
    summary: boolean
  }
  targetLang: string
  customPrompts?: AiCustomPrompts
}

export interface AiTask extends AiRunPayload {
  id: string
  signal?: AbortSignal
  onProgress?: (progress: AiProgressEvent) => void
  onResult?: (result: AiRunResult) => void
}

export type AiComplete = AiSuccessResult
export type AiError = AiErrorResult
export type AiSkipped = AiSkippedResult

export interface PipelineOptions {
  concurrency?: number
  chunkSize?: number
  timeout?: number
  contextWindow?: number
  outputTokenBudget?: number
  promptTokenBudget?: number
}

export interface ResolvedPipelineOptions {
  concurrency: number
  chunkSize: number
  timeout: number
  contextWindow: number
  outputTokenBudget: number
  promptTokenBudget: number
}

export interface OllamaModel {
  name: string
  modified_at: string
  size: number
}

export interface OllamaTagsResponse {
  models: OllamaModel[]
}

export interface OllamaGenerateResponse {
  response: string
  prompt_eval_count?: number
  eval_count?: number
}
