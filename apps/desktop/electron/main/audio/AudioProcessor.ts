import { createHash } from 'node:crypto'
import { spawn } from 'child_process'
import { access, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'

import { SUPPORTED_AUDIO_FORMATS, SUPPORTED_VIDEO_FORMATS } from '../constants'
import { formatSrtTimecode, formatVttTimecode, getExtension } from '../utils'
import { createLineBuffer } from '../utils/lineBuffer'

export interface ConversionProgress {
  percentage: number
  time: string
}

export class AudioProcessor {
  constructor(
    private readonly ffmpegPath: string,
    private readonly cacheDir: string
  ) {}

  async convertToWav(
    inputPath: string,
    outputPath?: string,
    onProgress?: (progress: ConversionProgress) => void
  ): Promise<string> {
    const resolvedOutputPath = outputPath ?? path.join(this.cacheDir, `${this.getCacheKey(inputPath)}.wav`)

    if (inputPath === resolvedOutputPath && !this.needsConversion(inputPath)) {
      return resolvedOutputPath
    }

    try {
      await access(inputPath)
    } catch {
      try {
        await access(resolvedOutputPath)
        return resolvedOutputPath
      } catch {
        throw new Error(`Input file not found: ${inputPath}`)
      }
    }

    await mkdir(path.dirname(resolvedOutputPath), { recursive: true })

    return new Promise((resolve, reject) => {
      const args = ['-i', inputPath, '-ar', '16000', '-ac', '1', '-f', 'wav', resolvedOutputPath]
      const proc = spawn(this.ffmpegPath, args)
      let durationSeconds = 0

      const parseLine = createLineBuffer((line) => {
        const durationMatch = line.match(/Duration:\s+(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/)
        if (durationMatch) {
          durationSeconds = timeToSeconds(durationMatch[1])
        }

        const timeMatch = line.match(/time=(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/)
        if (timeMatch) {
          const currentSeconds = timeToSeconds(timeMatch[1])
          const percentage = durationSeconds > 0 ? (currentSeconds / durationSeconds) * 100 : 0
          onProgress?.({
            percentage: Math.max(0, Math.min(100, percentage)),
            time: timeMatch[1]
          })
        }
      })

      proc.stderr.on('data', (chunk: Buffer) => parseLine.push(chunk))
      proc.stderr.on('end', () => parseLine.flush())
      proc.on('error', reject)
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(resolvedOutputPath)
          return
        }
        reject(new Error(`ffmpeg exited with code ${code}`))
      })
    })
  }

  isAudioFile(filename: string): boolean {
    return (SUPPORTED_AUDIO_FORMATS as readonly string[]).includes(getExtension(filename))
  }

  isVideoFile(filename: string): boolean {
    return (SUPPORTED_VIDEO_FORMATS as readonly string[]).includes(getExtension(filename))
  }

  isSupportedFile(filename: string): boolean {
    return this.isAudioFile(filename) || this.isVideoFile(filename)
  }

  needsConversion(filename: string): boolean {
    return getExtension(filename) !== 'wav'
  }

  getCacheKey(inputPath: string): string {
    return createHash('sha1').update(inputPath).digest('hex')
  }

  async clearCache(): Promise<void> {
    try {
      const entries = await readdir(this.cacheDir)
      await Promise.all(entries.map((entry) => rm(path.join(this.cacheDir, entry), { force: true })))
    } catch {
      await rm(this.cacheDir, { recursive: true, force: true })
    }
  }

  async validateFile(filePath: string): Promise<boolean> {
    if (!this.isSupportedFile(filePath)) {
      return false
    }

    try {
      await access(filePath)
      return true
    } catch {
      return false
    }
  }
}

function timeToSeconds(raw: string): number {
  const [hours, minutes, seconds] = raw.split(':')
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
}
