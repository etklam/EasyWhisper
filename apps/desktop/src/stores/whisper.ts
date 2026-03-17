import { defineStore } from 'pinia'

import type {
  WhisperCompleteEvent,
  WhisperErrorEvent,
  WhisperSettings,
  WhisperTask
} from '@shared/types'

type RuntimeTask = WhisperTask & {
  progress: number
  message?: string
}

function createDefaultSettings(): WhisperSettings {
  return {
    modelPath: '/path/to/models/ggml-base.bin',
    threads: 4,
    language: 'auto',
    useMetal: true,
    outputDir: ''
  }
}

export const useWhisperStore = defineStore('whisper', {
  state: () => ({
    tasks: [] as RuntimeTask[],
    settings: createDefaultSettings(),
    listenersBound: false,
    unsubscribeHandles: [] as Array<() => void>
  }),
  actions: {
    bindIpcListeners() {
      if (this.listenersBound) {
        return
      }

      this.unsubscribeHandles.push(
        window.fosswhisper.onWhisperProgress((event) => {
          const task = this.tasks.find((item) => item.id === event.taskId)
          if (!task) {
            return
          }
          task.progress = event.progress
          task.status = 'running'
          task.message = event.message
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onWhisperComplete((event: WhisperCompleteEvent) => {
          const task = this.tasks.find((item) => item.id === event.taskId)
          if (!task) {
            return
          }
          task.progress = 100
          task.status = 'completed'
          task.outputPath = event.outputPath
          task.message = `Done in ${(event.durationMs / 1000).toFixed(1)}s`
        })
      )

      this.unsubscribeHandles.push(
        window.fosswhisper.onWhisperError((event: WhisperErrorEvent) => {
          const task = this.tasks.find((item) => item.id === event.taskId)
          if (!task) {
            return
          }
          task.status = 'error'
          task.errorMessage = event.error
          task.message = event.error
        })
      )

      this.listenersBound = true
    },
    async enqueueFiles(filePaths: string[]) {
      for (const filePath of filePaths) {
        const now = new Date().toISOString()
        const task: RuntimeTask = {
          id: crypto.randomUUID(),
          audioPath: filePath,
          modelPath: this.settings.modelPath,
          language: this.settings.language,
          threads: this.settings.threads,
          useMetal: this.settings.useMetal,
          createdAt: now,
          status: 'pending',
          progress: 0
        }

        this.tasks.unshift(task)
        await this.startTask(task)
      }
    },
    async startTask(task: RuntimeTask) {
      task.status = 'running'
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
    updateSettings(partial: Partial<WhisperSettings>) {
      this.settings = {
        ...this.settings,
        ...partial
      }
    },
    reset() {
      for (const unsubscribe of this.unsubscribeHandles) {
        unsubscribe()
      }
      this.listenersBound = false
      this.unsubscribeHandles = []
      this.tasks = []
    }
  }
})
