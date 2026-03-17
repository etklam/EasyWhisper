export const IPC_CHANNELS = {
  WHISPER_START: 'whisper:start',
  WHISPER_PROGRESS: 'whisper:progress',
  WHISPER_COMPLETE: 'whisper:complete',
  WHISPER_ERROR: 'whisper:error',
  AI_RUN: 'ai:run',
  AI_STOP: 'ai:stop',
  AI_GET_STATUS: 'ai:getStatus',
  AI_LIST_MODELS: 'ai:listModels',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  YTDLP_START: 'ytdlp:start',
  YTDLP_PROGRESS: 'ytdlp:progress',
  YTDLP_COMPLETE: 'ytdlp:complete',
  YTDLP_ERROR: 'ytdlp:error'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
