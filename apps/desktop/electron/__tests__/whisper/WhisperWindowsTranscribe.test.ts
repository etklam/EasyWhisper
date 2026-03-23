import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { resolveModelPathMock, listWhisperModelsMock, downloadWhisperModelMock, spawnMock } = vi.hoisted(() => ({
  resolveModelPathMock: vi.fn(),
  listWhisperModelsMock: vi.fn(),
  downloadWhisperModelMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
  default: {
    spawn: spawnMock
  }
}))

vi.mock('../../main/whisper/shared', () => ({
  resolveModelPath: resolveModelPathMock,
  listWhisperModels: listWhisperModelsMock,
  downloadWhisperModel: downloadWhisperModelMock
}))

import { WhisperWindows } from '../../main/whisper/WhisperWindows'

Object.defineProperty(process, 'resourcesPath', {
  value: '/mock/resources',
  writable: true
})

describe('WhisperWindows transcribe', () => {
  let tempRoot: string
  let cliPath: string
  let modelPath: string

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), 'easywhisper-whisper-win-'))
    cliPath = path.join(tempRoot, 'runtime', 'whisper-cli.exe')
    modelPath = path.join(tempRoot, 'models', 'ggml-base.bin')

    await mkdir(path.dirname(cliPath), { recursive: true })
    await mkdir(path.dirname(modelPath), { recursive: true })
    await writeFile(cliPath, 'cli', 'utf8')
    await writeFile(modelPath, 'model', 'utf8')

    resolveModelPathMock.mockReset()
    listWhisperModelsMock.mockReset()
    downloadWhisperModelMock.mockReset()
    spawnMock.mockReset()

    vi.stubEnv('WHISPER_WINDOWS_CLI_PATH', cliPath)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('rejects unsupported model ids before resolving model paths', async () => {
    const runtime = new WhisperWindows({ userDataDir: tempRoot })
    resolveModelPathMock.mockResolvedValue(path.join(tempRoot, 'models', 'ggml-large-v3.bin'))

    await expect(
      runtime.transcribe({
        taskId: 'task-unsupported',
        audioPath: 'C:\\audio\\sample.wav',
        modelPath: 'ggml-large-v3.bin',
        onProgress: vi.fn()
      })
    ).rejects.toThrow('Model ggml-large-v3.bin is not supported on Windows')

    expect(resolveModelPathMock).not.toHaveBeenCalled()
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('spawns whisper.cpp cli, parses stderr progress, and reads the output json', async () => {
    const runtime = new WhisperWindows({ userDataDir: tempRoot })
    const onProgress = vi.fn()
    resolveModelPathMock.mockResolvedValue(modelPath)

    spawnMock.mockImplementation((_command: string, args: string[]) => {
      const stderrHandlers: Record<string, Array<(chunk?: Buffer) => void>> = {
        data: [],
        end: []
      }

      return {
        stderr: {
          on: vi.fn((event: string, handler: (chunk?: Buffer) => void) => {
            stderrHandlers[event]?.push(handler)
          })
        },
        on: vi.fn((event: string, handler: (code?: number | Error) => void) => {
          if (event === 'error') {
            return
          }

          if (event === 'close') {
            queueMicrotask(async () => {
              stderrHandlers.data.forEach((listener) => {
                listener(Buffer.from('whisper_full: progress = 42%\r84%\r'))
              })
              stderrHandlers.end.forEach((listener) => listener())

              const outputPrefix = args[args.indexOf('-of') + 1]
              await writeFile(`${outputPrefix}.json`, JSON.stringify({ text: 'hello from windows' }), 'utf8')
              handler(0)
            })
          }
        })
      }
    })

    const result = await runtime.transcribe({
      taskId: 'task-123',
      audioPath: 'C:\\audio\\sample.wav',
      modelPath,
      language: 'ja',
      threads: 6,
      outputFileStem: 'Episode 01',
      onProgress
    })

    expect(spawnMock).toHaveBeenCalledWith(
      cliPath,
      [
        '-m',
        modelPath,
        '-f',
        'C:\\audio\\sample.wav',
        '-l',
        'ja',
        '--output-json',
        '-of',
        path.join(tempRoot, 'outputs', 'Episode 01'),
        '-t',
        '6'
      ],
      {
        stdio: ['ignore', 'ignore', 'pipe']
      }
    )

    expect(result.outputPath).toBe(path.join(tempRoot, 'outputs', 'Episode 01.json'))
    expect(result.text).toBe('hello from windows')
    expect(onProgress).toHaveBeenCalledWith({
      taskId: 'task-123',
      progress: 42,
      stage: 'transcribing',
      message: 'whisper_full: progress = 42%'
    })
    expect(onProgress).toHaveBeenCalledWith({
      taskId: 'task-123',
      progress: 84,
      stage: 'transcribing',
      message: '84%'
    })
    expect(onProgress).toHaveBeenCalledWith({
      taskId: 'task-123',
      progress: 100,
      stage: 'finalizing',
      message: 'Reading transcription result'
    })
  })
})
