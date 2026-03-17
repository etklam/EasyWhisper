import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { SettingsManager } from '../SettingsManager'
import Store from 'electron-store'
import type { SettingsSchema, QueueSchema } from '@shared/settings.schema'

vi.mock('electron-store')

describe('SettingsManager', () => {
  let settingsManager: SettingsManager
  let mockSettingsStore: Store<SettingsSchema>
  let mockQueueStore: Store<QueueSchema>

  beforeEach(() => {
    mockSettingsStore = new Store<SettingsSchema>({
      name: 'settings',
      defaults: {
        locale: 'en',
        whisperModel: 'ggml-base.bin',
        whisperThreads: 4,
        outputDir: '',
        outputFormats: ['txt', 'srt'],
        maxTranscribeConcurrency: 1,
        maxAiConcurrency: 2,
        ytdlpAudioFormat: 'mp3',
        ai: {
          enabled: false,
          model: '',
          tasks: { correct: false, translate: false, summary: false },
          targetLang: 'en'
        }
      }
    })

    mockQueueStore = new Store<QueueSchema>({
      name: 'queue',
      defaults: { items: [] }
    })

    vi.mocked(Store).mockImplementation((options: any) => {
      if (options.name === 'settings') {
        return mockSettingsStore as any
      }
      return mockQueueStore as any
    })

    settingsManager = new SettingsManager()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Settings Store', () => {
    it('should initialize with default settings', () => {
      const settings = settingsManager.getSettings()

      expect(settings).toMatchObject({
        locale: 'en',
        whisperModel: 'ggml-base.bin',
        whisperThreads: 4,
        outputFormats: ['txt', 'srt']
      })
    })

    it('should get individual setting', () => {
      const whisperModel = settingsManager.getSetting('whisperModel')

      expect(whisperModel).toBe('ggml-base.bin')
    })

    it('should update individual setting', () => {
      settingsManager.setSetting('whisperModel', 'ggml-small.bin')

      const whisperModel = settingsManager.getSetting('whisperModel')
      expect(whisperModel).toBe('ggml-small.bin')
    })

    it('should update multiple settings', () => {
      settingsManager.updateSettings({
        whisperModel: 'ggml-small.bin',
        whisperThreads: 8,
        locale: 'zh-TW'
      })

      const settings = settingsManager.getSettings()
      expect(settings.whisperModel).toBe('ggml-small.bin')
      expect(settings.whisperThreads).toBe(8)
      expect(settings.locale).toBe('zh-TW')
    })

    it('should reset to default settings', () => {
      settingsManager.setSetting('whisperModel', 'ggml-small.bin')
      settingsManager.resetSettings()

      const settings = settingsManager.getSettings()
      expect(settings.whisperModel).toBe('ggml-base.bin')
    })

    it('should listen to settings changes', () => {
      const onChange = vi.fn()
      settingsManager.onSettingChange('whisperModel', onChange)

      settingsManager.setSetting('whisperModel', 'ggml-small.bin')

      expect(onChange).toHaveBeenCalledWith('ggml-small.bin')
    })

    it('should remove settings change listener', () => {
      const onChange = vi.fn()
      const unsubscribe = settingsManager.onSettingChange('whisperModel', onChange)

      unsubscribe()
      settingsManager.setSetting('whisperModel', 'ggml-small.bin')

      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('Queue Persistence', () => {
    it('should save queue item', () => {
      const queueItem = {
        id: 'task-123',
        source: 'file' as const,
        filePath: '/path/to/audio.mp3',
        status: 'pending' as const
      }

      settingsManager.saveQueueItem(queueItem)

      const items = settingsManager.getQueueItems()
      expect(items).toContainEqual(queueItem)
    })

    it('should save multiple queue items', () => {
      const queueItems = [
        {
          id: 'task-123',
          source: 'file' as const,
          filePath: '/path/to/audio1.mp3',
          status: 'pending' as const
        },
        {
          id: 'task-456',
          source: 'file' as const,
          filePath: '/path/to/audio2.mp3',
          status: 'pending' as const
        }
      ]

      settingsManager.saveQueueItems(queueItems)

      const items = settingsManager.getQueueItems()
      expect(items).toHaveLength(2)
    })

    it('should update queue item status', () => {
      const queueItem = {
        id: 'task-123',
        source: 'file' as const,
        filePath: '/path/to/audio.mp3',
        status: 'pending' as const
      }

      settingsManager.saveQueueItem(queueItem)
      settingsManager.updateQueueItemStatus('task-123', 'done')

      const items = settingsManager.getQueueItems()
      expect(items[0].status).toBe('done')
    })

    it('should remove queue item', () => {
      const queueItem = {
        id: 'task-123',
        source: 'file' as const,
        filePath: '/path/to/audio.mp3',
        status: 'pending' as const
      }

      settingsManager.saveQueueItem(queueItem)
      settingsManager.removeQueueItem('task-123')

      const items = settingsManager.getQueueItems()
      expect(items).not.toContainEqual(queueItem)
    })

    it('should clear queue', () => {
      const queueItems = [
        {
          id: 'task-123',
          source: 'file' as const,
          filePath: '/path/to/audio1.mp3',
          status: 'pending' as const
        },
        {
          id: 'task-456',
          source: 'file' as const,
          filePath: '/path/to/audio2.mp3',
          status: 'pending' as const
        }
      ]

      settingsManager.saveQueueItems(queueItems)
      settingsManager.clearQueue()

      const items = settingsManager.getQueueItems()
      expect(items).toHaveLength(0)
    })
  })

  describe('Queue Restoration', () => {
    it('should restore pending items on startup', () => {
      const queueItems = [
        {
          id: 'task-123',
          source: 'file' as const,
          filePath: '/path/to/audio1.mp3',
          status: 'pending' as const
        },
        {
          id: 'task-456',
          source: 'file' as const,
          filePath: '/path/to/audio2.mp3',
          status: 'pending' as const
        }
      ]

      settingsManager.saveQueueItems(queueItems)
      const restored = settingsManager.restoreQueue()

      expect(restored).toHaveLength(2)
      expect(restored[0].status).toBe('pending')
    })

    it('should restore completed items', () => {
      const queueItems = [
        {
          id: 'task-123',
          source: 'file' as const,
          filePath: '/path/to/audio.mp3',
          status: 'done' as const,
          outputPath: '/tmp/output.txt'
        }
      ]

      settingsManager.saveQueueItems(queueItems)
      const restored = settingsManager.restoreQueue()

      expect(restored[0]).toMatchObject({
        id: 'task-123',
        status: 'done',
        outputPath: '/tmp/output.txt'
      })
    })

    it('should restore error items', () => {
      const queueItems = [
        {
          id: 'task-123',
          source: 'file' as const,
          filePath: '/path/to/audio.mp3',
          status: 'error' as const,
          error: 'Transcription failed'
        }
      ]

      settingsManager.saveQueueItems(queueItems)
      const restored = settingsManager.restoreQueue()

      expect(restored[0]).toMatchObject({
        id: 'task-123',
        status: 'error',
        error: 'Transcription failed'
      })
    })

    it('should validate file existence on restore', () => {
      const queueItems = [
        {
          id: 'task-123',
          source: 'file' as const,
          filePath: '/path/to/nonexistent.mp3',
          status: 'pending' as const
        },
        {
          id: 'task-456',
          source: 'file' as const,
          filePath: '/path/to/existing.mp3',
          status: 'pending' as const
        }
      ]

      settingsManager.saveQueueItems(queueItems)

      // Mock file existence check
      vi.doMock('node:fs/promises', () => ({
        access: vi.fn((path: string) => {
          if (path.includes('nonexistent')) {
            return Promise.reject(new Error('Not found'))
          }
          return Promise.resolve(undefined)
        })
      }))

      const restored = settingsManager.restoreQueue()

      expect(restored[0].status).toBe('error')
      expect(restored[0].error).toMatch(/File not found/)
      expect(restored[1].status).toBe('pending')
    })

    it('should not restore transient status items', () => {
      const queueItems = [
        {
          id: 'task-123',
          source: 'file' as const,
          filePath: '/path/to/audio1.mp3',
          status: 'downloading' as const
        },
        {
          id: 'task-456',
          source: 'file' as const,
          filePath: '/path/to/audio2.mp3',
          status: 'transcribing' as const
        },
        {
          id: 'task-789',
          source: 'file' as const,
          filePath: '/path/to/audio3.mp3',
          status: 'pending' as const
        }
      ]

      settingsManager.saveQueueItems(queueItems)
      const restored = settingsManager.restoreQueue()

      // Only pending items should be restored
      expect(restored).toHaveLength(1)
      expect(restored[0].id).toBe('task-789')
    })
  })

  describe('Debounced Persistence', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should debounce writes', () => {
      const writeSpy = vi.spyOn(mockQueueStore as any, 'set')

      settingsManager.saveQueueItem({
        id: 'task-123',
        source: 'file' as const,
        filePath: '/path/to/audio.mp3',
        status: 'pending' as const
      })

      // Write immediately
      settingsManager.saveQueueItem({
        id: 'task-456',
        source: 'file' as const,
        filePath: '/path/to/audio2.mp3',
        status: 'pending' as const
      })

      // Should not have written yet
      expect(writeSpy).not.toHaveBeenCalled()

      // Wait for debounce
      vi.advanceTimersByTime(500)

      // Should have written once
      expect(writeSpy).toHaveBeenCalledTimes(1)
    })

    it('should write immediately after debounce timeout', () => {
      const writeSpy = vi.spyOn(mockQueueStore as any, 'set')

      settingsManager.saveQueueItem({
        id: 'task-123',
        source: 'file' as const,
        filePath: '/path/to/audio.mp3',
        status: 'pending' as const
      })

      vi.advanceTimersByTime(500)

      expect(writeSpy).toHaveBeenCalled()
    })
  })

  describe('Settings Validation', () => {
    it('should validate whisperThreads is positive', () => {
      expect(() => settingsManager.setSetting('whisperThreads', 0))
        .toThrow('whisperThreads must be positive')
    })

    it('should validate maxTranscribeConcurrency is positive', () => {
      expect(() => settingsManager.setSetting('maxTranscribeConcurrency', 0))
        .toThrow('maxTranscribeConcurrency must be positive')
    })

    it('should validate maxAiConcurrency is positive', () => {
      expect(() => settingsManager.setSetting('maxAiConcurrency', 0))
        .toThrow('maxAiConcurrency must be positive')
    })

    it('should validate outputFormats contains at least one format', () => {
      expect(() => settingsManager.updateSettings({ outputFormats: [] as any }))
        .toThrow('outputFormats must contain at least one format')
    })

    it('should validate outputFormats contains valid formats', () => {
      expect(() => settingsManager.updateSettings({ outputFormats: ['invalid'] as any }))
        .toThrow('Invalid output format: invalid')
    })

    it('should validate locale', () => {
      const validLocales = ['en', 'zh-TW', 'zh-CN']
      validLocales.forEach(locale => {
        expect(() => settingsManager.setSetting('locale', locale as any))
          .not.toThrow()
      })

      expect(() => settingsManager.setSetting('locale', 'invalid' as any))
        .toThrow('Invalid locale: invalid')
    })
  })

  describe('Export/Import Settings', () => {
    it('should export settings as JSON', () => {
      const exported = settingsManager.exportSettings()

      expect(exported).toHaveProperty('settings')
      expect(exported.settings).toHaveProperty('whisperModel')
      expect(exported.settings).toHaveProperty('whisperThreads')
    })

    it('should import settings from JSON', () => {
      const imported = {
        settings: {
          whisperModel: 'ggml-small.bin',
          whisperThreads: 8
        }
      }

      settingsManager.importSettings(imported)

      const settings = settingsManager.getSettings()
      expect(settings.whisperModel).toBe('ggml-small.bin')
      expect(settings.whisperThreads).toBe(8)
    })

    it('should throw error for invalid import format', () => {
      const invalid = { invalid: 'data' }

      expect(() => settingsManager.importSettings(invalid as any))
        .toThrow('Invalid settings format')
    })
  })
})
