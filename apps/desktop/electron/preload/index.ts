import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS } from '@shared/ipc'
import type {
  WhisperCompleteEvent,
  WhisperErrorEvent,
  WhisperProgressEvent,
  WhisperStartPayload,
  WhisperStartResponse
} from '@shared/types'

type Unsubscribe = () => void

const api = {
  startWhisper: (payload: WhisperStartPayload): Promise<WhisperStartResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.WHISPER_START, payload),
  onWhisperProgress: (listener: (event: WhisperProgressEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.WHISPER_PROGRESS, listener),
  onWhisperComplete: (listener: (event: WhisperCompleteEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.WHISPER_COMPLETE, listener),
  onWhisperError: (listener: (event: WhisperErrorEvent) => void): Unsubscribe =>
    bindRendererListener(IPC_CHANNELS.WHISPER_ERROR, listener)
}

contextBridge.exposeInMainWorld('fosswhisper', api)

function bindRendererListener<T>(channel: string, listener: (event: T) => void): Unsubscribe {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}
