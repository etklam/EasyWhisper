import { constants as fsConstants } from 'node:fs'
import { access, mkdir, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { cpus } from 'node:os'
import path from 'node:path'

import type {
  WhisperCompleteEvent,
  WhisperModelDownloadProgressEvent,
  WhisperModelId,
  WhisperModelInfo,
  WhisperProgressEvent
} from '@shared/index'
import { WHISPER_WINDOWS_UNSUPPORTED_MODEL_IDS } from '@shared/index'
import { createLineBuffer } from '../utils/lineBuffer'
import {
  downloadWhisperModel,
  listWhisperModels,
  resolveModelPath,
  type WhisperRuntime,
  type WhisperTranscribeOptions
} from './shared'

interface WhisperWindowsOptions {
  userDataDir: string
  modelsDir?: string
  runtimeDir?: string
}

export class WhisperWindows implements WhisperRuntime {
  private readonly userDataDir: string
  private readonly modelsDir: string
  private readonly runtimeDir: string

  constructor(options: WhisperWindowsOptions) {
    this.userDataDir = options.userDataDir
    this.modelsDir = options.modelsDir ?? path.join(this.userDataDir, 'models')
    this.runtimeDir = options.runtimeDir ?? path.join(this.userDataDir, 'whisper-win')
  }

  async transcribe(options: WhisperTranscribeOptions): Promise<WhisperCompleteEvent> {
    const startedAt = Date.now()
    const requestedModelId = path.basename(options.modelPath) as WhisperModelId

    if ((WHISPER_WINDOWS_UNSUPPORTED_MODEL_IDS as readonly string[]).includes(requestedModelId)) {
      throw new Error(`Model ${requestedModelId} is not supported on Windows. Use ggml-large-v2.bin instead.`)
    }

    const outputPath = await this.getOutputPath(options)
    const cliPath = await this.resolveCliPath()
    const modelPath = await resolveModelPath(this.modelsDir, options.modelPath)
    const modelId = path.basename(modelPath) as WhisperModelId

    if (!cliPath) {
      throw new Error(
        'whisper-cli.exe not found. Install the Windows whisper.cpp runtime under resources/win or set WHISPER_WINDOWS_CLI_PATH.'
      )
    }

    if ((WHISPER_WINDOWS_UNSUPPORTED_MODEL_IDS as readonly string[]).includes(modelId)) {
      throw new Error(`Model ${modelId} is not supported on Windows. Use ggml-large-v2.bin instead.`)
    }

    return new Promise((resolve, reject) => {
      const args = buildWhisperWindowsCliArgs(options, outputPath, modelPath)
      const proc = spawn(cliPath, args, {
        stdio: ['ignore', 'ignore', 'pipe']
      })
      const stderrLines: string[] = []

      options.onProgress({
        taskId: options.taskId,
        progress: 0,
        stage: 'preparing',
        message: 'Starting whisper.cpp'
      })

      const parseStderr = createLineBuffer((line) => {
        stderrLines.push(line)
        const progressEvent = parseWhisperCppProgressLine(line, options.taskId)
        if (progressEvent) {
          options.onProgress(progressEvent)
        }
      })

      proc.stderr.on('data', (chunk: Buffer) => parseStderr.push(chunk))
      proc.stderr.on('end', () => parseStderr.flush())
      proc.on('error', reject)

      proc.on('close', async (code) => {
        if (code !== 0) {
          const detail = stderrLines.slice(-5).join(' | ')
          reject(new Error(`whisper-cli.exe exited with code ${code}${detail ? `: ${detail}` : ''}`))
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

  async listModels(): Promise<WhisperModelInfo[]> {
    return listWhisperModels(this.modelsDir)
  }

  async downloadModel(
    modelId: WhisperModelId,
    onProgress?: (event: WhisperModelDownloadProgressEvent) => void
  ): Promise<string> {
    return downloadWhisperModel(this.modelsDir, modelId, onProgress)
  }

  private async getOutputPath(options: WhisperTranscribeOptions): Promise<string> {
    const outputDir = options.outputDir ?? path.join(this.userDataDir, 'outputs')
    await mkdir(outputDir, { recursive: true })
    return path.join(outputDir, `${sanitizeOutputFileStem(options.outputFileStem ?? options.taskId)}.json`)
  }

  private async resolveCliPath(): Promise<string | null> {
    for (const cliPath of getWhisperWindowsCliCandidates(this.runtimeDir)) {
      try {
        await access(cliPath, fsConstants.R_OK)
        return cliPath
      } catch {
        continue
      }
    }

    return null
  }

  private async readTranscriptionText(outputPath: string): Promise<string> {
    const raw = await readFile(outputPath, 'utf8')
    const json = JSON.parse(raw) as {
      text?: string
      transcription?: Array<{ text?: string }>
    }

    if (typeof json.text === 'string' && json.text.trim().length > 0) {
      return json.text
    }

    if (Array.isArray(json.transcription)) {
      return json.transcription
        .map((segment) => (typeof segment.text === 'string' ? segment.text.trim() : ''))
        .filter((text) => text.length > 0)
        .join(' ')
    }

    return ''
  }
}

export function getWhisperWindowsRuntimeDirCandidates(runtimeDir: string): string[] {
  const candidates = [
    runtimeDir,
    process.resourcesPath ? path.join(process.resourcesPath, 'win') : undefined,
    process.resourcesPath ? path.join(process.resourcesPath, 'resources', 'win') : undefined
  ].filter((candidate): candidate is string => Boolean(candidate))

  return Array.from(new Set(candidates))
}

export function getWhisperWindowsCliCandidates(runtimeDir: string): string[] {
  return Array.from(new Set([
    process.env.WHISPER_WINDOWS_CLI_PATH,
    ...getWhisperWindowsRuntimeDirCandidates(runtimeDir).map((candidate) =>
      path.join(candidate, 'whisper-cli.exe')
    )
  ].filter((candidate): candidate is string => Boolean(candidate))))
}

export function buildWhisperWindowsCliArgs(
  options: WhisperTranscribeOptions,
  outputPath: string,
  modelPath: string
): string[] {
  const outputWithoutExt = outputPath.replace(/\.json$/, '')

  return [
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
}

export function parseWhisperCppProgressLine(
  line: string,
  taskId: string
): WhisperProgressEvent | null {
  try {
    JSON.parse(line)
    return null
  } catch {
    const progress = parsePercentProgress(line)
    if (progress === null) {
      return null
    }

    return {
      taskId,
      progress,
      stage: 'transcribing',
      message: line
    }
  }
}

function sanitizeOutputFileStem(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .trim()

  return sanitized.length > 0 ? sanitized : 'output'
}

function parsePercentProgress(line: string): number | null {
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
