import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { AudioProcessor } from '../AudioProcessor'
import { spawn } from 'child_process'
import { access, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

vi.mock('node:child_process')
vi.mock('node:fs/promises')

describe('AudioProcessor', () => {
  let audioProcessor: AudioProcessor
  let mockFfmpegPath: string

  beforeEach(() => {
    mockFfmpegPath = '/path/to/ffmpeg'
    audioProcessor = new AudioProcessor(mockFfmpegPath, '/tmp/cache')
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Conversion to 16kHz WAV', () => {
    it('should convert mp3 to 16kHz mono WAV', async () => {
      const inputFile = '/path/to/audio.mp3'
      const outputFile = '/tmp/cache/audio-abc123.wav'

      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(mkdir).mockResolvedValue(undefined)

      const mockSpawn = vi.mocked(spawn).mockReturnValue({
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(0)
          }
        })
      } as any)

      const result = await audioProcessor.convertToWav(inputFile, outputFile)

      expect(result).toBe(outputFile)
      expect(mockSpawn).toHaveBeenCalledWith(
        mockFfmpegPath,
        [
          '-i', inputFile,
          '-ar', '16000',
          '-ac', '1',
          '-f', 'wav',
          outputFile
        ]
      )
    })

    it('should convert mp4 to 16kHz mono WAV', async () => {
      const inputFile = '/path/to/video.mp4'
      const outputFile = '/tmp/cache/video-abc123.wav'

      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(mkdir).mockResolvedValue(undefined)

      const mockSpawn = vi.mocked(spawn).mockReturnValue({
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(0)
          }
        })
      } as any)

      const result = await audioProcessor.convertToWav(inputFile, outputFile)

      expect(result).toBe(outputFile)
      expect(mockSpawn).toHaveBeenCalledWith(
        mockFfmpegPath,
        expect.arrayContaining([
          '-i', inputFile,
          '-ar', '16000',
          '-ac', '1',
          '-f', 'wav'
        ])
      )
    })

    it('should skip conversion if already WAV with correct specs', async () => {
      const inputFile = '/tmp/cache/audio-abc123.wav'

      vi.mocked(access).mockResolvedValue(undefined)

      // Mock file exists check returns true (already converted)
      vi.mocked(spawn).mockReturnValue({
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(0)
          }
        })
      } as any)

      const result = await audioProcessor.convertToWav(inputFile, inputFile)

      expect(result).toBe(inputFile)
      // Should not call spawn if already processed
      expect(spawn).not.toHaveBeenCalled()
    })

    it('should handle ffmpeg errors', async () => {
      const inputFile = '/path/to/audio.mp3'
      const outputFile = '/tmp/cache/audio-abc123.wav'

      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(mkdir).mockResolvedValue(undefined)

      vi.mocked(spawn).mockReturnValue({
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(1)
          }
        })
      } as any)

      await expect(audioProcessor.convertToWav(inputFile, outputFile))
        .rejects.toThrow('ffmpeg exited with code 1')
    })

    it('should use cached conversion result', async () => {
      const inputFile = '/path/to/audio.mp3'
      const outputFile = '/tmp/cache/audio-abc123.wav'

      vi.mocked(access).mockImplementation((filepath: string) => {
        if (filepath === outputFile) {
          return Promise.resolve(undefined)
        }
        return Promise.reject(new Error('Not found'))
      })

      const result = await audioProcessor.convertToWav(inputFile, outputFile)

      expect(result).toBe(outputFile)
      expect(spawn).not.toHaveBeenCalled()
    })
  })

  describe('Audio Format Detection', () => {
    it('should detect supported audio formats', () => {
      const supportedFormats = [
        'audio.mp3',
        'audio.wav',
        'audio.m4a',
        'audio.flac'
      ]

      supportedFormats.forEach(filename => {
        const isAudio = audioProcessor.isAudioFile(filename)
        expect(isAudio).toBe(true)
      })
    })

    it('should detect supported video formats', () => {
      const supportedFormats = [
        'video.mp4',
        'video.mov',
        'video.mkv',
        'video.avi'
      ]

      supportedFormats.forEach(filename => {
        const isVideo = audioProcessor.isVideoFile(filename)
        expect(isVideo).toBe(true)
      })
    })

    it('should detect unsupported formats', () => {
      const unsupportedFormats = [
        'document.pdf',
        'image.jpg',
        'archive.zip'
      ]

      unsupportedFormats.forEach(filename => {
        const isSupported = audioProcessor.isSupportedFile(filename)
        expect(isSupported).toBe(false)
      })
    })

    it('should determine if conversion is needed', () => {
      expect(audioProcessor.needsConversion('/path/to/audio.mp3')).toBe(true)
      expect(audioProcessor.needsConversion('/path/to/video.mp4')).toBe(true)
      expect(audioProcessor.needsConversion('/path/to/audio.wav')).toBe(false)
    })
  })

  describe('Progress Tracking', () => {
    it('should track conversion progress', async () => {
      const onProgress = vi.fn()
      const inputFile = '/path/to/audio.mp3'
      const outputFile = '/tmp/cache/audio-abc123.wav'

      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(mkdir).mockResolvedValue(undefined)

      const mockSpawn = vi.mocked(spawn).mockReturnValue({
        stderr: {
          on: vi.fn((_event, handler) => {
            if (_event === 'data') {
              handler(Buffer.from('Duration: 00:00:30.00, start: 0.000000, bitrate: 128 kb/s\n'))
              handler(Buffer.from('frame=  452 fps= 25 q=28.0 size=     500kB time=00:00:18.00 bitrate=  224.1kbits/s speed=1.0x\n'))
            }
          })
        },
        stdout: { on: vi.fn() },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(0)
          }
        })
      } as any)

      await audioProcessor.convertToWav(inputFile, outputFile, onProgress)

      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          percentage: expect.any(Number),
          time: expect.any(String)
        })
      )
    })
  })

  describe('Cache Management', () => {
    it('should generate consistent cache key for same input', () => {
      const inputFile = '/path/to/audio.mp3'
      const key1 = audioProcessor.getCacheKey(inputFile)
      const key2 = audioProcessor.getCacheKey(inputFile)

      expect(key1).toBe(key2)
    })

    it('should generate different cache keys for different inputs', () => {
      const key1 = audioProcessor.getCacheKey('/path/to/audio1.mp3')
      const key2 = audioProcessor.getCacheKey('/path/to/audio2.mp3')

      expect(key1).not.toBe(key2)
    })

    it('should clear cache directory', async () => {
      vi.mocked(rm).mockResolvedValue(undefined)

      await audioProcessor.clearCache()

      expect(rm).toHaveBeenCalled()
    })
  })

  describe('File Validation', () => {
    it('should validate existing audio file', async () => {
      const filePath = '/path/to/audio.mp3'

      vi.mocked(access).mockResolvedValue(undefined)

      const isValid = await audioProcessor.validateFile(filePath)

      expect(isValid).toBe(true)
    })

    it('should invalidate non-existent file', async () => {
      const filePath = '/path/to/nonexistent.mp3'

      vi.mocked(access).mockRejectedValue(new Error('File not found'))

      const isValid = await audioProcessor.validateFile(filePath)

      expect(isValid).toBe(false)
    })

    it('should validate supported format', async () => {
      const filePath = '/path/to/audio.mp3'

      vi.mocked(access).mockResolvedValue(undefined)

      const isValid = await audioProcessor.validateFile(filePath)

      expect(isValid).toBe(true)
    })
  })
})
