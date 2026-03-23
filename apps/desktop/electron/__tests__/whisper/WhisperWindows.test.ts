import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  buildWhisperWindowsCliArgs,
  getWhisperWindowsCliCandidates,
  getWhisperWindowsRuntimeDirCandidates,
  parseWhisperCppProgressLine
} from '../../main/whisper/WhisperWindows'

Object.defineProperty(process, 'resourcesPath', {
  value: '/mock/resources',
  writable: true
})

describe('WhisperWindows', () => {
  it('parses percentage progress emitted by whisper.cpp stderr', () => {
    expect(
      parseWhisperCppProgressLine(
        'whisper_full: progress = 42.4%',
        'task-1'
      )
    ).toEqual({
      taskId: 'task-1',
      progress: 42,
      stage: 'transcribing',
      message: 'whisper_full: progress = 42.4%'
    })
  })

  it('ignores structured JSON stderr lines', () => {
    expect(
      parseWhisperCppProgressLine(
        '{"type":"progress","progress":87,"stage":"transcribing","message":"running"}',
        'task-2'
      )
    ).toBeNull()
  })

  it('still parses plain percentage output', () => {
    expect(parseWhisperCppProgressLine('progress: 87%', 'task-3')).toEqual({
      taskId: 'task-3',
      progress: 87,
      stage: 'transcribing',
      message: 'progress: 87%'
    })
  })

  it('ignores unrelated stderr output', () => {
    expect(parseWhisperCppProgressLine('initializing device', 'task-4')).toBeNull()
  })

  it('prefers packaged win resource directories when resolving runtime roots', () => {
    expect(getWhisperWindowsRuntimeDirCandidates('/tmp/userData/whisper-win')).toEqual([
      '/tmp/userData/whisper-win',
      path.join('/mock/resources', 'win'),
      path.join('/mock/resources', 'resources', 'win')
    ])
  })

  it('includes env override ahead of default cli paths', () => {
    vi.stubEnv('WHISPER_WINDOWS_CLI_PATH', 'C:\\custom\\whisper-cli.exe')

    expect(getWhisperWindowsCliCandidates('C:\\app\\userData\\whisper-win')).toEqual([
      'C:\\custom\\whisper-cli.exe',
      path.join('C:\\app\\userData\\whisper-win', 'whisper-cli.exe'),
      path.join('/mock/resources', 'win', 'whisper-cli.exe'),
      path.join('/mock/resources', 'resources', 'win', 'whisper-cli.exe')
    ])

    vi.unstubAllEnvs()
  })

  it('builds whisper.cpp cli arguments without const-me dll flags', () => {
    expect(
      buildWhisperWindowsCliArgs(
        {
          taskId: 'task-5',
          audioPath: 'C:\\audio\\sample.wav',
          modelPath: 'C:\\models\\ggml-base.bin',
          language: 'ja',
          threads: 6,
          onProgress: vi.fn()
        },
        'C:\\outputs\\sample.json',
        'C:\\models\\ggml-base.bin'
      )
    ).toEqual([
      '-m',
      'C:\\models\\ggml-base.bin',
      '-f',
      'C:\\audio\\sample.wav',
      '-l',
      'ja',
      '--output-json',
      '-of',
      'C:\\outputs\\sample',
      '-t',
      '6'
    ])
  })
})
