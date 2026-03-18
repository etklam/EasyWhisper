import { app, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { IPC_CHANNELS } from '@shared/ipc'
import type {
  YtDlpCancelPayload,
  YtDlpCancelResponse,
  YtDlpCompleteEvent,
  YtDlpErrorEvent,
  YtDlpProgressEvent,
  YtDlpStartPayload,
  YtDlpStartResponse
} from '@shared/types'
import { YtDlpDownloader } from '../ytdlp/YtDlpDownloader'

function createDownloader(): YtDlpDownloader {
  const ytDlpPath = process.env.YTDLP_PATH ?? 'yt-dlp'
  const tmpDir = path.join(app.getPath('temp'), 'fosswhisper-ytdlp')
  return new YtDlpDownloader(ytDlpPath, tmpDir)
}

export function registerYtDlpHandlers(mainWindow: BrowserWindow): void {
  const downloader = createDownloader()

  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.YTDLP_DOWNLOAD)
    ipcMain.removeHandler(IPC_CHANNELS.YTDLP_CANCEL)
  }

  ipcMain.handle(
    IPC_CHANNELS.YTDLP_DOWNLOAD,
    async (_event, payload: YtDlpStartPayload): Promise<YtDlpStartResponse> => {
      const taskId = payload.taskId ?? randomUUID()

      void downloader
        .downloadAudio(taskId, payload.url, {
          format: payload.format,
          cookiesPath: payload.cookiesPath,
          onProgress: (progress: number) => {
            const event: YtDlpProgressEvent = {
              taskId,
              progress: Math.max(0, Math.min(100, progress))
            }
            mainWindow.webContents.send(IPC_CHANNELS.YTDLP_PROGRESS, event)
          }
        })
        .then((outputPath) => {
          const event: YtDlpCompleteEvent = {
            taskId,
            outputPath
          }
          mainWindow.webContents.send(IPC_CHANNELS.YTDLP_COMPLETE, event)
        })
        .catch((error: unknown) => {
          const event: YtDlpErrorEvent = {
            taskId,
            error: error instanceof Error ? error.message : String(error)
          }
          mainWindow.webContents.send(IPC_CHANNELS.YTDLP_ERROR, event)
        })

      return {
        taskId,
        accepted: true
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.YTDLP_CANCEL,
    async (_event, payload: YtDlpCancelPayload): Promise<YtDlpCancelResponse> => {
      return {
        taskId: payload.taskId,
        cancelled: downloader.cancelDownload(payload.taskId)
      }
    }
  )
}
