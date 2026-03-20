import { ipcMain, shell } from 'electron'

import { IPC_CHANNELS } from '@shared/ipc'
import type { OpenFolderResponse } from '@shared/types'

export function registerToolsIpc(): void {
  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.TOOLS_OPEN_PATH)
  }

  ipcMain.handle(
    IPC_CHANNELS.TOOLS_OPEN_PATH,
    async (_event, dirPath: string): Promise<OpenFolderResponse> => {
      if (!dirPath) {
        return { ok: false, error: 'Path is required' }
      }
      try {
        shell.showItemInFolder(dirPath)
        return { ok: true, path: dirPath }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )
}
