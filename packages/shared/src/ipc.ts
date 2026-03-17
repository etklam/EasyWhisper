export const IPC_CHANNELS = {
  WHISPER_START: 'whisper:start',
  WHISPER_PROGRESS: 'whisper:progress',
  WHISPER_COMPLETE: 'whisper:complete',
  WHISPER_ERROR: 'whisper:error'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
