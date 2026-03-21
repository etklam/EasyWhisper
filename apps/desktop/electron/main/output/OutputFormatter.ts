import type { WhisperResult } from '@shared/settings.schema'
import { formatSrtTimecode, formatVttTimecode, normalizeText } from '../utils'

export type OutputFormat = 'txt' | 'srt' | 'vtt' | 'json'

type WhisperJsonSegment = WhisperResult['segments'][number]
type WhisperCppJsonResult = WhisperResult & {
  transcription?: Array<{
    text?: string
    offsets?: {
      from?: number
      to?: number
    }
  }>
}

export class OutputFormatter {
  formatAsTxt(result: WhisperResult): string {
    return normalizeText(this.getResultText(result))
  }

  formatAsSrt(result: WhisperResult): string {
    const segments = this.getSegments(result)
    if (segments.length === 0) {
      return ''
    }

    return segments
      .map((segment, index) => {
        return [
          String(index + 1),
          `${this.formatSrtTimecode(segment.start)} --> ${this.formatSrtTimecode(segment.end)}`,
          this.getSegmentText(segment)
        ].join('\n')
      })
      .join('\n\n')
  }

  formatAsVtt(result: WhisperResult): string {
    const segments = this.getSegments(result)
    if (segments.length === 0) {
      return 'WEBVTT\n'
    }

    const body = segments
      .map((segment) => {
        return [
          `${this.formatVttTimecode(segment.start)} --> ${this.formatVttTimecode(segment.end)}`,
          this.getSegmentText(segment)
        ].join('\n')
      })
      .join('\n\n')

    return `WEBVTT\n\n${body}`
  }

  formatAsJson(result: WhisperResult): string {
    return JSON.stringify(result, null, 2)
  }

  format(result: WhisperResult, format: OutputFormat): string {
    switch (format) {
      case 'txt':
        return this.formatAsTxt(result)
      case 'srt':
        return this.formatAsSrt(result)
      case 'vtt':
        return this.formatAsVtt(result)
      case 'json':
        return this.formatAsJson(result)
      default:
        throw new Error(`Invalid format: ${format}`)
    }
  }

  getFileExtension(format: OutputFormat): string {
    switch (format) {
      case 'txt':
        return '.txt'
      case 'srt':
        return '.srt'
      case 'vtt':
        return '.vtt'
      case 'json':
        return '.json'
      default:
        throw new Error(`Invalid format: ${format}`)
    }
  }

  formatSrtTimecode(seconds: number): string {
    return formatSrtTimecode(seconds)
  }

  formatVttTimecode(seconds: number): string {
    return formatVttTimecode(seconds)
  }

  private getResultText(result: WhisperResult): string {
    const normalizedResult = result as WhisperCppJsonResult

    if (typeof result.text === 'string') {
      const normalizedText = normalizeText(result.text)
      if (normalizedText.length > 0) {
        return normalizedText
      }
    }

    const segments = this.getSegments(normalizedResult)
    if (segments.length > 0) {
      return segments
        .map((segment) => this.getSegmentText(segment))
        .filter((text) => text.length > 0)
        .join(' ')
    }

    return ''
  }

  private getSegments(result: WhisperCppJsonResult): WhisperJsonSegment[] {
    if (Array.isArray(result.segments)) {
      return result.segments
    }

    if (!Array.isArray(result.transcription)) {
      return []
    }

    return result.transcription.map((segment, index) => ({
      id: index,
      seek: 0,
      start: typeof segment.offsets?.from === 'number' ? segment.offsets.from / 1000 : 0,
      end: typeof segment.offsets?.to === 'number' ? segment.offsets.to / 1000 : 0,
      text: typeof segment.text === 'string' ? segment.text : '',
      tokens: [],
      temperature: 0,
      avg_logprob: 0,
      compression_ratio: 0,
      no_speech_prob: 0
    }))
  }

  private getSegmentText(segment: WhisperJsonSegment): string {
    return typeof segment.text === 'string' ? segment.text.trim() : ''
  }
}
