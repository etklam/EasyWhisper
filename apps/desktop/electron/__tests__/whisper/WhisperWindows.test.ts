import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  getWhisperWindowsDllCandidates,
  getWhisperWindowsRuntimeDirCandidates,
  parseWrapperProgressLine
} from '../../main/whisper/WhisperWindows'

Object.defineProperty(process, 'resourcesPath', {
  value: '/mock/resources',
  writable: true
})

describe('WhisperWindows', () => {
  it('parses JSON progress emitted by the Windows wrapper', () => {
    expect(
      parseWrapperProgressLine(
        '{"type":"progress","progress":42.4,"stage":"transcribing","message":"running"}',
        'task-1'
      )
    ).toEqual({
      taskId: 'task-1',
      progress: 42,
      stage: 'transcribing',
      message: 'running'
    })
  })

  it('falls back to percentage parsing for plain-text wrapper output', () => {
    expect(parseWrapperProgressLine('progress: 87%', 'task-2')).toEqual({
      taskId: 'task-2',
      progress: 87,
      stage: 'transcribing',
      message: 'progress: 87%'
    })
  })

  it('ignores unrelated wrapper output', () => {
    expect(parseWrapperProgressLine('initializing device', 'task-3')).toBeNull()
  })

  it('prefers packaged win resource directories when resolving runtime roots', () => {
    expect(getWhisperWindowsRuntimeDirCandidates('/tmp/userData/whisper-win')).toEqual([
      '/tmp/userData/whisper-win',
      path.join('/mock/resources', 'win'),
      path.join('/mock/resources', 'resources', 'win')
    ])
  })

  it('includes env override ahead of default dll names', () => {
    vi.stubEnv('WHISPER_WINDOWS_DLL_PATH', 'C:\\custom\\whisper.dll')

    expect(getWhisperWindowsDllCandidates('C:\\app\\resources\\win')).toEqual([
      'C:\\custom\\whisper.dll',
      path.join('C:\\app\\resources\\win', 'whisper.dll'),
      path.join('C:\\app\\resources\\win', 'libwhisper.dll')
    ])

    vi.unstubAllEnvs()
  })
})
