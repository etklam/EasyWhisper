import { defineStore } from 'pinia'

import type {
  AiRunResult,
  AiTaskType,
  WhisperCompleteEvent,
  WhisperErrorEvent,
  WhisperProgressEvent,
  WorkflowSettings,
  WhisperTask,
  YtDlpCompleteEvent,
  YtDlpErrorEvent,
  YtDlpProgressEvent
} from '@shared/types'

type TaskSource = 'file' | 'ytdlp'

export type RuntimeTask = WhisperTask & {
  source: TaskSource
  url?: string
  progress: number
  message?: string
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
    ytdlpAudioFormat: 'mp3',
    ytdlpCookiesPath: '',
    aiEnabled: false,
    aiModel: '',
    aiTargetLang: 'zh-TW',
    aiCorrect: false,
    aiTranslate: false,
    aiSummary: false
  }
}

export const useWhisperStore = defineStore('whisper', {
  state: () => ({
    tasks: [] as RuntimeTask[],
    settings: createDefaultSettings(),
    aiModels: [] as string[],
    listenersBound: false,
    initialized: false,
    unsubscribeHandles: [] as Array<() => void>
  }),
  actions: {
    async initialize() {
      const [settingsResult, modelsResult] = await Promise.allSettled([
        window.fosswhisper.getSettings(),
        window.fosswhisper.listAiModels()
      ])

      if (settingsResult.status === 'fulfilled') {
        this.settings = settingsResult.value
      }

      if (modelsResult.status === 'fulfilled') {
        this.aiModels = modelsResult.value
      } else {
        this.aiModels = []
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
          task.message = event.message ?? `Whisper ${event.stage}`
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onWhisperComplete((event: WhisperCompleteEvent) => {
          const task = this.findTask(event.taskId)
          if (!task) return
          task.outputPath = event.outputPath
          task.transcript = event.text
          task.progress = 100
          task.message = `Transcribed in ${(event.durationMs / 1000).toFixed(1)}s`
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
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onYtDlpProgress((event: YtDlpProgressEvent) => {
          const task = this.findTask(event.taskId)
          if (!task) return
          task.status = 'running'
          task.progress = Math.max(0, Math.min(99, event.progress))
          task.message = `Downloading audio ${event.progress.toFixed(0)}%`
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onYtDlpComplete((event: YtDlpCompleteEvent) => {
          const task = this.findTask(event.taskId)
          if (!task) return
          task.audioPath = event.outputPath
          task.progress = 0
          task.message = 'Download complete, starting transcription'
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
      const urls = parseUrlInput(rawInput)
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
      task.message = 'Downloading audio'
      await window.fosswhisper.startYtDlp({
        taskId: task.id,
        url: task.url,
        format: this.settings.ytdlpAudioFormat,
        cookiesPath: this.settings.ytdlpCookiesPath || undefined
      })
    },

    async startWhisperTask(task: RuntimeTask) {
      task.status = 'running'
      task.progress = 0
      task.message = task.source === 'ytdlp' ? 'Preparing transcription' : 'Starting transcription'
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
      task.message = 'Running AI post-processing'

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
          task.message = `AI ${taskType} failed: ${result.error}`
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
      task.message = 'Workflow complete'
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

function parseUrlInput(rawInput: string): string[] {
  return rawInput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}
