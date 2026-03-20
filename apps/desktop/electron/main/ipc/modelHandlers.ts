import { app, ipcMain, shell, type BrowserWindow } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { IPC_CHANNELS } from '@shared/ipc'
import type {
  OpenFolderResponse,
  WhisperModelDownloadPayload,
  WhisperModelDownloadResponse,
  WhisperModelInfo
} from '@shared/types'
import { getWhisperRuntime } from '../whisper/runtime'

export function registerModelHandlers(mainWindow: BrowserWindow): void {
  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.MODEL_LIST)
    ipcMain.removeHandler(IPC_CHANNELS.MODEL_DOWNLOAD)
    ipcMain.removeHandler(IPC_CHANNELS.MODEL_OPEN_FOLDER)
  }

  ipcMain.handle(IPC_CHANNELS.MODEL_LIST, async (): Promise<WhisperModelInfo[]> => {
    return getWhisperRuntime().listModels()
  })

  ipcMain.handle(
    IPC_CHANNELS.MODEL_DOWNLOAD,
    async (_event, payload: WhisperModelDownloadPayload): Promise<WhisperModelDownloadResponse> => {
      const modelPath = await getWhisperRuntime().downloadModel(payload.modelId, (progress) => {
        mainWindow.webContents.send(IPC_CHANNELS.MODEL_PROGRESS, progress)
      })

      return {
        modelId: payload.modelId,
        path: modelPath
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.MODEL_OPEN_FOLDER, async (): Promise<OpenFolderResponse> => {
    const modelsDir = path.join(app.getPath('userData'), 'models')
    try {
      await mkdir(modelsDir, { recursive: true })
      const keepFile = path.join(modelsDir, '.keep')
      await writeFile(keepFile, '', { flag: 'wx' }).catch(() => {})
      shell.showItemInFolder(keepFile)
      return {
        ok: true,
        path: modelsDir
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })
}
