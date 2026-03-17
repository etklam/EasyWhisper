import type { WhisperResult } from '@shared/settings.schema'
import { formatSrtTimecode, formatVttTimecode, normalizeText } from '../utils'

export type OutputFormat = 'txt' | 'srt' | 'vtt' | 'json'

export class OutputFormatter {
  formatAsTxt(result: WhisperResult): string {
    return normalizeText(result.text)
  }

  formatAsSrt(result: WhisperResult): string {
    if (result.segments.length === 0) {
      return ''
    }

    return result.segments
      .map((segment, index) => {
        return [
          String(index + 1),
          `${this.formatSrtTimecode(segment.start)} --> ${this.formatSrtTimecode(segment.end)}`,
          segment.text.trim()
        ].join('\n')
      })
      .join('\n\n')
  }

  formatAsVtt(result: WhisperResult): string {
    if (result.segments.length === 0) {
      return 'WEBVTT\n'
    }

    const body = result.segments
      .map((segment) => {
        return [
          `${this.formatVttTimecode(segment.start)} --> ${this.formatVttTimecode(segment.end)}`,
          segment.text.trim()
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
}
