import { defineStore } from 'pinia'

import type { AiTaskType, WorkflowSettings } from '@shared/types'
import {
  cancelAiWorkflow,
  clearAiWorkflow,
  enqueueAiWorkflow,
  registerQueueWorkflowBridge
} from './aiWorkflowCoordinator'
import { useWhisperStore } from './whisper'

export type QueueSource = 'file' | 'ytdlp'
export type QueueStatus = 'pending' | 'downloading' | 'converting' | 'transcribing' | 'ai' | 'done' | 'error'

export interface QueueTask {
  id: string
  source: QueueSource
  filePath?: string
  url?: string
  title: string
  status: QueueStatus
  downloadProgress: number
  transcribeProgress: number
  outputPath?: string
  transcript?: string
  error?: string
  message?: string
  paused: boolean
  cancelRequested: boolean
  aiProgress: number
  aiCurrentStep?: AiTaskType
  aiError?: string
  aiResults: Partial<Record<AiTaskType, string>>
}

const MAX_CONCURRENT_TASKS = 1

function createTask(input: { source: QueueSource; filePath?: string; url?: string }): QueueTask {
  return {
    id: crypto.randomUUID(),
    source: input.source,
    filePath: input.filePath,
    url: input.url,
    title: input.filePath ? getBaseName(input.filePath) : input.url ?? '未命名任务',
    status: 'pending',
    downloadProgress: 0,
    transcribeProgress: 0,
    paused: false,
    cancelRequested: false,
    aiProgress: 0,
    aiResults: {}
  }
}

function clampProgress(value: number): number {
  if (value <= 1) {
    return Math.max(0, Math.min(100, Math.round(value * 100)))
  }
  return Math.max(0, Math.min(100, Math.round(value)))
}

function isActiveStatus(status: QueueStatus): boolean {
  return status === 'downloading' || status === 'converting' || status === 'transcribing'
}

function isTerminalStatus(status: QueueStatus): boolean {
  return status === 'done' || status === 'error'
}

export const useQueueStore = defineStore('queue', {
  state: () => ({
    items: [] as QueueTask[],
    listenersBound: false,
    queuePaused: false,
    unsubscribeHandles: [] as Array<() => void>
  }),
  getters: {
    activeCount(state): number {
      return state.items.filter((item) => isActiveStatus(item.status) && !item.cancelRequested).length
    }
  },
  actions: {
    registerCoordinator() {
      registerQueueWorkflowBridge({
        markAiQueued: (taskId, step) => this.markAiQueued(taskId, step),
        updateAiProgress: (taskId, progress, step) => this.updateAiProgress(taskId, progress, step),
        completeAiTask: (taskId, results) => this.completeAiTask(taskId, results),
        failAiTask: (taskId, error) => this.failAiTask(taskId, error)
      })
    },

    bindIpcListeners() {
      this.registerCoordinator()
      if (this.listenersBound) {
        return
      }

      this.unsubscribeHandles.push(
        window.fosswhisper.onWhisperProgress((event) => {
          const item = this.findTask(event.taskId)
          if (!item || item.cancelRequested) {
            return
          }

          item.status = 'transcribing'
          item.transcribeProgress = clampProgress(event.progress)
          item.message = event.message ?? '正在转录'
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onWhisperComplete((event) => {
          void this.handleWhisperComplete(event)
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onWhisperError((event) => {
          const item = this.findTask(event.taskId)
          if (!item) {
            this.pumpQueue()
            return
          }

          item.status = 'error'
          item.error = event.error
          item.message = event.error
          this.pumpQueue()
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onYtDlpProgress((event) => {
          const item = this.findTask(event.taskId)
          if (!item || item.cancelRequested) {
            return
          }

          item.status = 'downloading'
          item.downloadProgress = clampProgress(event.progress)
          item.message = `正在下载音频 ${item.downloadProgress}%`
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onYtDlpComplete((event) => {
          const item = this.findTask(event.taskId)
          if (!item || item.cancelRequested) {
            this.pumpQueue()
            return
          }

          item.filePath = event.outputPath
          item.downloadProgress = 100
          item.message = '下载完成，准备转换音频'
          void this.startAudioTask(item, event.outputPath)
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onYtDlpError((event) => {
          const item = this.findTask(event.taskId)
          if (!item) {
            this.pumpQueue()
            return
          }

          if (item.cancelRequested) {
            this.pumpQueue()
            return
          }

          item.status = 'error'
          item.error = event.error
          item.message = event.error
          this.pumpQueue()
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onAudioProgress((event) => {
          const item = this.findTask(event.taskId)
          if (!item || item.cancelRequested) {
            return
          }

          item.status = 'converting'
          item.downloadProgress = clampProgress(event.progress)
          item.message = `正在转换音频 ${item.downloadProgress}%`
        })
      )

      this.listenersBound = true
    },

    enqueueFiles(filePaths: string[]) {
      this.registerCoordinator()
      for (const filePath of filePaths) {
        this.items.unshift(createTask({ source: 'file', filePath }))
      }
      this.pumpQueue()
    },

    enqueueUrls(urls: string[]) {
      this.registerCoordinator()
      for (const url of urls) {
        this.items.unshift(createTask({ source: 'ytdlp', url }))
      }
      this.pumpQueue()
    },

    togglePause(id: string) {
      const item = this.findTask(id)
      if (!item || isTerminalStatus(item.status)) {
        return
      }

      if (!item.paused) {
        item.paused = true
        if (item.status === 'pending') {
          item.message = '已暂停'
        } else {
          item.message = '当前任务无法立即暂停，稍后可重试'
        }
        return
      }

      item.paused = false
      if (item.status === 'pending') {
        item.message = undefined
      }
      this.pumpQueue()
    },

    cancelTask(id: string) {
      this.registerCoordinator()
      const item = this.findTask(id)
      if (!item || isTerminalStatus(item.status)) {
        return
      }

      if (item.status === 'downloading') {
        void window.fosswhisper.cancelYtDlp({ taskId: item.id })
      }

      void cancelAiWorkflow(item.id)

      item.cancelRequested = true
      item.paused = false
      item.status = 'error'
      item.error = '已取消'
      item.message = '已取消'
      item.aiError = '已取消'
      this.pumpQueue()
    },

    retryTask(id: string) {
      this.registerCoordinator()
      const item = this.findTask(id)
      if (!item || !isTerminalStatus(item.status)) {
        return
      }

      item.status = 'pending'
      item.downloadProgress = 0
      item.transcribeProgress = 0
      item.outputPath = undefined
      item.transcript = undefined
      item.error = undefined
      item.message = undefined
      item.paused = false
      item.cancelRequested = false
      item.aiProgress = 0
      item.aiCurrentStep = undefined
      item.aiError = undefined
      item.aiResults = {}
      clearAiWorkflow(id)
      this.pumpQueue()
    },

    reset() {
      for (const unsubscribe of this.unsubscribeHandles) {
        unsubscribe()
      }
      this.items = []
      this.listenersBound = false
      this.queuePaused = false
      this.unsubscribeHandles = []
    },

    findTask(id: string): QueueTask | undefined {
      return this.items.find((item) => item.id === id)
    },

    pumpQueue() {
      this.registerCoordinator()
      if (this.queuePaused || this.activeCount >= MAX_CONCURRENT_TASKS) {
        return
      }

      const nextItem = this.items.find(
        (item) => item.status === 'pending' && !item.paused && !item.cancelRequested
      )

      if (!nextItem) {
        return
      }

      if (nextItem.source === 'ytdlp') {
        void this.startYtDlpTask(nextItem)
        return
      }

      if (!nextItem.filePath) {
        nextItem.status = 'error'
        nextItem.error = '找不到可处理的文件'
        nextItem.message = nextItem.error
        this.pumpQueue()
        return
      }

      void this.startAudioTask(nextItem, nextItem.filePath)
    },

    async startYtDlpTask(item: QueueTask) {
      const settings = this.getSettings()
      item.status = 'downloading'
      item.message = '等待下载音频'

      try {
        await window.fosswhisper.startYtDlp({
          taskId: item.id,
          url: item.url ?? '',
          format: settings.ytdlpAudioFormat,
          cookiesPath: settings.ytdlpCookiesPath || undefined
        })
      } catch (error) {
        item.status = 'error'
        item.error = toErrorMessage(error)
        item.message = item.error
        this.pumpQueue()
      }
    },

    async startWhisperTask(item: QueueTask) {
      if (item.cancelRequested || !item.filePath) {
        if (item.cancelRequested) {
          this.pumpQueue()
          return
        }

        item.status = 'error'
        item.error = '找不到可转录的音频文件'
        item.message = item.error
        this.pumpQueue()
        return
      }

      const settings = this.getSettings()
      item.status = 'transcribing'
      item.message = item.source === 'ytdlp' ? '开始转录下载内容' : '开始转录'

      try {
        await window.fosswhisper.startWhisper({
          taskId: item.id,
          audioPath: item.filePath,
          modelPath: settings.modelPath,
          language: settings.language,
          threads: settings.threads,
          useMetal: settings.useMetal,
          outputDir: settings.outputDir || undefined
        })
      } catch (error) {
        item.status = 'error'
        item.error = toErrorMessage(error)
        item.message = item.error
        this.pumpQueue()
      }
    },

    async startAudioTask(item: QueueTask, inputPath: string) {
      if (item.cancelRequested) {
        this.pumpQueue()
        return
      }

      item.status = 'converting'
      item.downloadProgress = 0
      item.message = '正在转换为 16kHz WAV'

      try {
        const result = await window.fosswhisper.convertAudio({
          taskId: item.id,
          inputPath
        })

        if (item.cancelRequested) {
          this.pumpQueue()
          return
        }

        item.filePath = result.outputPath
        item.downloadProgress = 100
        item.message = '音频转换完成，准备转录'
        await this.startWhisperTask(item)
      } catch (error) {
        if (item.cancelRequested) {
          this.pumpQueue()
          return
        }

        item.status = 'error'
        item.error = toErrorMessage(error)
        item.message = item.error
        this.pumpQueue()
      }
    },

    async handleWhisperComplete(event: { taskId: string; outputPath: string; text: string; durationMs: number }) {
      this.registerCoordinator()
      const item = this.findTask(event.taskId)
      if (!item || item.cancelRequested) {
        this.pumpQueue()
        return
      }

      item.outputPath = event.outputPath
      item.transcript = event.text
      item.transcribeProgress = 100

      try {
        const outputs = await this.generateOutputsForTask(event.outputPath)
        if (outputs.length > 0) {
          item.outputPath = outputs[0].outputPath
        }
      } catch (error) {
        item.status = 'error'
        item.error = toErrorMessage(error)
        item.message = `输出格式化失败：${item.error}`
        this.pumpQueue()
        return
      }

      if (this.shouldRunAi()) {
        const enqueued = enqueueAiWorkflow({
          queueTaskId: item.id,
          title: item.title,
          text: event.text,
          settings: this.getSettings()
        })

        if (enqueued) {
          item.status = 'ai'
          item.message = '已加入 AI 队列'
          this.pumpQueue()
          return
        }
      }

      item.status = 'done'
      item.message = `转录完成，用时 ${(event.durationMs / 1000).toFixed(1)} 秒`
      this.pumpQueue()
    },

    markAiQueued(taskId: string, step?: AiTaskType) {
      const item = this.findTask(taskId)
      if (!item) {
        return
      }

      item.status = 'ai'
      item.aiProgress = 0
      item.aiCurrentStep = step
      item.aiError = undefined
      item.message = step ? `AI 排队中，等待执行${getAiStepLabel(step)}` : 'AI 排队中'
    },

    updateAiProgress(taskId: string, progress: number, step?: AiTaskType) {
      const item = this.findTask(taskId)
      if (!item || item.cancelRequested) {
        return
      }

      item.status = 'ai'
      item.aiProgress = clampProgress(progress)
      item.aiCurrentStep = step
      item.message = step
        ? `AI 正在${getAiStepLabel(step)} ${item.aiProgress}%`
        : `AI 处理中 ${item.aiProgress}%`
    },

    completeAiTask(taskId: string, results: Partial<Record<AiTaskType, string>>) {
      const item = this.findTask(taskId)
      if (!item || item.cancelRequested) {
        return
      }

      item.aiResults = results
      item.aiProgress = 100
      item.aiCurrentStep = undefined
      item.aiError = undefined
      item.status = 'done'
      item.message = '转录与 AI 处理完成'
    },

    failAiTask(taskId: string, error: string) {
      const item = this.findTask(taskId)
      if (!item || item.cancelRequested) {
        return
      }

      item.status = 'error'
      item.error = error
      item.aiError = error
      item.message = `AI 处理失败：${error}`
    },

    async generateOutputsForTask(outputPath: string) {
      const settings = this.getSettings()
      return Promise.all(
        settings.outputFormats.map((format) =>
          window.fosswhisper.formatOutput({
            outputPath,
            format
          })
        )
      )
    },

    getSettings(): WorkflowSettings {
      return useWhisperStore().settings
    },

    shouldRunAi(): boolean {
      const settings = this.getSettings()
      return settings.aiEnabled && getEnabledAiTasks(settings).length > 0
    }
  }
})

function getEnabledAiTasks(settings: WorkflowSettings): AiTaskType[] {
  const tasks: AiTaskType[] = []
  if (settings.aiCorrect) tasks.push('correct')
  if (settings.aiTranslate) tasks.push('translate')
  if (settings.aiSummary) tasks.push('summary')
  return tasks
}

function getAiStepLabel(step: AiTaskType): string {
  if (step === 'correct') return '修正'
  if (step === 'translate') return '翻译'
  return '摘要'
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function getBaseName(filePath: string): string {
  return filePath.split(/[/\\]/).filter(Boolean).pop() ?? filePath
}
