import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

let tempRoot: string
let modelPath: string

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), 'fosswhisper-whisper-'))
  modelPath = path.join(tempRoot, 'models', 'ggml-base.bin')
  await mkdir(path.dirname(modelPath), { recursive: true })
  await writeFile(modelPath, 'model', 'utf8')
  vi.stubEnv('WHISPER_CLI_PATH', '/mock/whisper-cli')
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('WhisperMac', () => {
  it('should be instantiable', () => {
    const whisperMac = new WhisperMac({ projectRoot: tempRoot })
    expect(whisperMac).toBeDefined()
  })

  it('should use mock mode when CLI not found', async () => {
    vi.unstubAllEnvs()
    const whisperMac = new WhisperMac({ projectRoot: tempRoot })

    const onProgress = vi.fn()
    const result = await whisperMac.transcribe({
      taskId: 'task-123',
      audioPath: '/path/to/audio.mp3',
      modelPath,
      onProgress
    })

    expect(result.taskId).toBe('task-123')
    expect(result.text).toContain('MOCK')
    expect(onProgress).toHaveBeenCalled()
  })

  it('should use auto language when not specified', async () => {
    vi.unstubAllEnvs()
    const whisperMac = new WhisperMac({ projectRoot: tempRoot })

    const onProgress = vi.fn()
    await whisperMac.transcribe({
      taskId: 'task-123',
      audioPath: '/path/to/audio.mp3',
      modelPath,
      onProgress
    })

    // Just ensure it completes without error
    expect(onProgress).toHaveBeenCalled()
  })

  it('uses the provided output file stem for result naming', async () => {
    vi.unstubAllEnvs()
    const whisperMac = new WhisperMac({ projectRoot: tempRoot })

    const result = await whisperMac.transcribe({
      taskId: 'task-123',
      audioPath: '/path/to/audio.mp3',
      modelPath,
      outputFileStem: 'Video Title',
      onProgress: vi.fn()
    })

    expect(result.outputPath).toBe(path.join(tempRoot, 'outputs', 'Video Title.json'))
  })

  it('should handle transcribe with Metal disabled', async () => {
    vi.unstubAllEnvs()
    const whisperMac = new WhisperMac({ projectRoot: tempRoot })

    const onProgress = vi.fn()
    await whisperMac.transcribe({
      taskId: 'task-123',
      audioPath: '/path/to/audio.mp3',
      modelPath,
      useMetal: false,
      onProgress
    })

    // Mock mode always succeeds
    expect(onProgress).toHaveBeenCalled()
  })

  it('reads text from whisper.cpp transcription arrays', async () => {
    vi.unstubAllEnvs()
    const whisperMac = new WhisperMac({ projectRoot: tempRoot })
    await mkdir(path.join(tempRoot, 'outputs'), { recursive: true })

    await writeFile(
      path.join(tempRoot, 'outputs', 'task-456.json'),
      JSON.stringify({
        transcription: [
          { text: 'Hello', offsets: { from: 0, to: 1000 } },
          { text: 'world', offsets: { from: 1000, to: 2000 } }
        ]
      }),
      'utf8'
    )

    const text = await (whisperMac as unknown as { readTranscriptionText: (outputPath: string) => Promise<string> })
      .readTranscriptionText(path.join(tempRoot, 'outputs', 'task-456.json'))

    expect(text).toBe('Hello world')
  })

  it('should list supported models from the managed models directory', async () => {
    const whisperMac = new WhisperMac({ projectRoot: tempRoot })

    const models = await whisperMac.listModels()

    expect(models).toHaveLength(5)
    expect(models.find((model) => model.id === 'ggml-base.bin')).toEqual(
      expect.objectContaining({
        downloaded: true,
        path: modelPath
      })
    )
    expect(models.find((model) => model.id === 'ggml-large-v2.bin')).toEqual(
      expect.objectContaining({
        downloaded: false
      })
    )
    expect(models.find((model) => model.id === 'ggml-small.bin')).toEqual(
      expect.objectContaining({
        downloaded: false
      })
    )
  })
})
