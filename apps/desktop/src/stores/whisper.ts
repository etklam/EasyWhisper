import { defineStore } from 'pinia'

import type {
  AiTaskType,
  OutputFormat,
  WhisperCompleteEvent,
  WhisperErrorEvent,
  WhisperModelInfo,
  WhisperModelDownloadProgressEvent,
  WorkflowSettings,
  WhisperTask,
  YtDlpCompleteEvent,
  YtDlpErrorEvent,
  YtDlpProgressEvent
} from '@shared/types'
import { parseUrlList } from '@shared/url'

type TaskSource = 'file' | 'ytdlp'

export type RuntimeTask = WhisperTask & {
  source: TaskSource
  url?: string
  progress: number
  message?: string
  messageParams?: Record<string, string | number>
  transcript?: string
  aiResults?: Partial<Record<AiTaskType, string>>
}

function createDefaultSettings(): WorkflowSettings {
  return {
    modelPath: '/path/to/models/ggml-base.bin',
    threads: 4,
    language: 'auto',
    useMetal: true,
    outputDir: '',
    outputFormats: ['txt', 'srt'],
    ytdlpAudioFormat: 'mp3',
    ytdlpCookiesPath: '',
    ytdlpMode: 'system',
    ffmpegMode: 'system',
    aiEnabled: false,
    aiModel: '',
    aiTargetLang: 'zh-TW',
    aiCorrect: false,
    aiTranslate: false,
    aiSummary: false,
    locale: 'en'
  }
}

export const useWhisperStore = defineStore('whisper', {
  state: () => ({
    tasks: [] as RuntimeTask[],
    settings: createDefaultSettings(),
    aiModels: [] as string[],
    models: [] as WhisperModelInfo[],
    modelDownloadProgress: {} as Partial<Record<string, number>>,
    outputFormats: [] as OutputFormat[],
    listenersBound: false,
    initialized: false,
    unsubscribeHandles: [] as Array<() => void>
  }),
  actions: {
    async initialize() {
      const [settingsResult, aiModelsResult, whisperModelsResult, outputFormatsResult] = await Promise.allSettled([
        window.fosswhisper.getSettings(),
        window.fosswhisper.listAiModels(),
        window.fosswhisper.listModels(),
        window.fosswhisper.getOutputFormats()
      ])

      if (settingsResult.status === 'fulfilled') {
        this.settings = settingsResult.value
      }

      if (aiModelsResult.status === 'fulfilled') {
        this.aiModels = aiModelsResult.value
      } else {
        this.aiModels = []
      }

      if (whisperModelsResult.status === 'fulfilled') {
        this.models = whisperModelsResult.value
      } else {
        this.models = []
      }

      if (outputFormatsResult.status === 'fulfilled') {
        this.outputFormats = outputFormatsResult.value
      } else {
        this.outputFormats = ['txt', 'srt', 'vtt', 'json']
      }

      this.initialized = true
    },

    bindIpcListeners() {
      if (this.listenersBound) {
        return
      }

      this.unsubscribeHandles.push(
        window.fosswhisper.onWhisperProgress((event) => {
          const task = this.findTask(event.taskId)
          if (!task) return
          task.progress = Math.max(task.progress, event.progress)
          task.status = 'running'
          task.message = event.message ?? 'queue.messages.transcribing'
          task.messageParams = undefined
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onWhisperComplete((event: WhisperCompleteEvent) => {
          const task = this.findTask(event.taskId)
          if (!task) return
          task.outputPath = event.outputPath
          task.transcript = event.text
          task.progress = 100
          task.message = 'queue.messages.complete'
          task.messageParams = { duration: (event.durationMs / 1000).toFixed(1) }
          if (this.shouldRunAi()) {
            void this.runAiForTask(task, event.text)
          } else {
            task.status = 'completed'
          }
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onWhisperError((event: WhisperErrorEvent) => {
          const task = this.findTask(event.taskId)
          if (!task) return
          task.status = 'error'
          task.errorMessage = event.error
          task.message = event.error
          task.messageParams = undefined
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onYtDlpProgress((event: YtDlpProgressEvent) => {
          const task = this.findTask(event.taskId)
          if (!task) return
          task.status = 'running'
          task.progress = Math.max(0, Math.min(99, event.progress))
          task.message = 'queue.messages.downloading'
          task.messageParams = { progress: event.progress.toFixed(0) }
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onYtDlpComplete((event: YtDlpCompleteEvent) => {
          const task = this.findTask(event.taskId)
          if (!task) return
          task.audioPath = event.outputPath
          task.progress = 0
          task.message = 'queue.messages.downloadComplete'
          task.messageParams = undefined
          void this.startWhisperTask(task)
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onYtDlpError((event: YtDlpErrorEvent) => {
          const task = this.findTask(event.taskId)
          if (!task) return
          task.status = 'error'
          task.errorMessage = event.error
          task.message = event.error
          task.messageParams = undefined
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onModelProgress((event: WhisperModelDownloadProgressEvent) => {
          this.modelDownloadProgress[event.modelId] = event.progress
          const model = this.models.find((item) => item.id === event.modelId)
          if (model && event.progress >= 100) {
            model.downloaded = true
          }
        })
      )

      this.listenersBound = true
    },

    async enqueueFiles(filePaths: string[]) {
      for (const filePath of filePaths) {
        const task = this.createTask({
          source: 'file',
          audioPath: filePath
        })
        this.tasks.unshift(task)
        await this.startWhisperTask(task)
      }
    },

    async enqueueUrls(rawInput: string) {
      const urls = parseUrlList(rawInput)
      for (const url of urls) {
        const task = this.createTask({
          source: 'ytdlp',
          url,
          audioPath: ''
        })
        this.tasks.unshift(task)
        await this.startYtDlpTask(task)
      }
    },

    async updateSettings(partial: Partial<WorkflowSettings>) {
      this.settings = await window.fosswhisper.setSettings(partial)
    },

    async refreshModels() {
      try {
        this.models = await window.fosswhisper.listModels()
      } catch {
        this.models = []
      }
    },

    async downloadModel(modelId: WhisperModelInfo['id']) {
      this.modelDownloadProgress[modelId] = 0
      await window.fosswhisper.downloadModel({ modelId })

      this.modelDownloadProgress[modelId] = 100
      await this.refreshModels()
    },

    async refreshAiModels() {
      try {
        this.aiModels = await window.fosswhisper.listAiModels()
      } catch {
        this.aiModels = []
      }
    },

    reset() {
      for (const unsubscribe of this.unsubscribeHandles) {
        unsubscribe()
      }
      this.listenersBound = false
      this.unsubscribeHandles = []
      this.tasks = []
      this.models = []
      this.modelDownloadProgress = {}
      this.outputFormats = []
      this.initialized = false
    },

    createTask(partial: { source: TaskSource; audioPath: string; url?: string }): RuntimeTask {
      const now = new Date().toISOString()
      return {
        id: crypto.randomUUID(),
        source: partial.source,
        url: partial.url,
        audioPath: partial.audioPath,
        modelPath: this.settings.modelPath,
        language: this.settings.language,
        threads: this.settings.threads,
        useMetal: this.settings.useMetal,
        createdAt: now,
        status: 'pending',
        progress: 0
      }
    },

    async startYtDlpTask(task: RuntimeTask) {
      if (!task.url) return
      task.status = 'running'
      task.message = 'queue.messages.waitingDownload'
      task.messageParams = undefined
      try {
        await window.fosswhisper.startYtDlp({
          taskId: task.id,
          url: task.url,
          format: this.settings.ytdlpAudioFormat,
          cookiesPath: this.settings.ytdlpCookiesPath || undefined
        })
      } catch (error) {
        task.status = 'error'
        task.errorMessage = error instanceof Error ? error.message : String(error)
        task.message = task.errorMessage
        task.messageParams = undefined
      }
    },

    async startWhisperTask(task: RuntimeTask) {
      task.status = 'running'
      task.progress = 0
      task.message = task.source === 'ytdlp'
        ? 'queue.messages.startTranscribingDownload'
        : 'queue.messages.startTranscribing'
      task.messageParams = undefined
      await window.fosswhisper.startWhisper({
        taskId: task.id,
        audioPath: task.audioPath,
        modelPath: this.settings.modelPath,
        language: this.settings.language,
        threads: this.settings.threads,
        useMetal: this.settings.useMetal,
        outputDir: this.settings.outputDir || undefined
      })
    },

    async runAiForTask(task: RuntimeTask, text: string) {
      task.status = 'running'
      task.message = 'queue.status.ai'
      task.messageParams = undefined

      const enabledTasks = this.getEnabledAiTasks()
      if (enabledTasks.length === 0 || !this.settings.aiModel) {
        task.status = 'completed'
        return
      }

      const aiResults: Partial<Record<AiTaskType, string>> = {}
      let currentText = text

      for (const taskType of enabledTasks) {
        const result = await window.fosswhisper.runAi({
          id: `${task.id}:${taskType}`,
          model: this.settings.aiModel,
          text: currentText,
          taskType,
          targetLang: this.settings.aiTargetLang,
          batchMode: taskType === 'translate',
          customPrompts: this.settings.aiCustomPrompts
        })

        if ('error' in result) {
          task.status = 'error'
          task.errorMessage = result.error
          task.message = 'queue.messages.aiFailed'
          task.messageParams = { error: result.error }
          return
        }

        if ('skipped' in result) {
          continue
        }

        aiResults[taskType] = result.result
        if (taskType !== 'summary') {
          currentText = result.result
        }
      }

      task.aiResults = aiResults
      task.message = 'queue.messages.transcriptionAiComplete'
      task.messageParams = undefined
      task.status = 'completed'
    },

    shouldRunAi(): boolean {
      return this.settings.aiEnabled && this.getEnabledAiTasks().length > 0
    },

    getEnabledAiTasks(): AiTaskType[] {
      const tasks: AiTaskType[] = []
      if (this.settings.aiCorrect) tasks.push('correct')
      if (this.settings.aiTranslate) tasks.push('translate')
      if (this.settings.aiSummary) tasks.push('summary')
      return tasks
    },

    findTask(taskId: string): RuntimeTask | undefined {
      return this.tasks.find((item: RuntimeTask) => item.id === taskId)
    }
  }
})
