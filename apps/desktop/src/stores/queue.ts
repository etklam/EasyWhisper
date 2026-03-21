import { defineStore } from 'pinia'

import type { AiTaskType, WorkflowSettings } from '@shared/types'
import { getEnabledAiTasks, normalizeProgress, toErrorMessage } from '@shared/workflow'
import {
  cancelAiWorkflow,
  clearAiWorkflow,
  enqueueAiWorkflow,
  registerQueueWorkflowBridge
} from './aiWorkflowCoordinator'
import { useWhisperStore } from './whisper'

export type QueueSource = 'file' | 'ytdlp'
export type QueueStatus = 'pending' | 'downloading' | 'converting' | 'transcribing' | 'ai' | 'done' | 'error'
export type TaskOutputLocation = 'default' | 'source'

export interface QueueTask {
  id: string
  source: QueueSource
  filePath?: string
  sourcePath?: string
  outputLocation?: TaskOutputLocation
  outputFileStem?: string
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
const MAX_RETAINED_TERMINAL_TASKS = 100

function createTask(input: {
  source: QueueSource
  filePath?: string
  outputLocation?: TaskOutputLocation
  url?: string
}): QueueTask {
  return {
    id: crypto.randomUUID(),
    source: input.source,
    filePath: input.filePath,
    sourcePath: input.filePath,
    outputLocation: input.outputLocation,
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
    },
    summary(state): { total: number; active: number; done: number; error: number } {
      return state.items.reduce(
        (summary, item) => {
          summary.total += 1
          if (item.status === 'done') {
            summary.done += 1
          } else if (item.status === 'error') {
            summary.error += 1
          } else if (
            item.status === 'downloading' ||
            item.status === 'converting' ||
            item.status === 'transcribing' ||
            item.status === 'ai'
          ) {
            summary.active += 1
          }
          return summary
        },
        { total: 0, active: 0, done: 0, error: 0 }
      )
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
          item.transcribeProgress = normalizeProgress(event.progress)
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
          this.trimRetainedTasks()
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
          item.downloadProgress = normalizeProgress(event.progress)
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
          item.outputFileStem = getFileStem(event.outputPath)
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
          this.trimRetainedTasks()
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
          item.downloadProgress = normalizeProgress(event.progress)
          item.message = 'queue.messages.converting'
          item.messageParams = { progress: item.downloadProgress }
        })
      )

      this.listenersBound = true
    },

    enqueueFiles(filePaths: string[], options?: { outputLocation?: TaskOutputLocation }) {
      this.registerCoordinator()
      const defaultOutputLocation = this.getSettings().outputToSourceDir ? 'source' : 'default'
      for (const filePath of filePaths) {
        this.items.unshift(
          createTask({
            source: 'file',
            filePath,
            outputLocation: options?.outputLocation ?? defaultOutputLocation
          })
        )
      }
      this.trimRetainedTasks()
      this.pumpQueue()
    },

    enqueueUrls(urls: string[]) {
      this.registerCoordinator()
      for (const url of urls) {
        this.items.unshift(createTask({ source: 'ytdlp', url }))
      }
      this.trimRetainedTasks()
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
      this.trimRetainedTasks()
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
      item.filePath = item.source === 'file' ? item.sourcePath : item.filePath
      item.outputFileStem = undefined
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

    trimRetainedTasks() {
      this.items = trimTerminalEntries(this.items, MAX_RETAINED_TERMINAL_TASKS)
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
        this.trimRetainedTasks()
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
        this.trimRetainedTasks()
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
        this.trimRetainedTasks()
        this.pumpQueue()
        return
      }

      const settings = this.getSettings()
      const resolvedOutputDir = this.resolveOutputDirForTask(item, settings)
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
          outputDir: resolvedOutputDir,
          outputFileStem: item.outputFileStem ?? getFileStem(item.sourcePath ?? item.filePath)
        })
      } catch (error) {
        item.status = 'error'
        item.error = toErrorMessage(error)
        item.message = item.error
        item.messageParams = undefined
        this.trimRetainedTasks()
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
        item.outputFileStem = item.outputFileStem ?? getFileStem(inputPath)
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
        this.trimRetainedTasks()
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
        this.trimRetainedTasks()
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
      this.trimRetainedTasks()
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
      item.aiProgress = normalizeProgress(progress)
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
      this.trimRetainedTasks()
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
      this.trimRetainedTasks()
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
      const whisperStore = useWhisperStore()
      return {
        ...whisperStore.settings,
        language: whisperStore.getEffectiveLanguage()
      }
    },

    resolveOutputDirForTask(item: QueueTask, settings: WorkflowSettings): string | undefined {
      const useSourceDir = item.outputLocation
        ? item.outputLocation === 'source'
        : settings.outputToSourceDir

      if (useSourceDir && item.sourcePath) {
        const dirPath = getDirectoryPath(item.sourcePath)
        if (dirPath) {
          return dirPath
        }
      }

      return settings.outputDir || undefined
    },

    shouldRunAi(): boolean {
      const settings = this.getSettings()
      return settings.aiEnabled && getEnabledAiTasks(settings).length > 0
    }
  }
})

function getAiStepTranslationKey(step: AiTaskType): string {
  if (step === 'correct') return 'queue.messages.aiStep.correct'
  if (step === 'translate') return 'queue.messages.aiStep.translate'
  return 'queue.messages.aiStep.summary'
}


function getBaseName(filePath: string): string {
  return filePath.split(/[/\\]/).filter(Boolean).pop() ?? filePath
}

function getFileStem(filePath: string): string {
  const baseName = getBaseName(filePath)
  const extensionIndex = baseName.lastIndexOf('.')
  if (extensionIndex <= 0) {
    return baseName
  }
  return baseName.slice(0, extensionIndex)
}

function getDirectoryPath(filePath: string): string | undefined {
  const lastSeparatorIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  if (lastSeparatorIndex <= 0) {
    return undefined
  }

  return filePath.slice(0, lastSeparatorIndex)
}

function trimTerminalEntries<T extends { status: QueueStatus }>(items: T[], maxTerminalItems: number): T[] {
  let retainedTerminalCount = 0

  return items.filter((item) => {
    if (!isTerminalStatus(item.status)) {
      return true
    }

    retainedTerminalCount += 1
    return retainedTerminalCount <= maxTerminalItems
  })
}
