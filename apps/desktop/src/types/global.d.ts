import type {
  AiPipelineStatsResponse,
  AiProgressEvent,
  AiRunPayload,
  AiRunResult,
  AiSaveResultsPayload,
  AiSaveResultsResponse,
  AiStopPayload,
  AiStopResponse,
  AiStatusResponse,
  AudioConvertPayload,
  AudioConvertResponse,
  AudioProgressEvent,
  FfmpegInstallation,
  OpenFolderResponse,
  OutputFormat,
  OutputFormatPayload,
  OutputFormatResponse,
  ToolDetectPayload,
  ToolOperationResponse,
  ToolProgressEvent,
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
  YtDlpInstallation,
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
      saveAiResults: (payload: AiSaveResultsPayload) => Promise<AiSaveResultsResponse>
      getAiPipelineStats: () => Promise<AiPipelineStatsResponse>
      getSettings: () => Promise<WorkflowSettings>
      setSettings: (settings: Partial<WorkflowSettings>) => Promise<WorkflowSettings>
      openOutputFolder: () => Promise<OpenFolderResponse>
      openFolder: (folderPath: string) => Promise<OpenFolderResponse>
      listModels: () => Promise<WhisperModelInfo[]>
      downloadModel: (payload: WhisperModelDownloadPayload) => Promise<WhisperModelDownloadResponse>
      openModelFolder: () => Promise<OpenFolderResponse>
      convertAudio: (payload: AudioConvertPayload) => Promise<AudioConvertResponse>
      formatOutput: (payload: OutputFormatPayload) => Promise<OutputFormatResponse>
      getOutputFormats: () => Promise<OutputFormat[]>
      startYtDlp: (payload: YtDlpStartPayload) => Promise<YtDlpStartResponse>
      cancelYtDlp: (payload: YtDlpCancelPayload) => Promise<YtDlpCancelResponse>
      downloadManagedYtDlp: (payload?: { signal?: AbortSignal }) => Promise<ToolOperationResponse<YtDlpInstallation>>
      updateManagedYtDlp: (payload?: { signal?: AbortSignal }) => Promise<ToolOperationResponse<YtDlpInstallation>>
      detectManagedYtDlp: (payload?: ToolDetectPayload) => Promise<YtDlpInstallation>
      downloadManagedFfmpeg: (payload?: { signal?: AbortSignal }) => Promise<ToolOperationResponse<FfmpegInstallation>>
      updateManagedFfmpeg: (payload?: { signal?: AbortSignal }) => Promise<ToolOperationResponse<FfmpegInstallation>>
      detectManagedFfmpeg: (payload?: ToolDetectPayload) => Promise<FfmpegInstallation>
      detectSystemYtDlp: (payload?: ToolDetectPayload) => Promise<YtDlpInstallation>
      detectSystemFfmpeg: (payload?: ToolDetectPayload) => Promise<FfmpegInstallation>
      onWhisperProgress: (listener: (event: WhisperProgressEvent) => void) => () => void
      onWhisperComplete: (listener: (event: WhisperCompleteEvent) => void) => () => void
      onWhisperError: (listener: (event: WhisperErrorEvent) => void) => () => void
      onAiProgress: (listener: (event: AiProgressEvent) => void) => () => void
      onAiResult: (listener: (event: AiRunResult) => void) => () => void
      onAiError: (listener: (event: AiRunResult) => void) => () => void
      onYtDlpProgress: (listener: (event: YtDlpProgressEvent) => void) => () => void
      onYtDlpComplete: (listener: (event: YtDlpCompleteEvent) => void) => () => void
      onYtDlpError: (listener: (event: YtDlpErrorEvent) => void) => () => void
      onYtDlpManagedProgress: (listener: (event: ToolProgressEvent) => void) => () => void
      onFfmpegManagedProgress: (listener: (event: ToolProgressEvent) => void) => () => void
      onAudioProgress: (listener: (event: AudioProgressEvent) => void) => () => void
      onModelProgress: (listener: (event: WhisperModelDownloadProgressEvent) => void) => () => void
    }
  }
}

export {}
