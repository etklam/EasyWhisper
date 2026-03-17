import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'

import type { SettingsSchema, WhisperResult } from '@shared/settings.schema'
import { SUPPORTED_INPUT_FORMATS } from '../constants'

export type QueueSource = 'file' | 'ytdlp'
export type QueueStatus =
  | 'pending'
  | 'downloading'
  | 'converting'
  | 'transcribing'
  | 'ai'
  | 'done'
  | 'error'

export interface QueueItem {
  id: string
  source: QueueSource
  filePath?: string
  url?: string
  title?: string
  status: QueueStatus
  downloadProgress?: number
  transcribeProgress: number
  result?: WhisperResult
  error?: string
  outputPath?: string
}

export interface QueueStats {
  total: number
  pending: number
  downloading: number
  converting: number
  transcribing: number
  ai: number
  done: number
  error: number
}

export interface QueueOptions {
  maxTranscribeConcurrency?: number
  maxAiConcurrency?: number
}

export class BatchQueue extends EventEmitter {
  public readonly items: QueueItem[] = []

  private paused = false
  private running = false
  private readonly maxTranscribeConcurrency: number
  private readonly maxAiConcurrency: number
  private aiInFlight = 0
  private readonly aiQueue: Array<{
    item: QueueItem
    resolve: () => void
    reject: (error: unknown) => void
  }> = []
  private readonly aiTasks = new Set<Promise<void>>()
  private readonly cancelledIds = new Set<string>()

  constructor(settings: SettingsSchema, options: QueueOptions = {}) {
    super()
    this.maxTranscribeConcurrency = Math.max(
      1,
      options.maxTranscribeConcurrency ?? settings.maxTranscribeConcurrency ?? 1
    )
    this.maxAiConcurrency = Math.max(1, options.maxAiConcurrency ?? settings.maxAiConcurrency ?? 1)
    this.on('error', () => {
      // Keep Node EventEmitter from throwing when no explicit error listener is registered.
    })
  }

  addFiles(filePaths: string[]): void {
    for (const filePath of filePaths) {
      const extension = getFileExtension(filePath)
      if (!SUPPORTED_INPUT_FORMATS.includes(extension)) {
        throw new Error(`Unsupported file format: ${filePath}`)
      }
    }

    for (const filePath of filePaths) {
      this.items.push({
        id: randomUUID(),
        source: 'file',
        filePath,
        status: 'pending',
        transcribeProgress: 0
      })
    }
  }

  addUrls(urls: string[]): void {
    const parsed = urls
      .map((url) => url.trim())
      .filter((url) => url.length > 0 && !url.startsWith('#'))

    for (const url of parsed) {
      this.items.push({
        id: randomUUID(),
        source: 'ytdlp',
        url,
        status: 'pending',
        downloadProgress: 0,
        transcribeProgress: 0
      })
    }
  }

  async start(): Promise<void> {
    if (this.running) {
      return
    }

    this.running = true
    this.paused = false

    const workers = Array.from({ length: this.maxTranscribeConcurrency }, () => this.runTranscribeWorker())
    await Promise.all(workers)
    await Promise.all(Array.from(this.aiTasks))
    this.running = false
  }

  pause(): void {
    this.paused = true
  }

  cancel(id: string): void {
    const item = this.items.find((candidate) => candidate.id === id)
    if (!item) {
      return
    }

    this.cancelledIds.add(id)
    item.status = 'error'
    item.error = 'Cancelled'
    this.emit('error', { id, error: item.error })
  }

  async retry(id: string): Promise<void> {
    const item = this.items.find((candidate) => candidate.id === id)
    if (!item) {
      return
    }

    item.status = 'pending'
    item.error = undefined
    item.downloadProgress = item.source === 'ytdlp' ? 0 : undefined
    item.transcribeProgress = 0
    await this.processSingleItem(item, true)
  }

  updateProgress(id: string, type: 'download' | 'transcribe', progress: number): void {
    const item = this.items.find((candidate) => candidate.id === id)
    if (!item) {
      return
    }

    const clamped = Math.max(0, Math.min(100, progress))
    if (type === 'download') {
      item.downloadProgress = clamped
    } else {
      item.transcribeProgress = clamped
    }

    this.emit('progress', { id, type, progress: clamped })
  }

  getState(): QueueItem[] {
    return this.items.map((item) => ({ ...item }))
  }

  getStats(): QueueStats {
    const stats: QueueStats = {
      total: this.items.length,
      pending: 0,
      downloading: 0,
      converting: 0,
      transcribing: 0,
      ai: 0,
      done: 0,
      error: 0
    }

    for (const item of this.items) {
      stats[item.status] += 1
    }

    return stats
  }

  protected async processItem(_item: QueueItem): Promise<void> {
    await Promise.resolve()
  }

  protected async processAi(_item: QueueItem): Promise<void> {
    await Promise.resolve()
  }

  private async runTranscribeWorker(): Promise<void> {
    while (!this.paused) {
      const item = this.getNextPendingItem()
      if (!item) {
        return
      }

      await this.processSingleItem(item, false)
    }
  }

  private async processSingleItem(item: QueueItem, awaitAi: boolean): Promise<void> {
    if (this.cancelledIds.has(item.id)) {
      return
    }

    item.status = item.source === 'ytdlp' ? 'downloading' : 'transcribing'

    try {
      await this.processItem(item)

      if (this.cancelledIds.has(item.id)) {
        item.status = 'error'
        item.error = 'Cancelled'
        this.emit('error', { id: item.id, error: item.error })
        return
      }

      item.status = 'ai'
      const aiTask = this.enqueueAi(item)
      this.aiTasks.add(aiTask)
      aiTask.finally(() => this.aiTasks.delete(aiTask))
      if (awaitAi) {
        await aiTask
      }
    } catch (error) {
      item.status = 'error'
      item.error = toErrorMessage(error)
      this.emit('error', { id: item.id, error: item.error })
    }
  }

  private async enqueueAi(item: QueueItem): Promise<void> {
    return new Promise((resolve, reject) => {
      this.aiQueue.push({ item, resolve, reject })
      this.drainAiQueue()
    })
  }

  private drainAiQueue(): void {
    while (this.aiInFlight < this.maxAiConcurrency && this.aiQueue.length > 0) {
      const entry = this.aiQueue.shift()
      if (!entry) {
        return
      }

      this.aiInFlight += 1
      void this.processAi(entry.item)
        .then(() => {
          entry.item.status = 'done'
          this.emit('complete', { id: entry.item.id, item: entry.item })
          entry.resolve()
        })
        .catch((error) => {
          entry.item.status = 'error'
          entry.item.error = toErrorMessage(error)
          this.emit('error', { id: entry.item.id, error: entry.item.error })
          entry.reject(error)
        })
        .finally(() => {
          this.aiInFlight = Math.max(0, this.aiInFlight - 1)
          this.drainAiQueue()
        })
    }
  }

  private getNextPendingItem(): QueueItem | undefined {
    return this.items.find((item) => item.status === 'pending')
  }
}

function getFileExtension(filePath: string): string {
  const dotIndex = filePath.lastIndexOf('.')
  if (dotIndex < 0) {
    return ''
  }
  return filePath.slice(dotIndex + 1).toLowerCase()
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
