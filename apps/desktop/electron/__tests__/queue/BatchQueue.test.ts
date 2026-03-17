import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { BatchQueue, type QueueItem, type QueueOptions } from '../BatchQueue'
import type { SettingsSchema } from '@shared/settings.schema'

describe('BatchQueue', () => {
  let queue: BatchQueue
  let mockSettings: SettingsSchema

  beforeEach(() => {
    mockSettings = {
      locale: 'en',
      whisperModel: 'ggml-base.bin',
      whisperThreads: 4,
      outputDir: '/tmp/output',
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

    queue = new BatchQueue(mockSettings)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Queue Management', () => {
    it('should add files to queue', () => {
      const files = ['/path/to/audio1.mp3', '/path/to/audio2.wav']

      queue.addFiles(files)

      expect(queue.items).toHaveLength(2)
      expect(queue.items[0].source).toBe('file')
      expect(queue.items[0].filePath).toBe('/path/to/audio1.mp3')
      expect(queue.items[0].status).toBe('pending')
    })

    it('should generate unique IDs for queue items', () => {
      const files = ['/path/to/audio1.mp3', '/path/to/audio2.wav']

      queue.addFiles(files)

      expect(queue.items[0].id).not.toBe(queue.items[1].id)
      expect(queue.items[0].id).toMatch(/^[a-f0-9-]{36}$/)
    })

    it('should add URLs to queue', () => {
      const urls = ['https://youtube.com/watch?v=123', 'https://youtu.be/456']

      queue.addUrls(urls)

      expect(queue.items).toHaveLength(2)
      expect(queue.items[0].source).toBe('ytdlp')
      expect(queue.items[0].url).toBe('https://youtube.com/watch?v=123')
    })

    it('should ignore empty and comment lines in URL list', () => {
      const urls = [
        'https://youtube.com/watch?v=123',
        '',
        '# This is a comment',
        'https://youtu.be/456'
      ]

      queue.addUrls(urls)

      expect(queue.items).toHaveLength(2)
      expect(queue.items[0].url).toBe('https://youtube.com/watch?v=123')
      expect(queue.items[1].url).toBe('https://youtu.be/456')
    })

    it('should reject unsupported file formats', () => {
      const files = ['/path/to/unsupported.xyz', '/path/to/audio.mp3']

      expect(() => queue.addFiles(files)).toThrow('Unsupported file format')
    })

    it('should support all supported audio/video formats', () => {
      const supportedFormats = ['mp3', 'wav', 'm4a', 'mp4', 'mov', 'mkv']
      const files = supportedFormats.map(ext => `/path/to/audio.${ext}`)

      queue.addFiles(files)

      expect(queue.items).toHaveLength(supportedFormats.length)
    })
  })

  describe('Queue Execution', () => {
    it('should process queue sequentially with concurrency=1', async () => {
      const files = ['/path/to/audio1.mp3', '/path/to/audio2.wav']
      const processed: string[] = []

      vi.spyOn(queue as any, 'processItem').mockImplementation(async (item: QueueItem) => {
        processed.push(item.id)
        await new Promise(resolve => setTimeout(resolve, 100))
      })

      queue.addFiles(files)
      await queue.start()

      expect(processed).toHaveLength(2)
      expect(processed[0]).toBe(queue.items[0].id)
      expect(processed[1]).toBe(queue.items[1].id)
    })

    it('should update item status during processing', async () => {
      const files = ['/path/to/audio.mp3']

      vi.spyOn(queue as any, 'processItem').mockImplementation(async (item: QueueItem) => {
        expect(item.status).toBe('transcribing')
        await new Promise(resolve => setTimeout(resolve, 50))
      })

      queue.addFiles(files)
      await queue.start()

      expect(queue.items[0].status).toBe('done')
    })

    it('should stop processing when paused', async () => {
      const files = ['/path/to/audio1.mp3', '/path/to/audio2.wav']
      let processCount = 0

      vi.spyOn(queue as any, 'processItem').mockImplementation(async () => {
        processCount++
        await new Promise(resolve => setTimeout(resolve, 100))
      })

      queue.addFiles(files)
      const promise = queue.start()

      await new Promise(resolve => setTimeout(resolve, 50))
      queue.pause()

      await promise

      expect(processCount).toBe(1)
      expect(queue.items[0].status).toBe('done')
      expect(queue.items[1].status).toBe('pending')
    })

    it('should cancel item and update status', () => {
      const files = ['/path/to/audio1.mp3', '/path/to/audio2.wav']

      queue.addFiles(files)
      queue.cancel(queue.items[0].id)

      expect(queue.items[0].status).toBe('error')
      expect(queue.items[0].error).toBe('Cancelled')
    })

    it('should retry failed items', async () => {
      const files = ['/path/to/audio.mp3']
      let attemptCount = 0

      vi.spyOn(queue as any, 'processItem').mockImplementation(async (item: QueueItem) => {
        attemptCount++
        if (attemptCount === 1) {
          throw new Error('Temporary error')
        }
        await new Promise(resolve => setTimeout(resolve, 50))
      })

      queue.addFiles(files)

      try {
        await queue.start()
      } catch {
        // First attempt fails
      }

      expect(queue.items[0].status).toBe('error')
      expect(queue.items[0].error).toBe('Temporary error')

      await queue.retry(queue.items[0].id)

      expect(queue.items[0].status).toBe('done')
      expect(attemptCount).toBe(2)
    })
  })

  describe('Progress Tracking', () => {
    it('should track download progress for yt-dlp items', () => {
      const urls = ['https://youtube.com/watch?v=123']

      queue.addUrls(urls)
      queue.updateProgress(queue.items[0].id, 'download', 50)

      expect(queue.items[0].downloadProgress).toBe(50)
    })

    it('should track transcribe progress', () => {
      const files = ['/path/to/audio.mp3']

      queue.addFiles(files)
      queue.updateProgress(queue.items[0].id, 'transcribe', 75)

      expect(queue.items[0].transcribeProgress).toBe(75)
    })

    it('should emit progress events', () => {
      const onProgress = vi.fn()
      queue.on('progress', onProgress)

      const files = ['/path/to/audio.mp3']
      queue.addFiles(files)
      queue.updateProgress(queue.items[0].id, 'transcribe', 50)

      expect(onProgress).toHaveBeenCalledWith({
        id: queue.items[0].id,
        type: 'transcribe',
        progress: 50
      })
    })
  })

  describe('Concurrency Control', () => {
    it('should respect maxTranscribeConcurrency setting', async () => {
      mockSettings.maxTranscribeConcurrency = 2
      queue = new BatchQueue(mockSettings)

      const files = ['/path/to/audio1.mp3', '/path/to/audio2.wav', '/path/to/audio3.wav']
      let activeCount = 0
      let maxActiveCount = 0

      vi.spyOn(queue as any, 'processItem').mockImplementation(async () => {
        activeCount++
        maxActiveCount = Math.max(maxActiveCount, activeCount)
        await new Promise(resolve => setTimeout(resolve, 100))
        activeCount--
      })

      queue.addFiles(files)
      await queue.start()

      expect(maxActiveCount).toBe(2)
    })

    it('should respect maxAiConcurrency setting', async () => {
      mockSettings.maxAiConcurrency = 2
      queue = new BatchQueue(mockSettings)

      const files = ['/path/to/audio1.mp3', '/path/to/audio2.wav', '/path/to/audio3.wav']
      let activeAiCount = 0
      let maxActiveAiCount = 0

      vi.spyOn(queue as any, 'processAi').mockImplementation(async () => {
        activeAiCount++
        maxActiveAiCount = Math.max(maxActiveAiCount, activeAiCount)
        await new Promise(resolve => setTimeout(resolve, 100))
        activeAiCount--
      })

      queue.addFiles(files)
      await queue.start()

      expect(maxActiveAiCount).toBe(2)
    })
  })

  describe('Error Handling', () => {
    it('should handle transcribe errors gracefully', async () => {
      const files = ['/path/to/audio.mp3']

      vi.spyOn(queue as any, 'processItem').mockRejectedValue(new Error('Transcribe failed'))

      queue.addFiles(files)

      try {
        await queue.start()
      } catch {
        // Expected
      }

      expect(queue.items[0].status).toBe('error')
      expect(queue.items[0].error).toBe('Transcribe failed')
    })

    it('should emit error events', async () => {
      const onError = vi.fn()
      queue.on('error', onError)

      const files = ['/path/to/audio.mp3']

      vi.spyOn(queue as any, 'processItem').mockRejectedValue(new Error('Transcribe failed'))

      queue.addFiles(files)

      try {
        await queue.start()
      } catch {
        // Expected
      }

      expect(onError).toHaveBeenCalledWith({
        id: queue.items[0].id,
        error: 'Transcribe failed'
      })
    })

    it('should continue processing other items after error', async () => {
      const files = ['/path/to/audio1.mp3', '/path/to/audio2.wav']
      let callCount = 0

      vi.spyOn(queue as any, 'processItem').mockImplementation(async (item: QueueItem) => {
        callCount++
        if (item.id === queue.items[0].id) {
          throw new Error('Failed')
        }
        await new Promise(resolve => setTimeout(resolve, 50))
      })

      queue.addFiles(files)

      try {
        await queue.start()
      } catch {
        // Expected
      }

      expect(callCount).toBe(2)
      expect(queue.items[0].status).toBe('error')
      expect(queue.items[1].status).toBe('done')
    })
  })

  describe('Queue State', () => {
    it('should provide queue state', () => {
      const files = ['/path/to/audio1.mp3', '/path/to/audio2.wav']

      queue.addFiles(files)

      const state = queue.getState()

      expect(state).toHaveLength(2)
      expect(state[0]).toMatchObject({
        id: expect.any(String),
        source: 'file',
        filePath: '/path/to/audio1.mp3',
        status: 'pending'
      })
    })

    it('should get queue statistics', () => {
      const files = [
        '/path/to/audio1.mp3',
        '/path/to/audio2.wav',
        '/path/to/audio3.wav'
      ]

      queue.addFiles(files)
      queue.items[0].status = 'done'
      queue.items[1].status = 'error'

      const stats = queue.getStats()

      expect(stats.total).toBe(3)
      expect(stats.pending).toBe(1)
      expect(stats.done).toBe(1)
      expect(stats.error).toBe(1)
    })
  })
})
