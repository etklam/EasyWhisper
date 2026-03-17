import { describe, it, expect } from 'vitest'
import { IPC_CHANNELS, type IpcChannel } from '../ipc'

describe('IPC_CHANNELS', () => {
  it('should have all required channels', () => {
    expect(IPC_CHANNELS.WHISPER_START).toBe('whisper:start')
    expect(IPC_CHANNELS.WHISPER_PROGRESS).toBe('whisper:progress')
    expect(IPC_CHANNELS.WHISPER_COMPLETE).toBe('whisper:complete')
    expect(IPC_CHANNELS.WHISPER_ERROR).toBe('whisper:error')
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
      'whisper:error'
    ]

    channels.forEach((channel) => {
      expect(typeof channel).toBe('string')
      expect(channel).toMatch(/^whisper:/)
    })
  })
})
