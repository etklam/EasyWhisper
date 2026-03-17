import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS } from '@shared/ipc'
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

type Unsubscribe = () => void

const api = {
  startWhisper: (payload: WhisperStartPayload): Promise<WhisperStartResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.WHISPER_START, payload),
  runAi: (payload: AiRunPayload): Promise<AiRunResult> => ipcRenderer.invoke(IPC_CHANNELS.AI_RUN, payload),
  listAiModels: (): Promise<string[]> => ipcRenderer.invoke(IPC_CHANNELS.AI_LIST_MODELS),
  getSettings: (): Promise<WorkflowSettings> => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  setSettings: (settings: Partial<WorkflowSettings>): Promise<WorkflowSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings),
  startYtDlp: (payload: YtDlpStartPayload): Promise<YtDlpStartResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.YTDLP_START, payload),
  onWhisperProgress: (listener: (event: WhisperProgressEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.WHISPER_PROGRESS, listener),
  onWhisperComplete: (listener: (event: WhisperCompleteEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.WHISPER_COMPLETE, listener),
  onWhisperError: (listener: (event: WhisperErrorEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.WHISPER_ERROR, listener),
  onYtDlpProgress: (listener: (event: YtDlpProgressEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.YTDLP_PROGRESS, listener),
  onYtDlpComplete: (listener: (event: YtDlpCompleteEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.YTDLP_COMPLETE, listener),
  onYtDlpError: (listener: (event: YtDlpErrorEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.YTDLP_ERROR, listener)
}

contextBridge.exposeInMainWorld('fosswhisper', api)

function bindRendererListener<T>(channel: string, listener: (event: T) => void): Unsubscribe {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}
