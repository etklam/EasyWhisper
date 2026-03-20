import { app, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { IPC_CHANNELS } from '@shared/ipc'
import type {
  ToolOperationResponse,
  YtDlpCancelPayload,
  YtDlpCancelResponse,
  YtDlpCompleteEvent,
  YtDlpErrorEvent,
  YtDlpInstallation,
  YtDlpProgressEvent,
  YtDlpStartPayload,
  YtDlpStartResponse
} from '@shared/types'
import { YtDlpDetector } from '../ytdlp/YtDlpDetector'
import { YtDlpDownloader } from '../ytdlp/YtDlpDownloader'
import { getToolsManager } from '../tools'
import { settingsManager } from '../settings'
import { createManagedDownloadOptions, createToolProgressEmitter, formatToolError } from '../tools/toolIpc'

type ToolMode = 'system' | 'managed'

/**
 * 根據模式獲取 yt-dlp 路徑
 */
async function getYtDlpPathByMode(mode: ToolMode, toolProvider = getToolsManager()): Promise<string> {
  if (mode === 'system') {
    // 系統模式：優先使用系統 yt-dlp
    const detector = new YtDlpDetector()
    const result = await detector.detect()
    if (result.type !== 'none' && result.path) {
      return result.path
    }
    return process.env.YTDLP_PATH ?? 'yt-dlp'
  } else {
    const manager = toolProvider.getYtDlpManager()
    const installation = await manager.getManagedInfo()
    if (installation.type !== 'managed' || !installation.path) {
      throw new Error('Managed yt-dlp is not installed. Please download it first.')
    }
    return installation.path
  }
}

function createDownloader(ytDlpPath: string): YtDlpDownloader {
  const tmpDir = path.join(app.getPath('temp'), 'fosswhisper-ytdlp')
  return new YtDlpDownloader(ytDlpPath, tmpDir)
}

export function registerYtDlpHandlers(mainWindow: BrowserWindow): void {
  const detector = new YtDlpDetector()
  const toolsManager = getToolsManager()
  const ytDlpManager = toolsManager.getYtDlpManager()

  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.YTDLP_DOWNLOAD)
    ipcMain.removeHandler(IPC_CHANNELS.YTDLP_CANCEL)
    ipcMain.removeHandler(IPC_CHANNELS.YTDLP_DETECT)
    ipcMain.removeHandler(IPC_CHANNELS.YTDLP_DOWNLOAD_MANAGED)
    ipcMain.removeHandler(IPC_CHANNELS.YTDLP_UPDATE_MANAGED)
    ipcMain.removeHandler(IPC_CHANNELS.YTDLP_DETECT_MANAGED)
  }

  const emitManagedProgress = createToolProgressEmitter(
    mainWindow,
    IPC_CHANNELS.YTDLP_MANAGED_PROGRESS,
    'ytdlp'
  )

  /**
   * 檢測系統中可用的 yt-dlp
   */
  ipcMain.handle(
    IPC_CHANNELS.YTDLP_DETECT,
    async (): Promise<YtDlpInstallation> => {
      return detector.detect()
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.YTDLP_DETECT_MANAGED,
    async (): Promise<YtDlpInstallation> => {
      return ytDlpManager.getManagedInfo()
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.YTDLP_DOWNLOAD_MANAGED,
    async (): Promise<ToolOperationResponse<YtDlpInstallation>> => {
      try {
        const installation = await ytDlpManager.downloadManaged(
          createManagedDownloadOptions(emitManagedProgress)
        )
        return { ok: true, installation }
      } catch (error) {
        return { ok: false, error: formatToolError(error) }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.YTDLP_UPDATE_MANAGED,
    async (): Promise<ToolOperationResponse<YtDlpInstallation>> => {
      try {
        const installation = await ytDlpManager.updateManaged(
          createManagedDownloadOptions(emitManagedProgress)
        )
        return { ok: true, installation }
      } catch (error) {
        return { ok: false, error: formatToolError(error) }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.YTDLP_DOWNLOAD,
    async (_event, payload: YtDlpStartPayload): Promise<YtDlpStartResponse> => {
      const mode = settingsManager.getSetting('ytdlpMode') ?? 'system'
      const ytDlpPath = await getYtDlpPathByMode(mode, toolsManager)

      const downloader = createDownloader(ytDlpPath)
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
      // TODO: 需要追蹤 active downloader 實例
      return {
        taskId: payload.taskId,
        cancelled: false
      }
    }
  )
}
