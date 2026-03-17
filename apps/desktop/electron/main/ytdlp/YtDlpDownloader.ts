import { spawn } from 'child_process'
import { randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import path from 'node:path'

import { YTDLP_AUDIO_FORMATS } from '../constants'
import { createLineBuffer } from '../utils/lineBuffer'

export interface DownloadOptions {
  format?: (typeof YTDLP_AUDIO_FORMATS)[number]
  cookiesPath?: string
  onProgress?: (progress: number) => void
}

interface YtDlpPathReadError {
  code: 'YTDLP_PATH_READ_FAILED'
  detail: string
}

export class YtDlpDownloader {
  constructor(
    private readonly ytDlpPath: string,
    private readonly tmpDir: string
  ) {}

  async downloadAudio(url: string, options: DownloadOptions = {}): Promise<string> {
    const format = options.format ?? 'mp3'
    const outputTemplate = path.join(this.tmpDir, '%(title)s.%(ext)s')
    const pathFile = path.join(this.tmpDir, `ytdlp-path-${randomUUID()}.txt`)
    const args = [
      url,
      '--extract-audio',
      '--audio-format',
      format,
      '--audio-quality',
      '0',
      '--no-playlist',
      '-o',
      outputTemplate,
      '--print-to-file',
      'after_move:filepath',
      pathFile,
      '--newline'
    ]

    if (options.cookiesPath) {
      args.push('--cookies', options.cookiesPath)
    }

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(this.ytDlpPath, args)
      let stderr = ''

      const parseLine = createLineBuffer((line) => {
        const match = line.match(/\[download\]\s+([\d.]+)%/)
        if (!match) {
          return
        }
        options.onProgress?.(Number.parseFloat(match[1]))
      })

      proc.stdout.on('data', (chunk: Buffer) => parseLine.push(chunk))
      proc.stdout.on('end', () => parseLine.flush())
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })
      proc.on('error', reject)
      proc.on('close', (code) => {
        if (code === 0) {
          resolve()
          return
        }

        const baseError = new Error(`yt-dlp exited with code ${code}`)
        if (stderr.trim().length > 0) {
          baseError.message = `${baseError.message}: ${stderr.trim()}`
        }
        reject(baseError)
      })
    })

    try {
      const outputPath = (await readFile(pathFile, 'utf8')).trim()
      return outputPath
    } catch (error) {
      throw {
        code: 'YTDLP_PATH_READ_FAILED',
        detail: String(error)
      } satisfies YtDlpPathReadError
    } finally {
      try {
        await unlink(pathFile)
      } catch {
        // noop
      }
    }
  }

  parseUrlList(raw: string): string[] {
    return parseUrlList(raw)
  }
}

export function parseUrlList(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}
