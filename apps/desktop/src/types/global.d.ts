import type {
  AiProgressEvent,
  AiRunPayload,
  AiRunResult,
  AiStopPayload,
  AiStopResponse,
  AiStatusResponse,
  AudioConvertPayload,
  AudioConvertResponse,
  AudioProgressEvent,
  OutputFormat,
  OutputFormatPayload,
  OutputFormatResponse,
  WorkflowSettings,
  WhisperCompleteEvent,
  WhisperErrorEvent,
  WhisperModelDownloadPayload,
  WhisperModelDownloadProgressEvent,
  WhisperModelDownloadResponse,
  WhisperModelInfo,
  WhisperProgressEvent,
  WhisperStartPayload,
  WhisperStartResponse,
  YtDlpCancelPayload,
  YtDlpCancelResponse,
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
      stopAi: (payload: AiStopPayload) => Promise<AiStopResponse>
      getAiStatus: () => Promise<AiStatusResponse>
      listAiModels: () => Promise<string[]>
      getSettings: () => Promise<WorkflowSettings>
      setSettings: (settings: Partial<WorkflowSettings>) => Promise<WorkflowSettings>
      listModels: () => Promise<WhisperModelInfo[]>
      downloadModel: (payload: WhisperModelDownloadPayload) => Promise<WhisperModelDownloadResponse>
      convertAudio: (payload: AudioConvertPayload) => Promise<AudioConvertResponse>
      formatOutput: (payload: OutputFormatPayload) => Promise<OutputFormatResponse>
      getOutputFormats: () => Promise<OutputFormat[]>
      startYtDlp: (payload: YtDlpStartPayload) => Promise<YtDlpStartResponse>
      cancelYtDlp: (payload: YtDlpCancelPayload) => Promise<YtDlpCancelResponse>
      onWhisperProgress: (listener: (event: WhisperProgressEvent) => void) => () => void
      onWhisperComplete: (listener: (event: WhisperCompleteEvent) => void) => () => void
      onWhisperError: (listener: (event: WhisperErrorEvent) => void) => () => void
      onAiProgress: (listener: (event: AiProgressEvent) => void) => () => void
      onAiResult: (listener: (event: AiRunResult) => void) => () => void
      onAiError: (listener: (event: AiRunResult) => void) => () => void
      onYtDlpProgress: (listener: (event: YtDlpProgressEvent) => void) => () => void
      onYtDlpComplete: (listener: (event: YtDlpCompleteEvent) => void) => () => void
      onYtDlpError: (listener: (event: YtDlpErrorEvent) => void) => () => void
      onAudioProgress: (listener: (event: AudioProgressEvent) => void) => () => void
      onModelProgress: (listener: (event: WhisperModelDownloadProgressEvent) => void) => () => void
    }
  }
}

export {}
