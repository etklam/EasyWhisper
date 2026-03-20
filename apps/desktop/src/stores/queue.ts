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
  messageParams?: Record<string, string | number>
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
          item.message = event.message ?? 'queue.messages.transcribing'
          item.messageParams = undefined
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
          item.message = 'queue.messages.downloading'
          item.messageParams = { progress: item.downloadProgress }
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
          item.message = 'queue.messages.downloadComplete'
          item.messageParams = undefined
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
          item.message = 'queue.messages.converting'
          item.messageParams = { progress: item.downloadProgress }
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
          item.message = 'queue.messages.paused'
        } else {
          item.message = 'queue.messages.cannotPause'
        }
        item.messageParams = undefined
        return
      }

      item.paused = false
      if (item.status === 'pending') {
        item.message = undefined
        item.messageParams = undefined
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
      item.error = 'queue.messages.cancelled'
      item.message = 'queue.messages.cancelled'
      item.messageParams = undefined
      item.aiError = 'queue.messages.cancelled'
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
      item.messageParams = undefined
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
        nextItem.error = 'queue.messages.fileNotFound'
        nextItem.message = nextItem.error
        nextItem.messageParams = undefined
        this.pumpQueue()
        return
      }

      void this.startAudioTask(nextItem, nextItem.filePath)
    },

    async startYtDlpTask(item: QueueTask) {
      const settings = this.getSettings()
      item.status = 'downloading'
      item.message = 'queue.messages.waitingDownload'
      item.messageParams = undefined

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
        item.messageParams = undefined
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
        item.error = 'queue.messages.audioNotFound'
        item.message = item.error
        item.messageParams = undefined
        this.pumpQueue()
        return
      }

      const settings = this.getSettings()
      item.status = 'transcribing'
      item.message = item.source === 'ytdlp'
        ? 'queue.messages.startTranscribingDownload'
        : 'queue.messages.startTranscribing'
      item.messageParams = undefined

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
        item.messageParams = undefined
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
      item.message = 'queue.messages.convertingToWav'
      item.messageParams = undefined

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
        item.message = 'queue.messages.conversionComplete'
        item.messageParams = undefined
        await this.startWhisperTask(item)
      } catch (error) {
        if (item.cancelRequested) {
          this.pumpQueue()
          return
        }

        item.status = 'error'
        item.error = toErrorMessage(error)
        item.message = item.error
        item.messageParams = undefined
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
        item.message = 'queue.messages.outputFormatFailed'
        item.messageParams = { error: item.error }
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
          item.message = 'queue.messages.aiQueuedShort'
          item.messageParams = undefined
          this.pumpQueue()
          return
        }
      }

      item.status = 'done'
      item.message = 'queue.messages.complete'
      item.messageParams = { duration: (event.durationMs / 1000).toFixed(1) }
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
      item.message = step ? 'queue.messages.aiQueued' : 'queue.messages.aiQueuedShort'
      item.messageParams = step ? { stepKey: getAiStepTranslationKey(step) } : undefined
    },

    updateAiProgress(taskId: string, progress: number, step?: AiTaskType) {
      const item = this.findTask(taskId)
      if (!item || item.cancelRequested) {
        return
      }

      item.status = 'ai'
      item.aiProgress = clampProgress(progress)
      item.aiCurrentStep = step
      item.message = step ? 'queue.messages.aiProcessing' : 'queue.messages.aiProcessingShort'
      item.messageParams = step
        ? {
            progress: item.aiProgress,
            stepKey: getAiStepTranslationKey(step)
          }
        : {
            progress: item.aiProgress
          }
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
      item.message = 'queue.messages.transcriptionAiComplete'
      item.messageParams = undefined
    },

    failAiTask(taskId: string, error: string) {
      const item = this.findTask(taskId)
      if (!item || item.cancelRequested) {
        return
      }

      item.status = 'error'
      item.error = error
      item.aiError = error
      item.message = 'queue.messages.aiFailed'
      item.messageParams = { error }
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

function getAiStepTranslationKey(step: AiTaskType): string {
  if (step === 'correct') return 'queue.messages.aiStep.correct'
  if (step === 'translate') return 'queue.messages.aiStep.translate'
  return 'queue.messages.aiStep.summary'
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
