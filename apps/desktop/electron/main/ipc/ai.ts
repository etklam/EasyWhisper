import { ipcMain, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'

import { IPC_CHANNELS } from '@shared/ipc'
import type {
  AiErrorResult,
  AiPipelineStatsResponse,
  AiRunPayload,
  AiRunResult,
  AiSaveResultsPayload,
  AiSaveResultsResponse,
  AiStatusResponse,
  AiStopPayload,
  AiStopResponse
} from '@shared/types'
import { getPipelineManager } from '../ai/PipelineManager'
import type { AiSettings } from '../ai/types'
import { checkOllama, listModels } from '../ai/OllamaClient'

const activeTaskControllers = new Map<string, AbortController>()

export function registerAiIpc(_mainWindow: BrowserWindow): void {
  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.AI_RUN)
  }
  ipcMain.handle(IPC_CHANNELS.AI_RUN, async (_event, payload: AiRunPayload): Promise<AiRunResult> => {
    const taskId = payload.id ?? randomUUID()
    const pipelineManager = getPipelineManager()
    const pipeline = pipelineManager.getPipeline(payload.model ?? 'llama2', {
      correct: true,
      translate: true,
      summary: true
    })
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
            // 只通過返回值傳遞結果，不再發送 event
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
      // 錯誤也不發 event，只返回
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

  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.AI_SAVE_RESULTS)
  }
  ipcMain.handle(
    IPC_CHANNELS.AI_SAVE_RESULTS,
    async (_event, payload: AiSaveResultsPayload): Promise<AiSaveResultsResponse> => {
      const savedPaths: Array<{ task: string; path: string }> = []
      const basePath = payload.outputPath.replace(/\.[^.]+$/, '')

      for (const [task, result] of Object.entries(payload.results)) {
        if (!result) continue

        const outputPath = `${basePath}.${task}.txt`
        try {
          await writeFile(outputPath, result, 'utf8')
          savedPaths.push({ task, path: outputPath })
        } catch (error) {
          console.error(`Failed to save AI result for ${task}:`, error)
        }
      }

      return { savedPaths }
    }
  )

  if (typeof ipcMain.removeHandler === 'function') {
    ipcMain.removeHandler(IPC_CHANNELS.AI_GET_PIPELINE_STATS)
  }
  ipcMain.handle(IPC_CHANNELS.AI_GET_PIPELINE_STATS, async (): Promise<AiPipelineStatsResponse> => {
    const pipelineManager = getPipelineManager()
    return pipelineManager.getStats()
  })
}
