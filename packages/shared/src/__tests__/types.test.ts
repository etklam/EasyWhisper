import { describe, it, expect } from 'vitest'
import type {
  WhisperModelDownloadPayload,
  WhisperModelId,
  WhisperModelInfo,
  WhisperTaskStatus,
  WhisperTask,
  WhisperStartPayload,
  WhisperStartResponse,
  WhisperProgressEvent,
  WhisperCompleteEvent,
  WhisperErrorEvent,
  WhisperSettings,
  AppSettings,
  WorkflowSettings,
  AudioConvertPayload,
  AudioProgressEvent,
  OutputFormatPayload,
  OutputFormatResponse,
  YtDlpCancelPayload,
  YtDlpCancelResponse
} from '../types'
import { WHISPER_MODEL_IDS } from '../types'

describe('WhisperTask', () => {
  it('should have all required fields', () => {
    const task: WhisperTask = {
      id: 'task-123',
      audioPath: '/path/to/audio.mp3',
      modelPath: '/path/to/model.bin',
      createdAt: new Date().toISOString(),
      status: 'pending'
    }

    expect(task.id).toBe('task-123')
    expect(task.audioPath).toBe('/path/to/audio.mp3')
    expect(task.modelPath).toBe('/path/to/model.bin')
    expect(task.status).toBe('pending')
    expect(typeof task.createdAt).toBe('string')
  })

  it('should support optional fields', () => {
    const task: WhisperTask = {
      id: 'task-456',
      audioPath: '/path/to/audio.mp3',
      modelPath: '/path/to/model.bin',
      language: 'zh',
      threads: 4,
      useMetal: true,
      createdAt: new Date().toISOString(),
      status: 'running',
      outputPath: '/path/to/output.txt'
    }

    expect(task.language).toBe('zh')
    expect(task.threads).toBe(4)
    expect(task.useMetal).toBe(true)
    expect(task.outputPath).toBe('/path/to/output.txt')
  })
})

describe('WhisperStartPayload', () => {
  it('should have required fields', () => {
    const payload: WhisperStartPayload = {
      audioPath: '/path/to/audio.mp3',
      modelPath: '/path/to/model.bin'
    }

    expect(payload.audioPath).toBe('/path/to/audio.mp3')
    expect(payload.modelPath).toBe('/path/to/model.bin')
  })

  it('should support optional fields', () => {
    const payload: WhisperStartPayload = {
      taskId: 'task-789',
      audioPath: '/path/to/audio.mp3',
      modelPath: '/path/to/model.bin',
      language: 'en',
      threads: 8,
      useMetal: false,
      outputDir: '/path/to/output'
    }

    expect(payload.taskId).toBe('task-789')
    expect(payload.language).toBe('en')
    expect(payload.threads).toBe(8)
    expect(payload.useMetal).toBe(false)
    expect(payload.outputDir).toBe('/path/to/output')
  })
})

describe('WhisperStartResponse', () => {
  it('should have required fields', () => {
    const response: WhisperStartResponse = {
      taskId: 'task-123',
      accepted: true
    }

    expect(response.taskId).toBe('task-123')
    expect(response.accepted).toBe(true)
  })
})

describe('WhisperProgressEvent', () => {
  it('should have all fields', () => {
    const event: WhisperProgressEvent = {
      taskId: 'task-123',
      progress: 0.5,
      stage: 'transcribing',
      message: 'Processing...'
    }

    expect(event.taskId).toBe('task-123')
    expect(event.progress).toBe(0.5)
    expect(event.stage).toBe('transcribing')
    expect(event.message).toBe('Processing...')
  })

  it('should have valid progress range', () => {
    const event: WhisperProgressEvent = {
      taskId: 'task-123',
      progress: 75,
      stage: 'transcribing'
    }

    expect(event.progress).toBeGreaterThanOrEqual(0)
    expect(event.progress).toBeLessThanOrEqual(100)
  })
})

describe('WhisperCompleteEvent', () => {
  it('should have all required fields', () => {
    const event: WhisperCompleteEvent = {
      taskId: 'task-123',
      outputPath: '/path/to/output.txt',
      text: 'Transcribed text',
      durationMs: 5000
    }

    expect(event.taskId).toBe('task-123')
    expect(event.outputPath).toBe('/path/to/output.txt')
    expect(event.text).toBe('Transcribed text')
    expect(event.durationMs).toBe(5000)
  })
})

describe('WhisperErrorEvent', () => {
  it('should have required fields', () => {
    const event: WhisperErrorEvent = {
      taskId: 'task-123',
      error: 'Something went wrong'
    }

    expect(event.taskId).toBe('task-123')
    expect(event.error).toBe('Something went wrong')
  })
})

describe('WhisperSettings', () => {
  it('should have all required fields', () => {
    const settings: WhisperSettings = {
      modelPath: '/path/to/model.bin',
      threads: 4,
      language: 'zh',
      useMetal: true,
      outputDir: '/path/to/output'
    }

    expect(settings.modelPath).toBe('/path/to/model.bin')
    expect(settings.threads).toBe(4)
    expect(settings.language).toBe('zh')
    expect(settings.useMetal).toBe(true)
    expect(settings.outputDir).toBe('/path/to/output')
  })
})

describe('WorkflowSettings', () => {
  it('should include output formats and workflow options', () => {
    const settings: WorkflowSettings = {
      modelPath: 'ggml-base.bin',
      threads: 4,
      language: 'auto',
      useMetal: true,
      outputDir: '/outputs',
      outputFormats: ['txt', 'srt'],
      ytdlpAudioFormat: 'mp3',
      ytdlpCookiesPath: '',
      aiEnabled: false,
      aiModel: '',
      aiTargetLang: 'zh-TW',
      aiCorrect: false,
      aiTranslate: false,
      aiSummary: false
    }

    expect(settings.outputFormats).toEqual(['txt', 'srt'])
    expect(settings.ytdlpAudioFormat).toBe('mp3')
  })
})

describe('AppSettings', () => {
  it('should contain whisper settings', () => {
    const settings: AppSettings = {
      whisper: {
        modelPath: '/path/to/model.bin',
        threads: 4,
        language: 'zh',
        useMetal: true,
        outputDir: '/path/to/output'
      }
    }

    expect(settings.whisper).toBeDefined()
    expect(settings.whisper.modelPath).toBe('/path/to/model.bin')
  })
})

describe('WhisperTaskStatus', () => {
  it('should have valid status values', () => {
    const validStatuses: WhisperTaskStatus[] = [
      'pending',
      'running',
      'completed',
      'error'
    ]

    validStatuses.forEach((status) => {
      expect(typeof status).toBe('string')
    })
  })
})

describe('Whisper models', () => {
  it('should expose supported model ids', () => {
    expect(WHISPER_MODEL_IDS).toEqual([
      'ggml-base.bin',
      'ggml-small.bin',
      'ggml-medium.bin',
      'ggml-large-v3.bin'
    ])
  })

  it('should type model info payloads', () => {
    const modelId: WhisperModelId = 'ggml-base.bin'
    const model: WhisperModelInfo = {
      id: modelId,
      label: 'Base',
      path: '/path/to/models/ggml-base.bin',
      downloadUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin?download=true',
      downloaded: true,
      sizeBytes: 123
    }
    const payload: WhisperModelDownloadPayload = {
      modelId
    }

    expect(model.id).toBe(payload.modelId)
    expect(model.downloaded).toBe(true)
  })
})

describe('Additional workflow payloads', () => {
  it('should type yt-dlp cancel payloads', () => {
    const payload: YtDlpCancelPayload = {
      taskId: 'task-123'
    }
    const response: YtDlpCancelResponse = {
      taskId: payload.taskId,
      cancelled: true
    }

    expect(response.cancelled).toBe(true)
  })

  it('should type audio conversion payloads', () => {
    const payload: AudioConvertPayload = {
      taskId: 'task-123',
      inputPath: '/tmp/input.mp3'
    }
    const event: AudioProgressEvent = {
      taskId: 'task-123',
      progress: 50,
      time: '00:00:10.00'
    }

    expect(payload.inputPath).toContain('input.mp3')
    expect(event.progress).toBe(50)
  })

  it('should type formatted output responses', () => {
    const payload: OutputFormatPayload = {
      outputPath: '/tmp/task-123.json',
      format: 'srt'
    }
    const response: OutputFormatResponse = {
      content: '1\n00:00:00,000 --> 00:00:01,000\nhello',
      extension: '.srt',
      outputPath: '/tmp/task-123.srt'
    }

    expect(payload.format).toBe('srt')
    expect(response.outputPath.endsWith(response.extension)).toBe(true)
  })
})
