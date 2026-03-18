import { describe, it, expect } from 'vitest'
import { IPC_CHANNELS, type IpcChannel } from '../ipc'

describe('IPC_CHANNELS', () => {
  it('should have all required channels', () => {
    expect(IPC_CHANNELS.WHISPER_START).toBe('whisper:start')
    expect(IPC_CHANNELS.WHISPER_PROGRESS).toBe('whisper:progress')
    expect(IPC_CHANNELS.WHISPER_COMPLETE).toBe('whisper:complete')
    expect(IPC_CHANNELS.WHISPER_ERROR).toBe('whisper:error')
    expect(IPC_CHANNELS.MODEL_LIST).toBe('model:list')
    expect(IPC_CHANNELS.MODEL_DOWNLOAD).toBe('model:download')
    expect(IPC_CHANNELS.MODEL_PROGRESS).toBe('model:progress')
    expect(IPC_CHANNELS.AUDIO_CONVERT).toBe('audio:convert')
    expect(IPC_CHANNELS.AUDIO_PROGRESS).toBe('audio:progress')
    expect(IPC_CHANNELS.OUTPUT_FORMAT).toBe('output:format')
    expect(IPC_CHANNELS.OUTPUT_GET_FORMATS).toBe('output:getFormats')
    expect(IPC_CHANNELS.YTDLP_DOWNLOAD).toBe('ytdlp:download')
    expect(IPC_CHANNELS.YTDLP_CANCEL).toBe('ytdlp:cancel')
  })

  it('should have unique channel names', () => {
    const channelValues = Object.values(IPC_CHANNELS)
    const uniqueChannels = new Set(channelValues)
    expect(channelValues.length).toBe(uniqueChannels.size)
  })

  it('should have valid channel names', () => {
    const channels: IpcChannel[] = [
      'whisper:start',
      'whisper:progress',
      'whisper:complete',
      'whisper:error',
      'audio:convert',
      'output:format',
      'ytdlp:download'
    ]

    channels.forEach((channel) => {
      expect(typeof channel).toBe('string')
      expect(channel).toMatch(/^[a-z]+:/)
    })
  })
})
