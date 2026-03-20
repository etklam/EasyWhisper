import { BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'

import { IPC_CHANNELS } from '@shared/ipc'
import type {
  WhisperErrorEvent,
  WhisperProgressEvent,
  WhisperStartPayload,
  WhisperStartResponse
} from '@shared/types'
import { getWhisperRuntime } from '../whisper/runtime'

export function registerWhisperIpc(mainWindow: BrowserWindow): void {
  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.WHISPER_START)
  }
  ipcMain.handle(
    IPC_CHANNELS.WHISPER_START,
    async (_event, payload: WhisperStartPayload): Promise<WhisperStartResponse> => {
      const taskId = payload.taskId ?? randomUUID()

      void getWhisperRuntime()
        .transcribe({
          ...payload,
          taskId,
          onProgress: (progressEvent: WhisperProgressEvent) => {
            mainWindow.webContents.send(IPC_CHANNELS.WHISPER_PROGRESS, progressEvent)
          }
        })
        .then((result) => {
          mainWindow.webContents.send(IPC_CHANNELS.WHISPER_COMPLETE, result)
        })
        .catch((error: Error) => {
          const event: WhisperErrorEvent = {
            taskId,
            error: error.message
          }
          mainWindow.webContents.send(IPC_CHANNELS.WHISPER_ERROR, event)
        })

      return { taskId, accepted: true }
    }
  )
}
