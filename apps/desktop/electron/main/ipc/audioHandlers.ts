import { app, ipcMain, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { IPC_CHANNELS } from '@shared/ipc'
import type {
  AudioConvertPayload,
  AudioConvertResponse,
  AudioProgressEvent
} from '@shared/types'
import { AudioProcessor } from '../audio/AudioProcessor'

function createAudioProcessor(): AudioProcessor {
  const ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg'
  const cacheDir = path.join(app.getPath('temp'), 'fosswhisper-audio')
  return new AudioProcessor(ffmpegPath, cacheDir)
}

export function registerAudioHandlers(mainWindow: BrowserWindow): void {
  const audioProcessor = createAudioProcessor()

  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.AUDIO_CONVERT)
  }

  ipcMain.handle(
    IPC_CHANNELS.AUDIO_CONVERT,
    async (_event, payload: AudioConvertPayload): Promise<AudioConvertResponse> => {
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
