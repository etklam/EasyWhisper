import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { access, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'

import { SUPPORTED_AUDIO_FORMATS, SUPPORTED_VIDEO_FORMATS } from '@shared/formats'
import { getExtension } from '../utils'
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

    if (!this.needsConversion(inputPath) && (outputPath === undefined || inputPath === resolvedOutputPath)) {
      return inputPath
    }

    if (inputPath === resolvedOutputPath) {
      throw new Error('Converted WAV output path must be different from input path')
    }

    try {
      await access(resolvedOutputPath)
      return resolvedOutputPath
    } catch {
      // Continue and produce the cached artifact.
    }

    try {
      await access(inputPath)
    } catch {
      throw new Error(`Input file not found: ${inputPath}`)
    }

    await mkdir(path.dirname(resolvedOutputPath), { recursive: true })

    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-i',
        inputPath,
        '-vn',
        '-acodec',
        'pcm_s16le',
        '-ar',
        '16000',
        '-ac',
        '1',
        '-f',
        'wav',
        resolvedOutputPath
      ]
      const proc = spawn(this.ffmpegPath, args)
      let durationSeconds = 0
      const stderrLines: string[] = []

      const parseLine = createLineBuffer((line) => {
        stderrLines.push(line)
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
          onProgress?.({
            percentage: 100,
            time: durationSeconds > 0 ? secondsToTime(durationSeconds) : '00:00:00.00'
          })
          resolve(resolvedOutputPath)
          return
        }
        const detail = stderrLines.slice(-3).join(' | ')
        reject(new Error(`ffmpeg exited with code ${code}${detail ? `: ${detail}` : ''}`))
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

function secondsToTime(value: number): string {
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const seconds = value % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${seconds
    .toFixed(2)
    .padStart(5, '0')}`
}
