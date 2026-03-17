import { ipcMain, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'

import { IPC_CHANNELS } from '@shared/ipc'
import type { AiRunPayload, AiRunResult, AiStatusResponse } from '@shared/types'
import { AiPipeline } from '../ai/AiPipeline'
import { listModels } from '../ai/OllamaClient'

function createPipeline(model: string): AiPipeline {
  return new AiPipeline(model, {
    correct: true,
    translate: true,
    summary: true
  })
}

export function registerAiIpc(_mainWindow: BrowserWindow): void {
  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.AI_RUN)
  }
  ipcMain.handle(IPC_CHANNELS.AI_RUN, async (_event, payload: AiRunPayload): Promise<AiRunResult> => {
    const pipeline = createPipeline(payload.model ?? 'llama2')
    await pipeline.init()

    return new Promise<AiRunResult>((resolve) => {
      void pipeline.process({
        ...payload,
        id: payload.id ?? randomUUID(),
        onResult: resolve
      })
    })
  })

  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.AI_STOP)
  }
  ipcMain.handle(IPC_CHANNELS.AI_STOP, async (): Promise<boolean> => {
    return false
  })

  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.AI_GET_STATUS)
  }
  ipcMain.handle(IPC_CHANNELS.AI_GET_STATUS, async (): Promise<AiStatusResponse> => {
    return {
      running: false,
      activeTasks: 0,
      queueLength: 0
    }
  })

  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.AI_LIST_MODELS)
  }
  ipcMain.handle(IPC_CHANNELS.AI_LIST_MODELS, async (): Promise<string[]> => {
    return listModels()
  })
}
