import type {
  AiRunPayload,
  AiRunResult,
  WorkflowSettings,
  WhisperCompleteEvent,
  WhisperErrorEvent,
  WhisperProgressEvent,
  WhisperStartPayload,
  WhisperStartResponse,
  YtDlpCompleteEvent,
  YtDlpErrorEvent,
  YtDlpProgressEvent,
  YtDlpStartPayload,
  YtDlpStartResponse
} from '@shared/types'

declare global {
  interface Window {
    fosswhisper: {
      startWhisper: (payload: WhisperStartPayload) => Promise<WhisperStartResponse>
      runAi: (payload: AiRunPayload) => Promise<AiRunResult>
      listAiModels: () => Promise<string[]>
      getSettings: () => Promise<WorkflowSettings>
      setSettings: (settings: Partial<WorkflowSettings>) => Promise<WorkflowSettings>
      startYtDlp: (payload: YtDlpStartPayload) => Promise<YtDlpStartResponse>
      onWhisperProgress: (listener: (event: WhisperProgressEvent) => void) => () => void
      onWhisperComplete: (listener: (event: WhisperCompleteEvent) => void) => () => void
      onWhisperError: (listener: (event: WhisperErrorEvent) => void) => () => void
      onYtDlpProgress: (listener: (event: YtDlpProgressEvent) => void) => () => void
      onYtDlpComplete: (listener: (event: YtDlpCompleteEvent) => void) => () => void
      onYtDlpError: (listener: (event: YtDlpErrorEvent) => void) => () => void
    }
  }
}

export {}
