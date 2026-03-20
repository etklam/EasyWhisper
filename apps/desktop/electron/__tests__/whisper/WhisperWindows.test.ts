import { describe, expect, it } from 'vitest'

import { parseWrapperProgressLine } from '../../main/whisper/WhisperWindows'

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
})
