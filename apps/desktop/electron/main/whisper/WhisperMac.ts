import { spawn } from 'node:child_process'
import { cpus } from 'node:os'
import path from 'node:path'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'

import type {
  WhisperCompleteEvent,
  WhisperProgressEvent,
  WhisperStartPayload
} from '@shared/index'
import { createLineBuffer } from '../utils/lineBuffer'

interface TranscribeOptions extends WhisperStartPayload {
  taskId: string
  onProgress: (event: WhisperProgressEvent) => void
}

export class WhisperMac {
  async transcribe(options: TranscribeOptions): Promise<WhisperCompleteEvent> {
    const startedAt = Date.now()
    const outputPath = await this.getOutputPath(options)
    const cliPath = await this.resolveWhisperCliPath()

    if (!cliPath) {
      return this.mockTranscribe(options, outputPath, startedAt)
    }

    return new Promise((resolve, reject) => {
      const args = this.buildArgs(options, outputPath)
      const proc = spawn(cliPath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      })

      const parseLine = createLineBuffer((line) => {
        const progress = parseWhisperProgress(line)
        if (progress !== null) {
          options.onProgress({
            taskId: options.taskId,
            progress,
            stage: 'transcribing',
            message: line
          })
        }
      })

      proc.stderr.on('data', (chunk: Buffer) => parseLine.push(chunk))
      proc.stderr.on('end', () => parseLine.flush())
      proc.on('error', reject)

      proc.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`whisper-cli exited with code ${code}`))
          return
        }

        try {
          const text = await this.readTranscriptionText(outputPath)
          resolve({
            taskId: options.taskId,
            outputPath,
            text,
            durationMs: Date.now() - startedAt
          })
        } catch (error) {
          reject(error)
        }
      })
    })
  }

  private async resolveWhisperCliPath(): Promise<string | null> {
    const candidates = [
      process.env.WHISPER_CLI_PATH,
      path.resolve(process.cwd(), 'whisper.cpp/build/bin/whisper-cli'),
      path.resolve(process.cwd(), 'third_party/whisper.cpp/build/bin/whisper-cli'),
      path.resolve(process.resourcesPath, 'whisper-cli')
    ].filter((candidate): candidate is string => Boolean(candidate))

    for (const candidate of candidates) {
      try {
        await access(candidate, fsConstants.X_OK)
        return candidate
      } catch {
        continue
      }
    }

    return null
  }

  private buildArgs(options: TranscribeOptions, outputPath: string): string[] {
    const outputWithoutExt = outputPath.replace(/\.json$/, '')
    const args = [
      '-m',
      options.modelPath,
      '-f',
      options.audioPath,
      '-l',
      options.language ?? 'auto',
      '--output-json',
      '-of',
      outputWithoutExt,
      '-t',
      String(options.threads ?? Math.max(2, Math.floor(cpus().length / 2)))
    ]

    if (options.useMetal === false) {
      args.push('-ng')
    }

    return args
  }

  private async getOutputPath(options: TranscribeOptions): Promise<string> {
    const outputDir = options.outputDir ?? path.resolve(process.cwd(), 'outputs')
    await mkdir(outputDir, { recursive: true })
    return path.join(outputDir, `${options.taskId}.json`)
  }

  private async readTranscriptionText(outputPath: string): Promise<string> {
    const raw = await readFile(outputPath, 'utf8')
    const json = JSON.parse(raw) as { text?: string }
    return json.text ?? ''
  }

  private async mockTranscribe(
    options: TranscribeOptions,
    outputPath: string,
    startedAt: number
  ): Promise<WhisperCompleteEvent> {
    options.onProgress({
      taskId: options.taskId,
      progress: 0,
      stage: 'preparing',
      message: 'whisper-cli not found, using mock mode'
    })

    for (let step = 1; step <= 10; step += 1) {
      await wait(250)
      options.onProgress({
        taskId: options.taskId,
        progress: step * 10,
        stage: step >= 10 ? 'finalizing' : 'transcribing',
        message: `mock progress ${step * 10}%`
      })
    }

    const mockPayload = {
      text: `[MOCK] Transcribed file: ${options.audioPath}`
    }
    await writeFile(outputPath, JSON.stringify(mockPayload, null, 2), 'utf8')

    return {
      taskId: options.taskId,
      outputPath,
      text: mockPayload.text,
      durationMs: Date.now() - startedAt
    }
  }
}

function parseWhisperProgress(line: string): number | null {
  const percentMatch = line.match(/(\d{1,3})(?:\.\d+)?%/)
  if (!percentMatch) {
    return null
  }

  const progress = Number(percentMatch[1])
  if (Number.isNaN(progress)) {
    return null
  }

  return Math.max(0, Math.min(100, progress))
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
