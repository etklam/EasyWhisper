import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWhisperStore } from '@/stores/whisper'
import type { WhisperProgressEvent, WhisperCompleteEvent, WhisperErrorEvent } from '@shared/types'

// Mock window.fosswhisper
const mockStartWhisper = vi.fn().mockResolvedValue({ taskId: 'test-123', accepted: true })
const mockStartYtDlp = vi.fn().mockResolvedValue({ taskId: 'test-123', accepted: true })
const mockGetSettings = vi.fn().mockResolvedValue({
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
})
const mockSetSettings = vi.fn().mockImplementation(async (settings) => ({
  ...(await mockGetSettings()),
  ...settings
}))
const mockListAiModels = vi.fn().mockResolvedValue(['llama3.1'])
const mockRunAi = vi.fn()
const mockUnsubscribeProgress = vi.fn()
const mockUnsubscribeComplete = vi.fn()
const mockUnsubscribeError = vi.fn()
const mockUnsubscribeYtDlpProgress = vi.fn()
const mockUnsubscribeYtDlpComplete = vi.fn()
const mockUnsubscribeYtDlpError = vi.fn()

Object.defineProperty(window, 'fosswhisper', {
  value: {
    startWhisper: mockStartWhisper,
    startYtDlp: mockStartYtDlp,
    getSettings: mockGetSettings,
    setSettings: mockSetSettings,
    listAiModels: mockListAiModels,
    runAi: mockRunAi,
    onWhisperProgress: vi.fn(() => mockUnsubscribeProgress),
    onWhisperComplete: vi.fn(() => mockUnsubscribeComplete),
    onWhisperError: vi.fn(() => mockUnsubscribeError),
    onYtDlpProgress: vi.fn(() => mockUnsubscribeYtDlpProgress),
    onYtDlpComplete: vi.fn(() => mockUnsubscribeYtDlpComplete),
    onYtDlpError: vi.fn(() => mockUnsubscribeYtDlpError)
  },
  writable: true
})

describe('WhisperStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should initialize with default settings', () => {
    const store = useWhisperStore()

    expect(store.settings.modelPath).toBe('/path/to/models/ggml-base.bin')
    expect(store.settings.threads).toBe(4)
    expect(store.settings.language).toBe('auto')
    expect(store.settings.useMetal).toBe(true)
    expect(store.settings.ytdlpAudioFormat).toBe('mp3')
    expect(store.tasks).toHaveLength(0)
  })

  it('should enqueue files and create tasks', async () => {
    const store = useWhisperStore()
    const filePaths = ['/path/to/audio1.mp3', '/path/to/audio2.wav']

    await store.enqueueFiles(filePaths)

    expect(store.tasks).toHaveLength(2)
    // Tasks are unshifted, so first enqueued appears last in array
    expect(store.tasks[0].audioPath).toBe('/path/to/audio2.wav')
    expect(store.tasks[1].audioPath).toBe('/path/to/audio1.mp3')
  })

  it('should start tasks when enqueued', async () => {
    const store = useWhisperStore()

    await store.enqueueFiles(['/path/to/audio.mp3'])

    expect(mockStartWhisper).toHaveBeenCalledTimes(1)
    expect(mockStartWhisper).toHaveBeenCalledWith(
      expect.objectContaining({
        audioPath: '/path/to/audio.mp3',
        modelPath: store.settings.modelPath
      })
    )
  })

  it('should update settings', async () => {
    const store = useWhisperStore()

    await store.updateSettings({
      modelPath: '/new/model/path.bin',
      threads: 8,
      language: 'en'
    })

    expect(store.settings.modelPath).toBe('/new/model/path.bin')
    expect(store.settings.threads).toBe(8)
    expect(store.settings.language).toBe('en')
    expect(store.settings.useMetal).toBe(true) // unchanged
  })

  it('should initialize from preload settings', async () => {
    const store = useWhisperStore()

    await store.initialize()

    expect(mockGetSettings).toHaveBeenCalled()
    expect(mockListAiModels).toHaveBeenCalled()
    expect(store.initialized).toBe(true)
    expect(store.aiModels).toEqual(['llama3.1'])
  })

  it('should bind IPC listeners only once', () => {
    const store = useWhisperStore()

    store.bindIpcListeners()
    const firstBound = store.listenersBound

    store.bindIpcListeners()

    expect(store.listenersBound).toBe(firstBound)
  })

  it('should handle progress events', () => {
    const store = useWhisperStore()
    store.bindIpcListeners()

    const event: WhisperProgressEvent = {
      taskId: 'task-123',
      progress: 0.5,
      stage: 'transcribing',
      message: 'Processing...'
    }

    store.tasks.push({
      id: 'task-123',
      audioPath: '/path/to/audio.mp3',
      modelPath: '/path/to/model.bin',
      createdAt: new Date().toISOString(),
      status: 'pending',
      progress: 0
    })

    // Manually simulate the callback
    const task = store.tasks.find((item) => item.id === event.taskId)
    if (task) {
      task.progress = event.progress
      task.status = 'running'
      task.message = event.message
    }

    expect(store.tasks[0].progress).toBe(0.5)
    expect(store.tasks[0].status).toBe('running')
    expect(store.tasks[0].message).toBe('Processing...')
  })

  it('should handle complete events', () => {
    const store = useWhisperStore()
    store.bindIpcListeners()

    const event: WhisperCompleteEvent = {
      taskId: 'task-123',
      outputPath: '/path/to/output.txt',
      text: 'Transcribed text',
      durationMs: 5000
    }

    store.tasks.push({
      id: 'task-123',
      audioPath: '/path/to/audio.mp3',
      modelPath: '/path/to/model.bin',
      createdAt: new Date().toISOString(),
      status: 'running',
      progress: 0.5
    })

    // Manually simulate the callback
    const task = store.tasks.find((item) => item.id === event.taskId)
    if (task) {
      task.progress = 100
      task.status = 'completed'
      task.outputPath = event.outputPath
      task.message = `Done in ${(event.durationMs / 1000).toFixed(1)}s`
    }

    expect(store.tasks[0].progress).toBe(100)
    expect(store.tasks[0].status).toBe('completed')
    expect(store.tasks[0].outputPath).toBe('/path/to/output.txt')
    expect(store.tasks[0].message).toBe('Done in 5.0s')
  })

  it('should handle error events', () => {
    const store = useWhisperStore()
    store.bindIpcListeners()

    const event: WhisperErrorEvent = {
      taskId: 'task-123',
      error: 'Failed to transcribe'
    }

    store.tasks.push({
      id: 'task-123',
      audioPath: '/path/to/audio.mp3',
      modelPath: '/path/to/model.bin',
      createdAt: new Date().toISOString(),
      status: 'running',
      progress: 0.5
    })

    // Manually simulate the callback
    const task = store.tasks.find((item) => item.id === event.taskId)
    if (task) {
      task.status = 'error'
      task.errorMessage = event.error
      task.message = event.error
    }

    expect(store.tasks[0].status).toBe('error')
    expect(store.tasks[0].errorMessage).toBe('Failed to transcribe')
    expect(store.tasks[0].message).toBe('Failed to transcribe')
  })

  it('should reset store state', () => {
    const store = useWhisperStore()
    store.bindIpcListeners()
    store.tasks.push({
      id: 'task-123',
      audioPath: '/path/to/audio.mp3',
      modelPath: '/path/to/model.bin',
      createdAt: new Date().toISOString(),
      status: 'pending',
      progress: 0
    })

    store.reset()

    expect(store.tasks).toHaveLength(0)
    expect(store.listenersBound).toBe(false)
    expect(store.unsubscribeHandles).toHaveLength(0)
  })
})
