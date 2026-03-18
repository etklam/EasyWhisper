import { ipcMain, type BrowserWindow } from 'electron'

import { IPC_CHANNELS } from '@shared/ipc'
import type {
  WhisperModelDownloadPayload,
  WhisperModelDownloadResponse,
  WhisperModelInfo
} from '@shared/types'
import { WhisperMac } from '../whisper/WhisperMac'

const whisperMac = new WhisperMac()

export function registerModelHandlers(mainWindow: BrowserWindow): void {
  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.MODEL_LIST)
    ipcMain.removeHandler(IPC_CHANNELS.MODEL_DOWNLOAD)
  }

  ipcMain.handle(IPC_CHANNELS.MODEL_LIST, async (): Promise<WhisperModelInfo[]> => {
    return whisperMac.listModels()
  })

  ipcMain.handle(
    IPC_CHANNELS.MODEL_DOWNLOAD,
    async (_event, payload: WhisperModelDownloadPayload): Promise<WhisperModelDownloadResponse> => {
      const modelPath = await whisperMac.downloadModel(payload.modelId, (progress) => {
        mainWindow.webContents.send(IPC_CHANNELS.MODEL_PROGRESS, progress)
      })

      return {
        modelId: payload.modelId,
        path: modelPath
      }
    }
  )
}
