// AI IPC channels 和 handlers
import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AiTask, AiProgress, AiComplete, AiError } from '../main/ai/types'

export function registerAiIpc(mainWindow: BrowserWindow): void {
  // AI 任务运行
  ipcMain.handle(
    IPC_CHANNELS.AI_RUN,
    async (_event, payload: AiTask): Promise<void> => {
      const { AiPipeline } = await import('../main/ai/AiPipeline')
      const pipeline = new AiPipeline(
        'llama2', // 默认模型
        {
          correct: true,
          translate: false,
          summary: false
        }
      )

      await pipeline.init()
      await pipeline.process(payload)
    }
  )

  // AI 任务停止
  ipcMain.handle(
    IPC_CHANNELS.AI_STOP,
    async (_event, taskId: string): Promise<void> => {
      // TODO: Implement stop logic
      console.log(`[AI] Stopping task: ${taskId}`)
    }
  )

  // AI 状态查询
  ipcMain.handle(
    IPC_CHANNELS.AI_GET_STATUS,
    async (_event): Promise<{
      running: boolean
      activeTasks: number
      queueLength: number
    }> => {
      // TODO: Implement status query
      return {
        running: false,
        activeTasks: 0,
        queueLength: 0
      }
    }
  )

  // AI 模型列表
  ipcMain.handle(
    IPC_CHANNELS.AI_LIST_MODELS,
    async (_event): Promise<string[]> => {
      const { listModels } = await import('../main/ai/OllamaClient')
      return listModels()
    }
  )

  // 进度事件发射（从 AiPipeline 到 Renderer）
  const pipeline = new (await import('../main/ai/AiPipeline')).AiPipeline(
    'llama2',
    { correct: true, translate: false, summary: false }
  )

  // 重写 process 方法以发送进度事件
  const originalProcess = pipeline.process.bind(pipeline)
  pipeline.process = async (task: AiTask): Promise<void> => {
    const onProgress = task.onProgress || ((progress: number) => {})
    
    const wrappedOnProgress = (progress: number | AiProgress) => {
      if (typeof progress === 'number') {
        onProgress({
          taskId: task.id,
          taskType: task.taskType,
          progress
        })
      } else {
        onProgress(progress)
      }

      if (task.onResult) {
        task.onResult({
          taskId: task.id,
          result: progress.result || '',
          tokensUsed: progress.tokensUsed,
          durationMs: progress.durationMs || 0
        })
      }
    }

    await originalProcess({
      ...task,
      onProgress: wrappedOnProgress
    })
  }
}

// 扩展 IPC_CHANNELS 以包含 AI channels
declare module '@shared/ipc' {
  export const IPC_CHANNELS: {
    AI_RUN: string
    AI_STOP: string
    AI_GET_STATUS: string
    AI_LIST_MODELS: string
  }
}
