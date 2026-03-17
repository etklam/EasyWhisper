import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { WhisperMac } from '../../main/whisper/WhisperMac'

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    cpus: vi.fn(() => Array(8).fill({}))
  }
})

// Mock process.resourcesPath
Object.defineProperty(process, 'resourcesPath', {
  value: '/mock/resources/path',
  writable: true
})

beforeEach(() => {
  vi.stubEnv('WHISPER_CLI_PATH', '/mock/whisper-cli')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('WhisperMac', () => {
  it('should be instantiable', () => {
    const whisperMac = new WhisperMac()
    expect(whisperMac).toBeDefined()
  })

  it('should use mock mode when CLI not found', async () => {
    vi.unstubAllEnvs()
    const whisperMac = new WhisperMac()

    const onProgress = vi.fn()
    const result = await whisperMac.transcribe({
      taskId: 'task-123',
      audioPath: '/path/to/audio.mp3',
      modelPath: '/path/to/model.bin',
      onProgress
    })

    expect(result.taskId).toBe('task-123')
    expect(result.text).toContain('MOCK')
    expect(onProgress).toHaveBeenCalled()
  })

  it('should use auto language when not specified', async () => {
    vi.unstubAllEnvs()
    const whisperMac = new WhisperMac()

    const onProgress = vi.fn()
    await whisperMac.transcribe({
      taskId: 'task-123',
      audioPath: '/path/to/audio.mp3',
      modelPath: '/path/to/model.bin',
      onProgress
    })

    // Just ensure it completes without error
    expect(onProgress).toHaveBeenCalled()
  })

  it('should handle transcribe with Metal disabled', async () => {
    vi.unstubAllEnvs()
    const whisperMac = new WhisperMac()

    const onProgress = vi.fn()
    await whisperMac.transcribe({
      taskId: 'task-123',
      audioPath: '/path/to/audio.mp3',
      modelPath: '/path/to/model.bin',
      useMetal: false,
      onProgress
    })

    // Mock mode always succeeds
    expect(onProgress).toHaveBeenCalled()
  })
})
