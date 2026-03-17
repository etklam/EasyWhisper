import { ipcMain, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'

import { IPC_CHANNELS } from '@shared/ipc'
import type { AiRunPayload, AiRunResult, AiStatusResponse } from '@shared/types'
import { AiPipeline } from '../ai/AiPipeline'
import { listModels } from '../ai/OllamaClient'

function createPipeline(): AiPipeline {
  return new AiPipeline('llama2', {
    correct: true,
    translate: true,
    summary: true
  })
}

export function registerAiIpc(_mainWindow: BrowserWindow): void {
  const pipeline = createPipeline()

  ipcMain.handle(IPC_CHANNELS.AI_RUN, async (_event, payload: AiRunPayload): Promise<AiRunResult> => {
    await pipeline.init()

    return new Promise<AiRunResult>((resolve) => {
      void pipeline.process({
        ...payload,
        id: payload.id ?? randomUUID(),
        onResult: resolve
      })
    })
  })

  ipcMain.handle(IPC_CHANNELS.AI_STOP, async (): Promise<boolean> => {
    return false
  })

  ipcMain.handle(IPC_CHANNELS.AI_GET_STATUS, async (): Promise<AiStatusResponse> => {
    const status = pipeline.getStatus()
    return {
      running: status.activeTasks > 0,
      activeTasks: status.activeTasks,
      queueLength: 0
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_LIST_MODELS, async (): Promise<string[]> => {
    return listModels()
  })
}
