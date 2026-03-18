import { ipcMain, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'

import { IPC_CHANNELS } from '@shared/ipc'
import type {
  AiErrorResult,
  AiRunPayload,
  AiRunResult,
  AiStatusResponse,
  AiStopPayload,
  AiStopResponse
} from '@shared/types'
import { AiPipeline } from '../ai/AiPipeline'
import { checkOllama, listModels } from '../ai/OllamaClient'

const activeTaskControllers = new Map<string, AbortController>()

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
    const taskId = payload.id ?? randomUUID()
    const pipeline = createPipeline(payload.model ?? 'llama2')
    const controller = new AbortController()
    activeTaskControllers.set(taskId, controller)

    try {
      await pipeline.init()

      return await new Promise<AiRunResult>((resolve) => {
        void pipeline.process({
          ...payload,
          id: taskId,
          signal: controller.signal,
          onProgress: (progress) => {
            _mainWindow.webContents.send(IPC_CHANNELS.AI_PROGRESS, progress)
          },
          onResult: (result) => {
            const channel = 'error' in result ? IPC_CHANNELS.AI_ERROR : IPC_CHANNELS.AI_RESULT
            _mainWindow.webContents.send(channel, result)
            resolve(result)
          }
        })
      })
    } catch (error) {
      const result: AiErrorResult = {
        taskId,
        taskType: payload.taskType,
        error: error instanceof Error ? error.message : String(error),
        detail: error instanceof Error ? error.message : String(error)
      }
      _mainWindow.webContents.send(IPC_CHANNELS.AI_ERROR, result)
      return result
    } finally {
      activeTaskControllers.delete(taskId)
    }
  })

  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.AI_STOP)
  }
  ipcMain.handle(IPC_CHANNELS.AI_STOP, async (_event, payload: AiStopPayload): Promise<AiStopResponse> => {
    const controller = activeTaskControllers.get(payload.taskId)
    if (!controller) {
      return {
        taskId: payload.taskId,
        stopped: false
      }
    }

    controller.abort(new Error('AI 任务已取消'))
    return {
      taskId: payload.taskId,
      stopped: true
    }
  })

  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.AI_GET_STATUS)
  }
  ipcMain.handle(IPC_CHANNELS.AI_GET_STATUS, async (): Promise<AiStatusResponse> => {
    const connected = await checkOllama().catch(() => false)
    return {
      connected,
      running: activeTaskControllers.size > 0,
      activeTasks: activeTaskControllers.size,
      queueLength: 0
    }
  })

  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.AI_LIST_MODELS)
  }
  ipcMain.handle(IPC_CHANNELS.AI_LIST_MODELS, async (): Promise<string[]> => {
    const connected = await checkOllama().catch(() => false)
    if (!connected) {
      return []
    }
    return listModels()
  })
}
