import type {
  WhisperCompleteEvent,
  WhisperErrorEvent,
  WhisperProgressEvent,
  WhisperStartPayload,
  WhisperStartResponse
} from '@shared/types'

declare global {
  interface Window {
    fosswhisper: {
      startWhisper: (payload: WhisperStartPayload) => Promise<WhisperStartResponse>
      onWhisperProgress: (listener: (event: WhisperProgressEvent) => void) => () => void
      onWhisperComplete: (listener: (event: WhisperCompleteEvent) => void) => () => void
      onWhisperError: (listener: (event: WhisperErrorEvent) => void) => () => void
    }
  }
}

export {}
