import { createWriteStream } from 'node:fs'
import { constants as fsConstants } from 'node:fs'
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { get } from 'node:https'
import path from 'node:path'
import { cpus, homedir } from 'node:os'
import { spawn } from 'node:child_process'

import type {
  WhisperCompleteEvent,
  WhisperModelId,
  WhisperModelInfo,
  WhisperModelDownloadProgressEvent,
  WhisperProgressEvent,
  WhisperStartPayload
} from '@shared/index'
import { WHISPER_MODEL_IDS } from '@shared/index'
import { createLineBuffer } from '../utils/lineBuffer'

interface TranscribeOptions extends WhisperStartPayload {
  taskId: string
  onProgress: (event: WhisperProgressEvent) => void
}

interface WhisperMacOptions {
  projectRoot?: string
  modelsDir?: string
  whisperDir?: string
}

const MODEL_CATALOG: Record<WhisperModelId, { label: string }> = {
  'ggml-base.bin': { label: 'Base' },
  'ggml-small.bin': { label: 'Small' },
  'ggml-medium.bin': { label: 'Medium' },
  'ggml-large-v3.bin': { label: 'Large v3' }
}

export const SUPPORTED_WHISPER_MODELS = WHISPER_MODEL_IDS

export class WhisperMac {
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

  async transcribe(options: TranscribeOptions): Promise<WhisperCompleteEvent> {
    const startedAt = Date.now()
    const outputPath = await this.getOutputPath(options)
    const cliPath = await this.resolveWhisperCliPath()
    const modelPath = await this.resolveModelPath(options.modelPath)

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

  async listModels(): Promise<WhisperModelInfo[]> {
    if (process.env.FOSSWHISPER_DEBUG_PATHS === '1') {
      console.error('[fosswhisper:WhisperMac] listModels', {
        modelsDir: this.modelsDir
      })
    }

    await mkdir(this.modelsDir, { recursive: true })

    return Promise.all(
      SUPPORTED_WHISPER_MODELS.map(async (modelId) => {
        const modelPath = path.join(this.modelsDir, modelId)
        const metadata = MODEL_CATALOG[modelId]

        try {
          const fileStat = await stat(modelPath)
          return {
            id: modelId,
            label: metadata.label,
            path: modelPath,
            downloadUrl: getModelDownloadUrl(modelId),
            sizeBytes: fileStat.size,
            downloaded: true
          }
        } catch {
          return {
            id: modelId,
            label: metadata.label,
            path: modelPath,
            downloadUrl: getModelDownloadUrl(modelId),
            downloaded: false
          }
        }
      })
    )
  }

  async downloadModel(
    modelId: WhisperModelId,
    onProgress?: (event: WhisperModelDownloadProgressEvent) => void
  ): Promise<string> {
    if (process.env.FOSSWHISPER_DEBUG_PATHS === '1') {
      console.error('[fosswhisper:WhisperMac] downloadModel:start', {
        cwd: process.cwd(),
        modelId,
        modelsDir: this.modelsDir,
        targetPath: path.join(this.modelsDir, modelId)
      })
    }

    await mkdir(this.modelsDir, { recursive: true })

    const targetPath = path.join(this.modelsDir, modelId)
    try {
      await access(targetPath, fsConstants.R_OK)
      return targetPath
    } catch {
      return downloadFile(getModelDownloadUrl(modelId), targetPath, (receivedBytes, totalBytes) => {
        const progress = totalBytes ? Math.round((receivedBytes / totalBytes) * 100) : 0
        onProgress?.({
          modelId,
          progress: Math.max(0, Math.min(100, progress)),
          receivedBytes,
          totalBytes
        })
      })
    }
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

  private async resolveModelPath(modelPathOrId: string): Promise<string> {
    const normalizedPath = path.resolve(modelPathOrId)

    try {
      await access(normalizedPath, fsConstants.R_OK)
      return normalizedPath
    } catch {
      const modelId = path.basename(modelPathOrId) as WhisperModelId
      if (!SUPPORTED_WHISPER_MODELS.includes(modelId)) {
        throw new Error(`Unsupported Whisper model: ${modelPathOrId}`)
      }

      return this.downloadModel(modelId)
    }
  }

  private buildArgs(options: TranscribeOptions, outputPath: string, modelPath: string): string[] {
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

  private async getOutputPath(options: TranscribeOptions): Promise<string> {
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

function getModelDownloadUrl(modelId: WhisperModelId): string {
  return `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelId}?download=true`
}

function isTestRuntime(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
}

function downloadFile(
  url: string,
  destinationPath: string,
  onProgress?: (receivedBytes: number, totalBytes?: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const tempPath = `${destinationPath}.download`

    const fail = async (error: Error) => {
      await rm(tempPath, { force: true }).catch(() => undefined)
      reject(error)
    }

    const request = (currentUrl: string) => {
      const req = get(currentUrl, (response) => {
        const statusCode = response.statusCode ?? 0

        if ([301, 302, 307, 308].includes(statusCode) && response.headers.location) {
          response.resume()
          request(response.headers.location.startsWith('http')
            ? response.headers.location
            : new URL(response.headers.location, currentUrl).toString())
          return
        }

        if (statusCode !== 200) {
          response.resume()
          void fail(new Error(`Model download failed with status ${statusCode}`))
          return
        }

        const totalBytesHeader = response.headers['content-length']
        const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : undefined
        let receivedBytes = 0
        const output = createWriteStream(tempPath)

        response.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length
          onProgress?.(receivedBytes, totalBytes)
        })

        output.on('error', (error) => {
          void fail(error)
        })

        response.on('error', (error) => {
          void fail(error)
        })

        output.on('finish', async () => {
          output.close()
          try {
            await rename(tempPath, destinationPath)
            resolve(destinationPath)
          } catch (error) {
            void fail(error as Error)
          }
        })

        response.pipe(output)
      })

      req.on('error', (error) => {
        void fail(error)
      })
    }

    request(url)
  })
}
