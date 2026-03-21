import { defineStore } from 'pinia'

import type {
  OutputFormat,
  WhisperModelInfo,
  WhisperModelDownloadProgressEvent,
  WorkflowSettings
} from '@shared/types'
import type { TranscriptionLanguageValue } from '@/utils/transcription-language'

function createDefaultSettings(): WorkflowSettings {
  return {
    modelPath: '/path/to/models/ggml-base.bin',
    threads: 4,
    language: 'auto',
    useMetal: true,
    outputDir: '',
    outputToSourceDir: false,
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
    settings: createDefaultSettings(),
    temporaryLanguage: null as TranscriptionLanguageValue | null,
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

    async updateSettings(partial: Partial<WorkflowSettings>) {
      this.settings = await window.fosswhisper.setSettings(partial)
    },

    setTemporaryLanguage(language: TranscriptionLanguageValue) {
      this.temporaryLanguage = language
    },

    getEffectiveLanguage(): string {
      return this.temporaryLanguage ?? this.settings.language
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
      this.models = []
      this.modelDownloadProgress = {}
      this.outputFormats = []
      this.temporaryLanguage = null
      this.initialized = false
    }
  }
})
