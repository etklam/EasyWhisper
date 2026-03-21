import { constants as fsConstants } from 'node:fs'
import { access, mkdir, readFile } from 'node:fs/promises'
import { cpus } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

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

interface WrapperProgressPayload {
  type?: string
  progress?: number
  stage?: WhisperProgressEvent['stage']
  message?: string
}

interface WhisperWindowsRuntimeFiles {
  cliPath: string
  dllPath?: string
  runtimeDir: string
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
    const outputPath = await this.getOutputPath(options)
    const runtimeFiles = await this.resolveRuntimeFiles()
    const modelPath = await resolveModelPath(this.modelsDir, options.modelPath)
    const modelId = path.basename(modelPath) as WhisperModelId

    if (!runtimeFiles) {
      throw new Error(
        'WhisperCLI.exe not found. Install the Windows const-me runtime under resources/win or set WHISPER_WINDOWS_CLI_PATH.'
      )
    }

    if ((WHISPER_WINDOWS_UNSUPPORTED_MODEL_IDS as readonly string[]).includes(modelId)) {
      throw new Error(`Model ${modelId} is not supported on Windows. Use ggml-large-v2.bin instead.`)
    }

    return new Promise((resolve, reject) => {
      const args = this.buildArgs(options, outputPath, modelPath, runtimeFiles)
      const proc = spawn(runtimeFiles.cliPath, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      })
      const stderrLines: string[] = []

      options.onProgress({
        taskId: options.taskId,
        progress: 0,
        stage: 'preparing',
        message: 'Starting Windows Whisper runtime'
      })

      const parseStdout = createLineBuffer((line) => {
        const progressEvent = parseWrapperProgressLine(line, options.taskId)
        if (progressEvent) {
          options.onProgress(progressEvent)
        }
      })
      const parseStderr = createLineBuffer((line) => {
        stderrLines.push(line)
        const progress = parsePercentProgress(line)
        if (progress === null) {
          return
        }
        options.onProgress({
          taskId: options.taskId,
          progress,
          stage: 'transcribing',
          message: line
        })
      })

      proc.stdout.on('data', (chunk: Buffer) => parseStdout.push(chunk))
      proc.stdout.on('end', () => parseStdout.flush())
      proc.stderr.on('data', (chunk: Buffer) => parseStderr.push(chunk))
      proc.stderr.on('end', () => parseStderr.flush())
      proc.on('error', reject)

      proc.on('close', async (code) => {
        if (code !== 0) {
          const detail = stderrLines.slice(-5).join(' | ')
          reject(new Error(`WhisperCLI.exe exited with code ${code}${detail ? `: ${detail}` : ''}`))
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

  private buildArgs(
    options: WhisperTranscribeOptions,
    outputPath: string,
    modelPath: string,
    runtimeFiles: WhisperWindowsRuntimeFiles
  ): string[] {
    const args = [
      '--model',
      modelPath,
      '--input',
      options.audioPath,
      '--output',
      outputPath,
      '--language',
      options.language ?? 'auto',
      '--threads',
      String(options.threads ?? Math.max(2, Math.floor(cpus().length / 2))),
      '--compute',
      'auto'
    ]

    if (runtimeFiles.dllPath) {
      args.push('--dll', runtimeFiles.dllPath)
    }

    return args
  }

  private async getOutputPath(options: WhisperTranscribeOptions): Promise<string> {
    const outputDir = options.outputDir ?? path.join(this.userDataDir, 'outputs')
    await mkdir(outputDir, { recursive: true })
    return path.join(outputDir, `${sanitizeOutputFileStem(options.outputFileStem ?? options.taskId)}.json`)
  }

  private async resolveRuntimeFiles(): Promise<WhisperWindowsRuntimeFiles | null> {
    for (const runtimeDir of getWhisperWindowsRuntimeDirCandidates(this.runtimeDir)) {
      const cliPath = process.env.WHISPER_WINDOWS_CLI_PATH ?? path.join(runtimeDir, 'WhisperCLI.exe')

      try {
        await access(cliPath, fsConstants.R_OK)
        const dllPath = await firstAccessiblePath(getWhisperWindowsDllCandidates(runtimeDir))
        return {
          cliPath,
          dllPath: dllPath ?? undefined,
          runtimeDir
        }
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

export function getWhisperWindowsDllCandidates(runtimeDir: string): string[] {
  return Array.from(new Set([
    process.env.WHISPER_WINDOWS_DLL_PATH,
    path.join(runtimeDir, 'whisper.dll'),
    path.join(runtimeDir, 'libwhisper.dll')
  ].filter((candidate): candidate is string => Boolean(candidate))))
}

export function parseWrapperProgressLine(
  line: string,
  taskId: string
): WhisperProgressEvent | null {
  try {
    const parsed = JSON.parse(line) as WrapperProgressPayload
    if (parsed.type !== 'progress' || typeof parsed.progress !== 'number') {
      return null
    }

    return {
      taskId,
      progress: Math.max(0, Math.min(100, Math.round(parsed.progress))),
      stage: parsed.stage ?? 'transcribing',
      message: parsed.message ?? line
    }
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

async function firstAccessiblePath(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.R_OK)
      return candidate
    } catch {
      continue
    }
  }

  return null
}
