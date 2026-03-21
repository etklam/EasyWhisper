import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useWhisperStore } from '@/stores/whisper'

const mockListModels = vi.fn().mockResolvedValue([])
const mockGetOutputFormats = vi.fn().mockResolvedValue(['txt', 'srt', 'vtt', 'json'])
const mockDownloadModel = vi.fn()
const mockGetSettings = vi.fn().mockResolvedValue({
  modelPath: '/path/to/models/ggml-base.bin',
  threads: 4,
  language: 'auto',
  useMetal: true,
  outputDir: '',
  outputFormats: ['txt', 'srt'],
  ytdlpAudioFormat: 'mp3',
  ytdlpCookiesPath: '',
  aiEnabled: false,
  aiModel: '',
  aiTargetLang: 'zh-TW',
  aiCorrect: false,
  aiTranslate: false,
  aiSummary: false
})
const mockSetSettings = vi.fn().mockImplementation(async (settings) => ({
  ...(await mockGetSettings()),
  ...settings
}))
const mockListAiModels = vi.fn().mockResolvedValue(['llama3.1'])
const mockOnModelProgress = vi.fn(() => vi.fn())

Object.defineProperty(window, 'fosswhisper', {
  value: {
    listModels: mockListModels,
    downloadModel: mockDownloadModel,
    getOutputFormats: mockGetOutputFormats,
    getSettings: mockGetSettings,
    setSettings: mockSetSettings,
    listAiModels: mockListAiModels,
    onModelProgress: mockOnModelProgress
  },
  writable: true
})

describe('WhisperStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initializes with default settings', () => {
    const store = useWhisperStore()

    expect(store.settings.modelPath).toBe('/path/to/models/ggml-base.bin')
    expect(store.settings.threads).toBe(4)
    expect(store.settings.language).toBe('auto')
    expect(store.settings.useMetal).toBe(true)
    expect(store.settings.outputFormats).toEqual(['txt', 'srt'])
    expect(store.settings.ytdlpAudioFormat).toBe('mp3')
  })

  it('updates settings through preload', async () => {
    const store = useWhisperStore()

    await store.updateSettings({
      modelPath: '/new/model/path.bin',
      threads: 8,
      language: 'en'
    })

    expect(store.settings.modelPath).toBe('/new/model/path.bin')
    expect(store.settings.threads).toBe(8)
    expect(store.settings.language).toBe('en')
  })

  it('initializes settings, models and output formats from preload', async () => {
    const store = useWhisperStore()

    await store.initialize()

    expect(mockGetSettings).toHaveBeenCalled()
    expect(mockListAiModels).toHaveBeenCalled()
    expect(mockListModels).toHaveBeenCalled()
    expect(mockGetOutputFormats).toHaveBeenCalled()
    expect(store.initialized).toBe(true)
    expect(store.aiModels).toEqual(['llama3.1'])
    expect(store.outputFormats).toEqual(['txt', 'srt', 'vtt', 'json'])
  })

  it('binds only the model progress listener', () => {
    const store = useWhisperStore()

    store.bindIpcListeners()
    store.bindIpcListeners()

    expect(store.listenersBound).toBe(true)
    expect(mockOnModelProgress).toHaveBeenCalledTimes(1)
    expect(store.unsubscribeHandles).toHaveLength(1)
  })

  it('resolves temporary language over default language', () => {
    const store = useWhisperStore()

    expect(store.getEffectiveLanguage()).toBe('auto')

    store.setTemporaryLanguage('ja')

    expect(store.getEffectiveLanguage()).toBe('ja')
  })

  it('resets derived state while preserving settings object shape', () => {
    const store = useWhisperStore()
    store.bindIpcListeners()
    store.modelDownloadProgress['ggml-base.bin'] = 100
    store.outputFormats = ['txt']
    store.temporaryLanguage = 'ja'
    store.initialized = true

    store.reset()

    expect(store.listenersBound).toBe(false)
    expect(store.unsubscribeHandles).toHaveLength(0)
    expect(store.modelDownloadProgress).toEqual({})
    expect(store.outputFormats).toEqual([])
    expect(store.temporaryLanguage).toBeNull()
    expect(store.initialized).toBe(false)
  })
})
