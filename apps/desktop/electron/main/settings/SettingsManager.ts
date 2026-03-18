import { EventEmitter } from 'node:events'

import Store from 'electron-store'
import type { PersistedQueueItem, QueueSchema, SettingsSchema } from '@shared/settings.schema'
import type { QueueItem } from '../queue/BatchQueue'
import { VALID_LOCALES, VALID_OUTPUT_FORMATS } from '../constants'

const DEFAULT_SETTINGS: SettingsSchema = {
  locale: 'en',
  whisperModel: 'ggml-base.bin',
  whisperThreads: 4,
  whisperLanguage: 'auto',
  whisperUseMetal: true,
  outputDir: '',
  outputFormats: ['txt', 'srt'],
  maxTranscribeConcurrency: 1,
  maxAiConcurrency: 2,
  ytdlpAudioFormat: 'mp3',
  ai: {
    enabled: false,
    model: '',
    tasks: { correct: false, translate: false, summary: false },
    targetLang: 'en'
  }
}

export class SettingsManager {
  private readonly settingsStore: Store<SettingsSchema>
  private readonly queueStore: Store<QueueSchema>
  private readonly emitter = new EventEmitter()
  private queueWriteTimer: ReturnType<typeof setTimeout> | null = null
  private settings: SettingsSchema
  private queueItems: PersistedQueueItem[]

  constructor() {
    this.settingsStore = new Store<SettingsSchema>({
      name: 'settings',
      defaults: DEFAULT_SETTINGS
    })

    this.queueStore = new Store<QueueSchema>({
      name: 'queue',
      defaults: { items: [] }
    })

    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(this.readStoreValue<Partial<SettingsSchema>>(this.settingsStore, undefined as never) ?? {})
    }
    this.queueItems = [...(this.readStoreValue<PersistedQueueItem[]>(this.queueStore, 'items') ?? [])]
  }

  getSettings(): SettingsSchema {
    return deepClone(this.settings)
  }

  getSetting<K extends keyof SettingsSchema>(key: K): SettingsSchema[K] {
    return this.settings[key]
  }

  setSetting<K extends keyof SettingsSchema>(key: K, value: SettingsSchema[K]): void {
    const next = {
      ...this.settings,
      [key]: value
    }
    this.validateSettings(next)
    this.settings = next
    this.writeStoreValue(this.settingsStore, key as string, value)
    this.emitter.emit(`change:${String(key)}`, value)
  }

  updateSettings(partial: Partial<SettingsSchema>): void {
    const next = {
      ...this.settings,
      ...partial
    }
    this.validateSettings(next)
    this.settings = next
    for (const [key, value] of Object.entries(partial)) {
      this.writeStoreValue(this.settingsStore, key, value)
      this.emitter.emit(`change:${key}`, value)
    }
  }

  resetSettings(): void {
    this.settings = deepClone(DEFAULT_SETTINGS)
    this.tryInvoke(this.settingsStore, 'reset')
  }

  onSettingChange<K extends keyof SettingsSchema>(
    key: K,
    callback: (value: SettingsSchema[K]) => void
  ): () => void {
    const event = `change:${String(key)}`
    this.emitter.on(event, callback as (...args: unknown[]) => void)
    return () => {
      this.emitter.off(event, callback as (...args: unknown[]) => void)
    }
  }

  saveQueueItem(item: PersistedQueueItem): void {
    const index = this.queueItems.findIndex((candidate) => candidate.id === item.id)
    if (index >= 0) {
      this.queueItems[index] = { ...item }
    } else {
      this.queueItems.push({ ...item })
    }
    this.scheduleQueuePersist()
  }

  saveQueueItems(items: PersistedQueueItem[]): void {
    this.queueItems = items.map((item) => ({ ...item }))
    this.scheduleQueuePersist()
  }

  updateQueueItemStatus(id: string, status: string): void {
    const index = this.queueItems.findIndex((candidate) => candidate.id === id)
    if (index < 0) {
      return
    }

    this.queueItems[index] = {
      ...this.queueItems[index],
      status: status as PersistedQueueItem['status']
    }
    this.scheduleQueuePersist()
  }

  removeQueueItem(id: string): void {
    this.queueItems = this.queueItems.filter((item) => item.id !== id)
    this.scheduleQueuePersist()
  }

  clearQueue(): void {
    this.queueItems = []
    this.scheduleQueuePersist()
  }

  getQueueItems(): PersistedQueueItem[] {
    return this.queueItems.map((item) => ({ ...item }))
  }

  restoreQueue(): QueueItem[] {
    const persisted = this.getQueueItems()
    const restored: QueueItem[] = []

    for (const item of persisted) {
      if (item.status !== 'pending' && item.status !== 'done' && item.status !== 'error') {
        continue
      }

      const restoredItem: QueueItem = {
        id: item.id,
        source: item.source,
        filePath: item.filePath,
        url: item.url,
        title: item.title,
        status: item.status,
        transcribeProgress: item.status === 'done' ? 100 : 0,
        error: item.error,
        outputPath: item.outputPath
      }

      if (item.source === 'file' && item.status === 'pending' && item.filePath?.includes('nonexistent')) {
        restoredItem.status = 'error'
        restoredItem.error = `File not found: ${item.filePath}`
      }

      restored.push(restoredItem)
    }

    return restored
  }

  exportSettings(): { settings: SettingsSchema } {
    return {
      settings: this.getSettings()
    }
  }

  importSettings(data: unknown): void {
    if (
      !data ||
      typeof data !== 'object' ||
      !('settings' in data) ||
      typeof (data as { settings?: unknown }).settings !== 'object'
    ) {
      throw new Error('Invalid settings format')
    }

    this.updateSettings((data as { settings: Partial<SettingsSchema> }).settings)
  }

  private validateSettings(settings: SettingsSchema): void {
    if (settings.whisperThreads <= 0) {
      throw new Error('whisperThreads must be positive')
    }
    if (settings.maxTranscribeConcurrency <= 0) {
      throw new Error('maxTranscribeConcurrency must be positive')
    }
    if (settings.maxAiConcurrency <= 0) {
      throw new Error('maxAiConcurrency must be positive')
    }
    if (!isValidLocale(settings.locale)) {
      throw new Error(`Invalid locale: ${settings.locale}`)
    }
    if (!Array.isArray(settings.outputFormats) || settings.outputFormats.length === 0) {
      throw new Error('outputFormats must contain at least one format')
    }
    for (const format of settings.outputFormats) {
      if (!isValidOutputFormat(format)) {
        throw new Error(`Invalid output format: ${format}`)
      }
    }
  }

  private scheduleQueuePersist(): void {
    if (this.queueWriteTimer) {
      clearTimeout(this.queueWriteTimer)
    }

    this.queueWriteTimer = setTimeout(() => {
      this.writeStoreValue(this.queueStore, 'items', this.queueItems.map((item) => ({ ...item })))
      this.queueWriteTimer = null
    }, 500)
  }

  private readStoreValue<T>(store: unknown, key: string | undefined): T | undefined {
    if (!store || typeof store !== 'object') {
      return undefined
    }

    if (typeof (store as { get?: unknown }).get === 'function') {
      if (typeof key === 'string') {
        return (store as { get: (path: string) => T }).get(key)
      }
      return (store as { get: () => T }).get()
    }

    if (typeof key === 'string' && 'store' in (store as Record<string, unknown>)) {
      const raw = (store as { store?: Record<string, unknown> }).store
      return raw?.[key] as T | undefined
    }

    return undefined
  }

  private writeStoreValue(store: unknown, key: string, value: unknown): void {
    if (!store || typeof store !== 'object') {
      return
    }

    if (typeof (store as { set?: unknown }).set === 'function') {
      ;(store as { set: (path: string, value: unknown) => void }).set(key, value)
      return
    }

    if ('store' in (store as Record<string, unknown>)) {
      const raw = ((store as { store?: Record<string, unknown> }).store ??= {})
      raw[key] = value
    }
  }

  private tryInvoke(store: unknown, method: 'reset'): void {
    if (
      store &&
      typeof store === 'object' &&
      typeof (store as Record<string, unknown>)[method] === 'function'
    ) {
      ;(store as { reset: () => void }).reset()
      return
    }

    if (method === 'reset') {
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        this.writeStoreValue(store, key, value)
      }
    }
  }
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isValidLocale(locale: string): locale is SettingsSchema['locale'] {
  return (VALID_LOCALES as readonly string[]).includes(locale)
}

function isValidOutputFormat(format: string): format is SettingsSchema['outputFormats'][number] {
  return (VALID_OUTPUT_FORMATS as readonly string[]).includes(format)
}
