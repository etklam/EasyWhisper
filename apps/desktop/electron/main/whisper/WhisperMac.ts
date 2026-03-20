import { constants as fsConstants } from 'node:fs'
import {
  access,
  mkdir,
  readFile,
  writeFile
} from 'node:fs/promises'
import path from 'node:path'
import { cpus, homedir } from 'node:os'
import { spawn } from 'node:child_process'

import type {
  WhisperCompleteEvent,
  WhisperProgressEvent,
} from '@shared/index'
import { createLineBuffer } from '../utils/lineBuffer'
import {
  downloadWhisperModel,
  listWhisperModels,
  resolveModelPath,
  SUPPORTED_WHISPER_MODELS,
  type WhisperRuntime,
  type WhisperTranscribeOptions
} from './shared'

interface WhisperMacOptions {
  projectRoot?: string
  modelsDir?: string
  whisperDir?: string
}

export class WhisperMac implements WhisperRuntime {
  private readonly projectRoot: string
  private readonly modelsDir: string
  private readonly whisperDir: string

  constructor(options: WhisperMacOptions = {}) {
    this.projectRoot = options.projectRoot ?? process.cwd()

    const resolvedProjectRoot = path.resolve(this.projectRoot)
    const isFilesystemRoot = resolvedProjectRoot === path.parse(resolvedProjectRoot).root
    const modelsBaseDir = isFilesystemRoot
      ? path.join(process.env.HOME ?? homedir(), '.fosswhisper')
      : this.projectRoot

    this.modelsDir = options.modelsDir ?? path.resolve(modelsBaseDir, 'models')
    this.whisperDir = options.whisperDir ?? path.resolve(this.projectRoot, 'whisper')

    if (process.env.FOSSWHISPER_DEBUG_PATHS === '1') {
      console.error('[fosswhisper:WhisperMac] constructor', {
        cwd: process.cwd(),
        projectRoot: this.projectRoot,
        resolvedProjectRoot,
        modelsDir: this.modelsDir,
        whisperDir: this.whisperDir
      })
    }
  }

  async transcribe(options: WhisperTranscribeOptions): Promise<WhisperCompleteEvent> {
    const startedAt = Date.now()
    const outputPath = await this.getOutputPath(options)
    const cliPath = await this.resolveWhisperCliPath()
    const modelPath = await resolveModelPath(this.modelsDir, options.modelPath)

    if (!cliPath) {
      if (isTestRuntime()) {
        return this.mockTranscribe(options, outputPath, startedAt)
      }

      throw new Error(
        `whisper-cli not found. Expected under ${path.resolve(this.whisperDir, 'build/main')} or set WHISPER_CLI_PATH`
      )
    }

    return new Promise((resolve, reject) => {
      const args = this.buildArgs(options, outputPath, modelPath)
      const proc = spawn(cliPath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      })
      const stderrLines: string[] = []

      options.onProgress({
        taskId: options.taskId,
        progress: 0,
        stage: 'preparing',
        message: 'Starting whisper.cpp'
      })

      const parseLine = createLineBuffer((line) => {
        stderrLines.push(line)
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
          const detail = stderrLines.slice(-5).join(' | ')
          reject(new Error(`whisper-cli exited with code ${code}${detail ? `: ${detail}` : ''}`))
          return
        }

        try {
          options.onProgress({
            taskId: options.taskId,
            progress: 100,
            stage: 'finalizing',
            message: 'Reading transcription result'
          })
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

  async listModels() {
    if (process.env.FOSSWHISPER_DEBUG_PATHS === '1') {
      console.error('[fosswhisper:WhisperMac] listModels', {
        modelsDir: this.modelsDir
      })
    }

    return listWhisperModels(this.modelsDir)
  }

  async downloadModel(
    modelId: Parameters<WhisperRuntime['downloadModel']>[0],
    onProgress?: Parameters<WhisperRuntime['downloadModel']>[1]
  ): Promise<string> {
    if (process.env.FOSSWHISPER_DEBUG_PATHS === '1') {
      console.error('[fosswhisper:WhisperMac] downloadModel:start', {
        cwd: process.cwd(),
        modelId,
        modelsDir: this.modelsDir,
        targetPath: path.join(this.modelsDir, modelId)
      })
    }

    return downloadWhisperModel(this.modelsDir, modelId, onProgress)
  }

  private async resolveWhisperCliPath(): Promise<string | null> {
    const candidates = [
      process.env.WHISPER_CLI_PATH,
      path.resolve(this.whisperDir, 'build/main/whisper-cli'),
      path.resolve(this.whisperDir, 'build/main/bin/whisper-cli'),
      path.resolve(this.whisperDir, 'build/bin/whisper-cli'),
      path.resolve(this.whisperDir, 'build/src/whisper-cli'),
      process.resourcesPath ? path.resolve(process.resourcesPath, 'whisper-cli') : undefined
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

  private buildArgs(options: WhisperTranscribeOptions, outputPath: string, modelPath: string): string[] {
    const outputWithoutExt = outputPath.replace(/\.json$/, '')
    const args = [
      '-m',
      modelPath,
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

  private async getOutputPath(options: WhisperTranscribeOptions): Promise<string> {
    const outputDir = options.outputDir ?? path.resolve(this.projectRoot, 'outputs')
    await mkdir(outputDir, { recursive: true })
    return path.join(outputDir, `${options.taskId}.json`)
  }

  private async readTranscriptionText(outputPath: string): Promise<string> {
    const raw = await readFile(outputPath, 'utf8')
    const json = JSON.parse(raw) as { text?: string }
    return json.text ?? ''
  }

  private async mockTranscribe(
    options: WhisperTranscribeOptions,
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
      await wait(isTestRuntime() ? 1 : 250)
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

function isTestRuntime(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
}
