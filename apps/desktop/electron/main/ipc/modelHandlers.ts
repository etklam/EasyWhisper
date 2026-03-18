import { app, ipcMain, shell, type BrowserWindow } from 'electron'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { IPC_CHANNELS } from '@shared/ipc'
import type {
  OpenFolderResponse,
  WhisperModelDownloadPayload,
  WhisperModelDownloadResponse,
  WhisperModelInfo
} from '@shared/types'
import { WhisperMac } from '../whisper/WhisperMac'

let whisperMac: WhisperMac | null = null

function getWhisperMac(): WhisperMac {
  if (!whisperMac) {
    const userDataPath = app.getPath('userData')
    const modelsDir = path.join(userDataPath, 'models')

    if (process.env.FOSSWHISPER_DEBUG_PATHS === '1') {
      console.error('[fosswhisper:modelHandlers] init WhisperMac', {
        cwd: process.cwd(),
        userDataPath,
        modelsDir,
        resourcesPath: process.resourcesPath
      })
    }

    whisperMac = new WhisperMac({
      modelsDir
    })
  }

  return whisperMac
}

export function registerModelHandlers(mainWindow: BrowserWindow): void {
  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.MODEL_LIST)
    ipcMain.removeHandler(IPC_CHANNELS.MODEL_DOWNLOAD)
    ipcMain.removeHandler(IPC_CHANNELS.MODEL_OPEN_FOLDER)
  }

  ipcMain.handle(IPC_CHANNELS.MODEL_LIST, async (): Promise<WhisperModelInfo[]> => {
    return getWhisperMac().listModels()
  })

  ipcMain.handle(
    IPC_CHANNELS.MODEL_DOWNLOAD,
    async (_event, payload: WhisperModelDownloadPayload): Promise<WhisperModelDownloadResponse> => {
      const modelPath = await getWhisperMac().downloadModel(payload.modelId, (progress) => {
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
      shell.showItemInFolder(path.join(modelsDir, '.keep'))
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
