import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  downloadAudioMock,
  cancelDownloadMock,
  convertToWavMock,
  listModelsMock,
  downloadModelMock,
  formatMock,
  getFileExtensionMock,
  getSettingsMock,
  updateSettingsMock,
  showItemInFolderMock
} = vi.hoisted(() => ({
  downloadAudioMock: vi.fn(),
  cancelDownloadMock: vi.fn(),
  convertToWavMock: vi.fn(),
  listModelsMock: vi.fn(),
  downloadModelMock: vi.fn(),
  formatMock: vi.fn(),
  getFileExtensionMock: vi.fn(),
  getSettingsMock: vi.fn(),
  updateSettingsMock: vi.fn(),
  showItemInFolderMock: vi.fn()
}))


vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return {
    ...actual,
    randomUUID: vi.fn(() => 'mock-uuid-123')
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((key: string) => {
      if (key === 'userData') return '/tmp/userData'
      if (key === 'documents') return '/tmp/Documents'
      return '/tmp'
    })
  },
  shell: {
    showItemInFolder: showItemInFolderMock
  },
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn()
  },
  BrowserWindow: vi.fn()
}))

vi.mock('../../main/ytdlp/YtDlpDownloader', () => ({
  YtDlpDownloader: vi.fn().mockImplementation(() => ({
    downloadAudio: downloadAudioMock,
    cancelDownload: cancelDownloadMock
  }))
}))

vi.mock('../../main/audio/AudioProcessor', () => ({
  AudioProcessor: vi.fn().mockImplementation(() => ({
    convertToWav: convertToWavMock
  }))
}))

vi.mock('../../main/whisper/WhisperMac', () => ({
  WhisperMac: vi.fn().mockImplementation(() => ({
    listModels: listModelsMock,
    downloadModel: downloadModelMock
  }))
}))

vi.mock('../../main/output/OutputFormatter', () => ({
  OutputFormatter: vi.fn().mockImplementation(() => ({
    format: formatMock,
    getFileExtension: getFileExtensionMock
  }))
}))

vi.mock('../../main/settings/SettingsManager', () => ({
  SettingsManager: vi.fn().mockImplementation(() => ({
    getSettings: getSettingsMock,
    updateSettings: updateSettingsMock
  }))
}))

import { BrowserWindow, app, ipcMain } from 'electron'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { registerAudioHandlers } from '../../main/ipc/audioHandlers'
import { registerModelHandlers } from '../../main/ipc/modelHandlers'
import { registerOutputHandlers } from '../../main/ipc/outputHandlers'
import { registerSettingsIpc } from '../../main/ipc/settings'
import { registerYtDlpHandlers } from '../../main/ipc/ytdlpHandlers'

describe('Core IPC handlers', () => {
  let mainWindow: BrowserWindow

  beforeEach(() => {
    vi.clearAllMocks()
    mainWindow = new BrowserWindow() as unknown as BrowserWindow
    mainWindow.webContents = {
      send: vi.fn()
    } as any
    getSettingsMock.mockReturnValue({
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
      ytdlpCookiesPath: undefined,
      ai: {
        enabled: true,
        model: 'llama3',
        tasks: {
          correct: true,
          translate: false,
          summary: true
        },
        targetLang: 'zh-TW',
        customPrompts: {
          summary: 'Summarize: {text}'
        }
      }
    })
  })

  it('registers and runs ytdlp handlers', async () => {
    downloadAudioMock.mockImplementation(async (_taskId, _url, options) => {
      options.onProgress?.(42)
      return '/tmp/audio.mp3'
    })
    cancelDownloadMock.mockReturnValue(true)

    registerYtDlpHandlers(mainWindow)

    const downloadHandler = getHandler('ytdlp:download')
    const cancelHandler = getHandler('ytdlp:cancel')
    const result = await downloadHandler({}, { url: 'https://youtube.com/watch?v=1', format: 'mp3' })

    expect(result).toEqual({ taskId: expect.any(String), accepted: true })
    await Promise.resolve()
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('ytdlp:progress', {
      taskId: result.taskId,
      progress: 42
    })
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('ytdlp:complete', {
      taskId: result.taskId,
      outputPath: '/tmp/audio.mp3'
    })

    await expect(cancelHandler({}, { taskId: result.taskId })).resolves.toEqual({
      taskId: result.taskId,
      cancelled: true
    })
  })

  it('registers and runs audio convert handler', async () => {
    convertToWavMock.mockImplementation(async (_inputPath, _outputPath, onProgress) => {
      onProgress?.({ percentage: 64, time: '00:00:12.00' })
      return '/tmp/audio.wav'
    })

    registerAudioHandlers(mainWindow)

    const handler = getHandler('audio:convert')
    const result = await handler({}, { inputPath: '/tmp/audio.mp3' })

    expect(result).toEqual({
      taskId: expect.any(String),
      outputPath: '/tmp/audio.wav'
    })
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('audio:progress', {
      taskId: result.taskId,
      progress: 64,
      time: '00:00:12.00'
    })
  })

  it('registers model handlers with app userData path', async () => {
    listModelsMock.mockResolvedValue([])

    registerModelHandlers(mainWindow)

    const listHandler = getHandler('model:list')
    await listHandler({}, undefined)

    expect(app.getPath).toHaveBeenCalledWith('userData')
  })

  it('registers folder-open IPC channels', () => {
    registerModelHandlers(mainWindow)
    registerSettingsIpc()

    expect(() => getHandler('model:open-folder')).not.toThrow()
    expect(() => getHandler('settings:open-output-folder')).not.toThrow()
  })

  it('opens model folder with success response', async () => {
    registerModelHandlers(mainWindow)

    const openModelFolderHandler = getHandler('model:open-folder')
    await expect(openModelFolderHandler({}, undefined)).resolves.toEqual({
      ok: true,
      path: '/tmp/userData/models'
    })

    expect(showItemInFolderMock).toHaveBeenCalledWith('/tmp/userData/models/.keep')
  })

  it('opens configured output folder when outputDir is set', async () => {
    getSettingsMock.mockReturnValueOnce({
      ...getSettingsMock.mock.results[0]?.value,
      outputDir: '/tmp/custom-output'
    })
    registerSettingsIpc()

    const openOutputFolderHandler = getHandler('settings:open-output-folder')
    await expect(openOutputFolderHandler({}, undefined)).resolves.toEqual({
      ok: true,
      path: '/tmp/custom-output'
    })

    expect(showItemInFolderMock).toHaveBeenCalledWith('/tmp/custom-output/.keep')
  })

  it('falls back to Documents/FOSSWhisper when outputDir is empty', async () => {
    getSettingsMock.mockReturnValueOnce({
      ...getSettingsMock.mock.results[0]?.value,
      outputDir: ''
    })
    registerSettingsIpc()

    const openOutputFolderHandler = getHandler('settings:open-output-folder')
    await expect(openOutputFolderHandler({}, undefined)).resolves.toEqual({
      ok: true,
      path: '/tmp/Documents/FOSSWhisper'
    })

    expect(app.getPath).toHaveBeenCalledWith('documents')
    expect(showItemInFolderMock).toHaveBeenCalledWith('/tmp/Documents/FOSSWhisper/.keep')
  })

  it('returns error response when opening folders fails', async () => {
    showItemInFolderMock.mockImplementationOnce(() => {
      throw new Error('open failed for model')
    })
    registerModelHandlers(mainWindow)

    const openModelFolderHandler = getHandler('model:open-folder')
    await expect(openModelFolderHandler({}, undefined)).resolves.toEqual({
      ok: false,
      error: 'open failed for model'
    })

    showItemInFolderMock.mockImplementationOnce(() => {
      throw new Error('open failed for output')
    })
    registerSettingsIpc()

    const openOutputFolderHandler = getHandler('settings:open-output-folder')
    await expect(openOutputFolderHandler({}, undefined)).resolves.toEqual({
      ok: false,
      error: 'open failed for output'
    })
  })

  it('registers and runs model handlers', async () => {
    listModelsMock.mockResolvedValue([
      {
        id: 'ggml-base.bin',
        label: 'Base',
        path: '/models/ggml-base.bin',
        downloadUrl: 'https://example.com/base.bin',
        downloaded: true
      }
    ])
    downloadModelMock.mockImplementation(async (_modelId, onProgress) => {
      onProgress?.({
        modelId: 'ggml-base.bin',
        progress: 100,
        receivedBytes: 100,
        totalBytes: 100
      })
      return '/models/ggml-base.bin'
    })

    registerModelHandlers(mainWindow)

    const listHandler = getHandler('model:list')
    const downloadHandler = getHandler('model:download')

    await expect(listHandler({}, undefined)).resolves.toHaveLength(1)
    await expect(downloadHandler({}, { modelId: 'ggml-base.bin' })).resolves.toEqual({
      modelId: 'ggml-base.bin',
      path: '/models/ggml-base.bin'
    })
    expect(mainWindow.webContents.send).toHaveBeenCalledWith('model:progress', {
      modelId: 'ggml-base.bin',
      progress: 100,
      receivedBytes: 100,
      totalBytes: 100
    })
  })


  it('registers and runs output handlers', async () => {
    formatMock.mockReturnValue('hello')
    getFileExtensionMock.mockReturnValue('.txt')
    await writeFile('/tmp/task.json', '{"text":"hello","segments":[]}', 'utf8')

    registerOutputHandlers()

    const formatHandler = getHandler('output:format')
    const formatsHandler = getHandler('output:getFormats')

    await expect(formatHandler({}, { outputPath: '/tmp/task.json', format: 'txt' })).resolves.toEqual({
      content: 'hello',
      extension: '.txt',
      outputPath: '/tmp/task.txt'
    })
    await expect(readFile('/tmp/task.txt', 'utf8')).resolves.toBe('hello')
    await expect(formatsHandler({}, undefined)).resolves.toEqual(['txt', 'srt', 'vtt', 'json'])
    await rm('/tmp/task.json', { force: true })
    await rm('/tmp/task.txt', { force: true })
  })
})

function getHandler(channel: string) {
  const record = vi.mocked(ipcMain.handle).mock.calls.find((entry) => entry[0] === channel)
  if (!record) {
    throw new Error(`Handler not found for channel: ${channel}`)
  }

  return record[1]
}
