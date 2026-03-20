import { createWriteStream } from 'node:fs'
import { constants as fsConstants } from 'node:fs'
import { access, mkdir, rename, rm, stat } from 'node:fs/promises'
import { get } from 'node:https'
import path from 'node:path'

import type {
  WhisperModelDownloadProgressEvent,
  WhisperModelId,
  WhisperModelInfo
} from '@shared/index'
import { WHISPER_MODEL_IDS } from '@shared/index'

export interface WhisperRuntime {
  transcribe(options: WhisperTranscribeOptions): Promise<import('@shared/index').WhisperCompleteEvent>
  listModels(): Promise<WhisperModelInfo[]>
  downloadModel(
    modelId: WhisperModelId,
    onProgress?: (event: WhisperModelDownloadProgressEvent) => void
  ): Promise<string>
}

export type WhisperTranscribeOptions = import('@shared/index').WhisperStartPayload & {
  taskId: string
  onProgress: (event: import('@shared/index').WhisperProgressEvent) => void
}

export const MODEL_CATALOG: Record<WhisperModelId, { label: string }> = {
  'ggml-base.bin': { label: 'Base' },
  'ggml-small.bin': { label: 'Small' },
  'ggml-medium.bin': { label: 'Medium' },
  'ggml-large-v3.bin': { label: 'Large v3' }
}

export const SUPPORTED_WHISPER_MODELS = WHISPER_MODEL_IDS

export async function listWhisperModels(modelsDir: string): Promise<WhisperModelInfo[]> {
  await mkdir(modelsDir, { recursive: true })

  return Promise.all(
    SUPPORTED_WHISPER_MODELS.map(async (modelId) => {
      const modelPath = path.join(modelsDir, modelId)
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

export async function resolveModelPath(modelsDir: string, modelPathOrId: string): Promise<string> {
  const normalizedPath = path.resolve(modelPathOrId)

  try {
    await access(normalizedPath, fsConstants.R_OK)
    return normalizedPath
  } catch {
    const modelId = path.basename(modelPathOrId) as WhisperModelId
    if (!SUPPORTED_WHISPER_MODELS.includes(modelId)) {
      throw new Error(`Unsupported Whisper model: ${modelPathOrId}`)
    }

    return downloadWhisperModel(modelsDir, modelId)
  }
}

export async function downloadWhisperModel(
  modelsDir: string,
  modelId: WhisperModelId,
  onProgress?: (event: WhisperModelDownloadProgressEvent) => void
): Promise<string> {
  await mkdir(modelsDir, { recursive: true })

  const targetPath = path.join(modelsDir, modelId)
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

export function getModelDownloadUrl(modelId: WhisperModelId): string {
  return `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelId}?download=true`
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
