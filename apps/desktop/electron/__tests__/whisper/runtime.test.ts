import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getPathMock, whisperMacCtor, whisperWindowsCtor } = vi.hoisted(() => ({
  getPathMock: vi.fn(() => '/tmp/userData'),
  whisperMacCtor: vi.fn(),
  whisperWindowsCtor: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: getPathMock
  }
}))

vi.mock('../../main/whisper/WhisperMac', () => ({
  WhisperMac: whisperMacCtor.mockImplementation(() => ({ kind: 'mac' }))
}))

vi.mock('../../main/whisper/WhisperWindows', () => ({
  WhisperWindows: whisperWindowsCtor.mockImplementation(() => ({ kind: 'windows' }))
}))

describe('getWhisperRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('creates a mac runtime on non-Windows platforms', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' })
    const { getWhisperRuntime } = await import('../../main/whisper/runtime')

    expect(getWhisperRuntime()).toEqual({ kind: 'mac' })
    expect(whisperMacCtor).toHaveBeenCalledWith({
      projectRoot: '/tmp/userData',
      modelsDir: '/tmp/userData/models'
    })
  })

  it('creates a Windows runtime on win32', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    const { getWhisperRuntime } = await import('../../main/whisper/runtime')

    expect(getWhisperRuntime()).toEqual({ kind: 'windows' })
    expect(whisperWindowsCtor).toHaveBeenCalledWith({
      userDataDir: '/tmp/userData',
      modelsDir: '/tmp/userData/models'
    })
  })
})
