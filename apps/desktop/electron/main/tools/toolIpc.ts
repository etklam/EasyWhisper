import type { BrowserWindow } from 'electron'

import type { ManagedTool, ToolProgressEvent } from '@shared/types'
import type { ToolDownloadOptions, ToolProgressUpdate } from './BaseToolManager'

export function createToolProgressEmitter(
  mainWindow: BrowserWindow,
  channel: string,
  tool: ManagedTool
): (update: ToolProgressUpdate) => void {
  return (update: ToolProgressUpdate): void => {
    const event: ToolProgressEvent = {
      tool,
      phase: update.phase,
      percent: update.percent,
      downloadedBytes: update.downloadedBytes,
      totalBytes: update.totalBytes,
      message: update.message
    }
    mainWindow.webContents.send(channel, event)
  }
}

export function createManagedDownloadOptions(
  onProgress: (update: ToolProgressUpdate) => void,
  signal?: AbortSignal
): ToolDownloadOptions {
  return {
    onProgress,
    signal
  }
}

export function formatToolError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Unknown error'
}
