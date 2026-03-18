import { ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'

import { IPC_CHANNELS } from '@shared/ipc'
import type { OutputFormat, OutputFormatPayload, OutputFormatResponse } from '@shared/types'
import type { WhisperResult } from '@shared/settings.schema'
import { OutputFormatter } from '../output/OutputFormatter'

const outputFormatter = new OutputFormatter()
const SUPPORTED_FORMATS: OutputFormat[] = ['txt', 'srt', 'vtt', 'json']

export function registerOutputHandlers(): void {
  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.OUTPUT_FORMAT)
    ipcMain.removeHandler(IPC_CHANNELS.OUTPUT_GET_FORMATS)
  }

  ipcMain.handle(
    IPC_CHANNELS.OUTPUT_FORMAT,
    async (_event, payload: OutputFormatPayload): Promise<OutputFormatResponse> => {
      const raw = await readFile(payload.outputPath, 'utf8')
      const result = JSON.parse(raw) as WhisperResult
      const extension = outputFormatter.getFileExtension(payload.format)
      const nextOutputPath = payload.format === 'json'
        ? payload.outputPath
        : payload.outputPath.replace(/\.json$/i, extension)
      const content = outputFormatter.format(result, payload.format)

      await writeFile(nextOutputPath, content, 'utf8')

      return {
        content,
        extension,
        outputPath: nextOutputPath
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.OUTPUT_GET_FORMATS, async (): Promise<OutputFormat[]> => {
    return SUPPORTED_FORMATS
  })
}
