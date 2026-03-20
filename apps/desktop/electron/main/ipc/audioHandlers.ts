import { app, ipcMain, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { IPC_CHANNELS } from '@shared/ipc'
import type {
  AudioConvertPayload,
  AudioConvertResponse,
  AudioProgressEvent,
  FfmpegInstallation,
  ToolOperationResponse
} from '@shared/types'
import { FfmpegDetector } from '../audio/FfmpegDetector'
import { AudioProcessor } from '../audio/AudioProcessor'
import { getToolsManager } from '../tools'
import { settingsManager } from '../settings'
import { createManagedDownloadOptions, createToolProgressEmitter, formatToolError } from '../tools/toolIpc'

type ToolMode = 'system' | 'managed'

/**
 * 根據模式獲取 ffmpeg 路徑
 */
async function getFfmpegPathByMode(mode: ToolMode, toolProvider = getToolsManager()): Promise<string> {
  if (mode === 'system') {
    // 系統模式：優先使用系統 ffmpeg
    const detector = new FfmpegDetector()
    const result = await detector.detect()
    if (result.type !== 'none' && result.path) {
      return result.path
    }
    return process.env.FFMPEG_PATH ?? 'ffmpeg'
  } else {
    const manager = toolProvider.getFfmpegManager()
    const installation = await manager.getManagedInfo()
    if (installation.type !== 'managed' || !installation.path) {
      throw new Error('Managed ffmpeg is not installed. Please download it first.')
    }
    return installation.path
  }
}

function createAudioProcessor(ffmpegPath: string): AudioProcessor {
  const cacheDir = path.join(app.getPath('temp'), 'fosswhisper-audio')
  return new AudioProcessor(ffmpegPath, cacheDir)
}

export function registerAudioHandlers(mainWindow: BrowserWindow): void {
  const detector = new FfmpegDetector()
  const toolsManager = getToolsManager()
  const ffmpegManager = toolsManager.getFfmpegManager()

  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.AUDIO_CONVERT)
    ipcMain.removeHandler(IPC_CHANNELS.FFMPEG_DETECT)
    ipcMain.removeHandler(IPC_CHANNELS.FFMPEG_DOWNLOAD_MANAGED)
    ipcMain.removeHandler(IPC_CHANNELS.FFMPEG_UPDATE_MANAGED)
    ipcMain.removeHandler(IPC_CHANNELS.FFMPEG_DETECT_MANAGED)
  }

  const emitManagedProgress = createToolProgressEmitter(
    mainWindow,
    IPC_CHANNELS.FFMPEG_MANAGED_PROGRESS,
    'ffmpeg'
  )

  /**
   * 檢測系統中可用的 ffmpeg
   */
  ipcMain.handle(
    IPC_CHANNELS.FFMPEG_DETECT,
    async (): Promise<FfmpegInstallation> => {
      return detector.detect()
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.FFMPEG_DETECT_MANAGED,
    async (): Promise<FfmpegInstallation> => {
      return ffmpegManager.getManagedInfo()
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.FFMPEG_DOWNLOAD_MANAGED,
    async (): Promise<ToolOperationResponse<FfmpegInstallation>> => {
      try {
        const installation = await ffmpegManager.downloadManaged(
          createManagedDownloadOptions(emitManagedProgress)
        )
        return { ok: true, installation }
      } catch (error) {
        return { ok: false, error: formatToolError(error) }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.FFMPEG_UPDATE_MANAGED,
    async (): Promise<ToolOperationResponse<FfmpegInstallation>> => {
      try {
        const installation = await ffmpegManager.updateManaged(
          createManagedDownloadOptions(emitManagedProgress)
        )
        return { ok: true, installation }
      } catch (error) {
        return { ok: false, error: formatToolError(error) }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.AUDIO_CONVERT,
    async (_event, payload: AudioConvertPayload): Promise<AudioConvertResponse> => {
      const mode = settingsManager.getSetting('ffmpegMode') ?? 'system'
      const ffmpegPath = await getFfmpegPathByMode(mode, toolsManager)

      const audioProcessor = createAudioProcessor(ffmpegPath)
      const taskId = payload.taskId ?? randomUUID()
      const outputPath = await audioProcessor.convertToWav(
        payload.inputPath,
        payload.outputPath,
        (progress) => {
          const event: AudioProgressEvent = {
            taskId,
            progress: Math.max(0, Math.min(100, Math.round(progress.percentage))),
            time: progress.time
          }
          mainWindow.webContents.send(IPC_CHANNELS.AUDIO_PROGRESS, event)
        }
      )

      return {
        taskId,
        outputPath
      }
    }
  )
}
