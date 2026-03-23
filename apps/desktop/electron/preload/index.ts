import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS } from '@shared/ipc'
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

type Unsubscribe = () => void

const api = {
  startWhisper: (payload: WhisperStartPayload): Promise<WhisperStartResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.WHISPER_START, payload),
  runAi: (payload: AiRunPayload): Promise<AiRunResult> => ipcRenderer.invoke(IPC_CHANNELS.AI_RUN, payload),
  stopAi: (payload: AiStopPayload): Promise<AiStopResponse> => ipcRenderer.invoke(IPC_CHANNELS.AI_STOP, payload),
  getAiStatus: (): Promise<AiStatusResponse> => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_STATUS),
  listAiModels: (): Promise<string[]> => ipcRenderer.invoke(IPC_CHANNELS.AI_LIST_MODELS),
  saveAiResults: (payload: AiSaveResultsPayload): Promise<AiSaveResultsResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_SAVE_RESULTS, payload),
  getAiPipelineStats: (): Promise<AiPipelineStatsResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_GET_PIPELINE_STATS),
  getSettings: (): Promise<WorkflowSettings> => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  setSettings: (settings: Partial<WorkflowSettings>): Promise<WorkflowSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings),
  openOutputFolder: (): Promise<OpenFolderResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_OPEN_OUTPUT_FOLDER),
  openFolder: (folderPath: string): Promise<OpenFolderResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.TOOLS_OPEN_PATH, folderPath),
  listModels: (): Promise<WhisperModelInfo[]> => ipcRenderer.invoke(IPC_CHANNELS.MODEL_LIST),
  downloadModel: (payload: WhisperModelDownloadPayload): Promise<WhisperModelDownloadResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.MODEL_DOWNLOAD, payload),
  openModelFolder: (): Promise<OpenFolderResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.MODEL_OPEN_FOLDER),
  convertAudio: (payload: AudioConvertPayload): Promise<AudioConvertResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUDIO_CONVERT, payload),
  formatOutput: (payload: OutputFormatPayload): Promise<OutputFormatResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_FORMAT, payload),
  getOutputFormats: (): Promise<OutputFormat[]> => ipcRenderer.invoke(IPC_CHANNELS.OUTPUT_GET_FORMATS),
  startYtDlp: (payload: YtDlpStartPayload): Promise<YtDlpStartResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.YTDLP_DOWNLOAD, payload),
  cancelYtDlp: (payload: YtDlpCancelPayload): Promise<YtDlpCancelResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.YTDLP_CANCEL, payload),
  downloadManagedYtDlp: (payload?: { signal?: AbortSignal }): Promise<ToolOperationResponse<YtDlpInstallation>> =>
    ipcRenderer.invoke(IPC_CHANNELS.YTDLP_DOWNLOAD_MANAGED, payload),
  updateManagedYtDlp: (payload?: { signal?: AbortSignal }): Promise<ToolOperationResponse<YtDlpInstallation>> =>
    ipcRenderer.invoke(IPC_CHANNELS.YTDLP_UPDATE_MANAGED, payload),
  detectManagedYtDlp: (payload?: ToolDetectPayload): Promise<YtDlpInstallation> =>
    ipcRenderer.invoke(IPC_CHANNELS.YTDLP_DETECT_MANAGED, payload),
  downloadManagedFfmpeg: (payload?: { signal?: AbortSignal }): Promise<ToolOperationResponse<FfmpegInstallation>> =>
    ipcRenderer.invoke(IPC_CHANNELS.FFMPEG_DOWNLOAD_MANAGED, payload),
  updateManagedFfmpeg: (payload?: { signal?: AbortSignal }): Promise<ToolOperationResponse<FfmpegInstallation>> =>
    ipcRenderer.invoke(IPC_CHANNELS.FFMPEG_UPDATE_MANAGED, payload),
  detectManagedFfmpeg: (payload?: ToolDetectPayload): Promise<FfmpegInstallation> =>
    ipcRenderer.invoke(IPC_CHANNELS.FFMPEG_DETECT_MANAGED, payload),
  detectSystemYtDlp: (payload?: ToolDetectPayload): Promise<YtDlpInstallation> =>
    ipcRenderer.invoke(IPC_CHANNELS.YTDLP_DETECT, payload),
  detectSystemFfmpeg: (payload?: ToolDetectPayload): Promise<FfmpegInstallation> =>
    ipcRenderer.invoke(IPC_CHANNELS.FFMPEG_DETECT, payload),
  onWhisperProgress: (listener: (event: WhisperProgressEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.WHISPER_PROGRESS, listener),
  onWhisperComplete: (listener: (event: WhisperCompleteEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.WHISPER_COMPLETE, listener),
  onWhisperError: (listener: (event: WhisperErrorEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.WHISPER_ERROR, listener),
  onAiProgress: (listener: (event: AiProgressEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.AI_PROGRESS, listener),
  onAiResult: (listener: (event: AiRunResult) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.AI_RESULT, listener),
  onAiError: (listener: (event: AiRunResult) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.AI_ERROR, listener),
  onYtDlpProgress: (listener: (event: YtDlpProgressEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.YTDLP_PROGRESS, listener),
  onYtDlpComplete: (listener: (event: YtDlpCompleteEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.YTDLP_COMPLETE, listener),
  onYtDlpError: (listener: (event: YtDlpErrorEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.YTDLP_ERROR, listener),
  onYtDlpManagedProgress: (listener: (event: ToolProgressEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.YTDLP_MANAGED_PROGRESS, listener),
  onFfmpegManagedProgress: (listener: (event: ToolProgressEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.FFMPEG_MANAGED_PROGRESS, listener),
  onAudioProgress: (listener: (event: AudioProgressEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.AUDIO_PROGRESS, listener),
  onModelProgress: (listener: (event: WhisperModelDownloadProgressEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.MODEL_PROGRESS, listener)
}

contextBridge.exposeInMainWorld('fosswhisper', api)

function bindRendererListener<T>(channel: string, listener: (event: T) => void): Unsubscribe {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}
