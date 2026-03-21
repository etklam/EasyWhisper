import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock crypto before any imports
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return {
    ...actual,
    randomUUID: vi.fn(() => 'mock-uuid-123')
  }
})

import { ipcMain, BrowserWindow } from 'electron'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp')
  },
  ipcMain: {
    handle: vi.fn()
  },
  BrowserWindow: vi.fn()
}))

vi.mock('../../main/whisper/runtime', () => ({
  getWhisperRuntime: vi.fn().mockReturnValue({
    transcribe: vi.fn().mockResolvedValue({
      taskId: 'task-123',
      outputPath: '/path/to/output.json',
      text: 'Transcribed text',
      durationMs: 5000
    })
  })
}))

import { registerWhisperIpc } from '../../main/ipc/whisper'

describe('WhisperIPC', () => {
  let mainWindow: BrowserWindow

  beforeEach(() => {
    vi.clearAllMocks()
    mainWindow = new BrowserWindow() as unknown as BrowserWindow
    mainWindow.webContents = {
      send: vi.fn()
    } as any
  })

  it('should register WHISPER_START handler', () => {
    registerWhisperIpc(mainWindow)

    expect(ipcMain.handle).toHaveBeenCalledWith(
      'whisper:start',
      expect.any(Function)
    )
  })

  it('should accept whisper:start requests', async () => {
    registerWhisperIpc(mainWindow)

    const handleMock = vi.mocked(ipcMain.handle).mock.calls[0]
    const handler = handleMock[1]

    const payload = {
      audioPath: '/path/to/audio.mp3',
      modelPath: '/path/to/model.bin',
      language: 'en',
      threads: 4,
      outputFileStem: 'My Video Title'
    }

    const result = await handler({}, payload)

    expect(result.accepted).toBe(true)
    expect(result.taskId).toBeTruthy()
  })

  it('should use provided taskId if present', async () => {
    registerWhisperIpc(mainWindow)

    const handleMock = vi.mocked(ipcMain.handle).mock.calls[0]
    const handler = handleMock[1]

    const payload = {
      taskId: 'custom-task-id',
      audioPath: '/path/to/audio.mp3',
      modelPath: '/path/to/model.bin'
    }

    const result = await handler({}, payload)

    expect(result.taskId).toBe('custom-task-id')
  })
})
