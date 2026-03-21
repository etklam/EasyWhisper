import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { YtDlpDownloader, parseUrlList } from '../YtDlpDownloader'
import { spawn } from 'child_process'
import { access, mkdir, readFile, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

vi.mock('node:child_process')
vi.mock('node:fs/promises')
vi.mock('node:crypto')

describe('YtDlpDownloader', () => {
  let downloader: YtDlpDownloader
  let mockYtDlpPath: string
  let mockTmpDir: string

  beforeEach(() => {
    mockYtDlpPath = '/path/to/yt-dlp'
    mockTmpDir = '/tmp/ytdlp'
    downloader = new YtDlpDownloader(mockYtDlpPath, mockTmpDir)
    vi.clearAllMocks()

    vi.mocked(randomUUID).mockReturnValue('test-uuid-123')
    vi.mocked(mkdir).mockResolvedValue(undefined as never)
    vi.mocked(access).mockRejectedValue(new Error('missing'))
    vi.mocked(rename).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('URL List Parsing', () => {
    it('should parse multiple URLs from text', () => {
      const text = `https://youtube.com/watch?v=123
https://youtu.be/456
https://vimeo.com/789`

      const urls = parseUrlList(text)

      expect(urls).toHaveLength(3)
      expect(urls[0]).toBe('https://youtube.com/watch?v=123')
      expect(urls[1]).toBe('https://youtu.be/456')
      expect(urls[2]).toBe('https://vimeo.com/789')
    })

    it('should filter out empty lines', () => {
      const text = `https://youtube.com/watch?v=123

https://youtu.be/456`

      const urls = parseUrlList(text)

      expect(urls).toHaveLength(2)
    })

    it('should filter out comment lines', () => {
      const text = `https://youtube.com/watch?v=123
# This is a comment
https://youtu.be/456`

      const urls = parseUrlList(text)

      expect(urls).toHaveLength(2)
      expect(urls).not.toContain('# This is a comment')
    })

    it('should trim whitespace from URLs', () => {
      const text = '  https://youtube.com/watch?v=123  '

      const urls = parseUrlList(text)

      expect(urls[0]).toBe('https://youtube.com/watch?v=123')
    })

    it('should return empty array for invalid input', () => {
      const inputs = ['', '\n\n', '# Only comments', '   ']

      inputs.forEach(text => {
        const urls = parseUrlList(text)
        expect(urls).toHaveLength(0)
      })
    })
  })

  describe('Download Audio', () => {
    it('should download audio from YouTube URL', async () => {
      const url = 'https://youtube.com/watch?v=123'
      const outputPath = '/tmp/ytdlp/Video Title.mp3'
      const pathFile = path.join(mockTmpDir, `ytdlp-path-test-uuid-123.txt`)
      const titleFile = path.join(mockTmpDir, `ytdlp-title-test-uuid-123.txt`)

      vi.mocked(readFile)
        .mockResolvedValueOnce(outputPath)
        .mockResolvedValueOnce('Video Title')

      const mockSpawn = vi.mocked(spawn).mockReturnValue({
        stderr: { on: vi.fn() },
        stdout: {
          on: vi.fn((_event, handler) => {
            if (_event === 'data') {
              handler(Buffer.from('[download] 50.0% of 10.00MiB at 1.00MiB/s ETA 00:05\n'))
            }
          })
        },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(0)
          }
        })
      } as any)

      const onProgress = vi.fn()
      const result = await downloader.downloadAudio('task-123', url, { onProgress })

      expect(result).toBe(outputPath)
      expect(spawn).toHaveBeenCalledWith(
        mockYtDlpPath,
        expect.arrayContaining([
          url,
          '--extract-audio',
          '--audio-format', 'mp3',
          '--audio-quality', '0',
          '--no-playlist',
          '-o', expect.any(String),
          '--print-to-file', '%(title)s', titleFile,
          '--print-to-file', 'after_move:filepath', pathFile,
          '--newline'
        ])
      )

      expect(onProgress).toHaveBeenCalledWith(50.0)
      expect(rename).not.toHaveBeenCalled()
    })

    it('should use custom audio format', async () => {
      const url = 'https://youtube.com/watch?v=123'
      const outputPath = '/tmp/ytdlp/Video Title.wav'
      const pathFile = path.join(mockTmpDir, `ytdlp-path-test-uuid-123.txt`)

      vi.mocked(readFile)
        .mockResolvedValueOnce(outputPath)
        .mockResolvedValueOnce('Video Title')

      vi.mocked(spawn).mockReturnValue({
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(0)
          }
        })
      } as any)

      await downloader.downloadAudio('task-123', url, { format: 'wav' })

      expect(spawn).toHaveBeenCalledWith(
        mockYtDlpPath,
        expect.arrayContaining([
          '--audio-format', 'wav'
        ])
      )
    })

    it('should use custom cookies file', async () => {
      const url = 'https://youtube.com/watch?v=123'
      const cookiesPath = '/path/to/cookies.txt'

      vi.mocked(readFile)
        .mockResolvedValueOnce('/tmp/ytdlp/Video Title.mp3')
        .mockResolvedValueOnce('Video Title')

      vi.mocked(spawn).mockReturnValue({
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(0)
          }
        })
      } as any)

      await downloader.downloadAudio('task-123', url, { cookiesPath })

      expect(spawn).toHaveBeenCalledWith(
        mockYtDlpPath,
        expect.arrayContaining([
          '--cookies', cookiesPath
        ])
      )
    })

    it('should pass ffmpeg location as the containing directory', async () => {
      const url = 'https://youtube.com/watch?v=123'

      vi.mocked(readFile)
        .mockResolvedValueOnce('/tmp/ytdlp/Video Title.mp3')
        .mockResolvedValueOnce('Video Title')

      vi.mocked(spawn).mockReturnValue({
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(0)
          }
        })
      } as any)

      await downloader.downloadAudio('task-123', url, { ffmpegPath: '/opt/homebrew/bin/ffmpeg' })

      expect(spawn).toHaveBeenCalledWith(
        mockYtDlpPath,
        expect.arrayContaining([
          '--ffmpeg-location', '/opt/homebrew/bin'
        ])
      )
    })

    it('should pass discovered JS runtimes to yt-dlp', async () => {
      const url = 'https://youtube.com/watch?v=123'

      vi.mocked(readFile)
        .mockResolvedValueOnce('/tmp/ytdlp/Video Title.mp3')
        .mockResolvedValueOnce('Video Title')

      vi.mocked(spawn).mockReturnValue({
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(0)
          }
        })
      } as any)

      await downloader.downloadAudio('task-123', url, {
        jsRuntimes: ['node:/opt/homebrew/bin/node', 'bun:/opt/homebrew/bin/bun']
      })

      expect(spawn).toHaveBeenCalledWith(
        mockYtDlpPath,
        expect.arrayContaining([
          '--js-runtimes', 'node:/opt/homebrew/bin/node,bun:/opt/homebrew/bin/bun'
        ])
      )
    })

    it('should parse download progress from stdout', async () => {
      const url = 'https://youtube.com/watch?v=123'

      vi.mocked(readFile)
        .mockResolvedValueOnce('/tmp/ytdlp/Video Title.mp3')
        .mockResolvedValueOnce('Video Title')

      const progressUpdates: number[] = []
      const onProgress = vi.fn((progress) => progressUpdates.push(progress))

      vi.mocked(spawn).mockReturnValue({
        stderr: { on: vi.fn() },
        stdout: {
          on: vi.fn((_event, handler) => {
            if (_event === 'data') {
              handler(Buffer.from('[download] 25.0% of 10.00MiB\n'))
              handler(Buffer.from('[download] 50.0% of 10.00MiB\n'))
              handler(Buffer.from('[download] 75.0% of 10.00MiB\n'))
              handler(Buffer.from('[download] 100.0% of 10.00MiB\n'))
            }
          })
        },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(0)
          }
        })
      } as any)

      await downloader.downloadAudio('task-123', url, { onProgress })

      expect(onProgress).toHaveBeenCalledTimes(4)
      expect(progressUpdates).toEqual([25.0, 50.0, 75.0, 100.0])
    })

    it('should handle download errors', async () => {
      const url = 'https://youtube.com/watch?v=123'

      vi.mocked(spawn).mockReturnValue({
        stderr: {
          on: vi.fn((_event, handler) => {
            if (_event === 'data') {
              handler(Buffer.from('ERROR: Video unavailable\n'))
            }
          })
        },
        stdout: { on: vi.fn() },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(1)
          }
        })
      } as any)

      await expect(downloader.downloadAudio('task-123', url))
        .rejects.toThrow('yt-dlp exited with code 1')
    })

    it('should handle path file read errors', async () => {
      const url = 'https://youtube.com/watch?v=123'

      vi.mocked(spawn).mockReturnValue({
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(0)
          }
        })
      } as any)

      vi.mocked(readFile).mockRejectedValue(new Error('Read failed'))

      await expect(downloader.downloadAudio('task-123', url))
        .rejects.toMatchObject({
          code: 'YTDLP_PATH_READ_FAILED'
        })
    })

    it('should clean up temporary path file', async () => {
      const url = 'https://youtube.com/watch?v=123'
      const pathFile = path.join(mockTmpDir, `ytdlp-path-test-uuid-123.txt`)
      const titleFile = path.join(mockTmpDir, `ytdlp-title-test-uuid-123.txt`)

      vi.mocked(readFile)
        .mockResolvedValueOnce('/tmp/ytdlp/Video Title.mp3')
        .mockResolvedValueOnce('Video Title')

      vi.mocked(spawn).mockReturnValue({
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(0)
          }
        })
      } as any)

      await downloader.downloadAudio('task-123', url)

      expect(unlink).toHaveBeenCalledWith(pathFile)
      expect(unlink).toHaveBeenCalledWith(titleFile)
    })
  })

  describe('Progress Tracking', () => {
    it('should emit progress events', async () => {
      const url = 'https://youtube.com/watch?v=123'

      vi.mocked(readFile)
        .mockResolvedValueOnce('/tmp/ytdlp/Video Title.mp3')
        .mockResolvedValueOnce('Video Title')

      const onProgress = vi.fn()

      vi.mocked(spawn).mockReturnValue({
        stderr: { on: vi.fn() },
        stdout: {
          on: vi.fn((_event, handler) => {
            if (_event === 'data') {
              handler(Buffer.from('[download] 50.0% of 10.00MiB\n'))
            }
          })
        },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(0)
          }
        })
      } as any)

      await downloader.downloadAudio('task-123', url, { onProgress })

      expect(onProgress).toHaveBeenCalledWith(50.0)
    })

    it('should parse percentage from various formats', async () => {
      const url = 'https://youtube.com/watch?v=123'

      vi.mocked(readFile)
        .mockResolvedValueOnce('Video Title')
        .mockResolvedValueOnce('/tmp/ytdlp/Video Title.mp3')

      const progressUpdates: number[] = []
      const onProgress = vi.fn((p) => progressUpdates.push(p))

      vi.mocked(spawn).mockReturnValue({
        stderr: { on: vi.fn() },
        stdout: {
          on: vi.fn((_event, handler) => {
            if (_event === 'data') {
              handler(Buffer.from('[download] 10.5%\n'))
              handler(Buffer.from('[download] 99.9%\n'))
              handler(Buffer.from('[download] 100%\n'))
            }
          })
        },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(0)
          }
        })
      } as any)

      await downloader.downloadAudio('task-123', url, { onProgress })

      expect(progressUpdates).toEqual([10.5, 99.9, 100])
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid URLs gracefully', async () => {
      const url = 'not-a-valid-url'

      vi.mocked(spawn).mockReturnValue({
        stderr: {
          on: vi.fn((_event, handler) => {
            if (_event === 'data') {
              handler(Buffer.from('ERROR: Unsupported URL\n'))
            }
          })
        },
        stdout: { on: vi.fn() },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(1)
          }
        })
      } as any)

      await expect(downloader.downloadAudio('task-123', url))
        .rejects.toThrow('yt-dlp exited with code 1')
    })

    it('should handle network errors', async () => {
      const url = 'https://youtube.com/watch?v=123'

      vi.mocked(spawn).mockReturnValue({
        stderr: {
          on: vi.fn((_event, handler) => {
            if (_event === 'data') {
              handler(Buffer.from('ERROR: Unable to download video\n'))
            }
          })
        },
        stdout: { on: vi.fn() },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(1)
          }
        })
      } as any)

      await expect(downloader.downloadAudio('task-123', url))
        .rejects.toThrow()
    })
  })

  describe('Metadata Extraction', () => {
    it('should extract video title from yt-dlp output', async () => {
      const url = 'https://youtube.com/watch?v=123'

      vi.mocked(readFile)
        .mockResolvedValueOnce('/tmp/ytdlp/garbled.mp3')
        .mockResolvedValueOnce('My Video Title')

      vi.mocked(spawn).mockReturnValue({
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
        on: vi.fn((_event, handler) => {
          if (_event === 'close') {
            handler(0)
          }
        })
      } as any)

      const outputPath = await downloader.downloadAudio('task-123', url)

      const title = path.basename(outputPath, '.mp3')
      expect(title).toBe('My Video Title')
      expect(rename).toHaveBeenCalledWith('/tmp/ytdlp/garbled.mp3', '/tmp/ytdlp/My Video Title.mp3')
    })
  })
})
