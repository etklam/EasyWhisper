import { describe, it, expect } from 'vitest'
import { OutputFormatter } from '../OutputFormatter'
import type { WhisperResult } from '@shared/types'

describe('OutputFormatter', () => {
  let formatter: OutputFormatter
  let mockWhisperResult: WhisperResult

  beforeEach(() => {
    formatter = new OutputFormatter()
    mockWhisperResult = {
      text: 'This is a sample transcription text.',
      segments: [
        {
          id: 0,
          seek: 0,
          start: 0.0,
          end: 2.5,
          text: 'This is a sample',
          tokens: [503, 318, 257, 1029],
          temperature: 0.0,
          avg_logprob: -0.5,
          compression_ratio: 1.2,
          no_speech_prob: 0.1
        },
        {
          id: 1,
          seek: 0,
          start: 2.5,
          end: 5.0,
          text: 'transcription text.',
          tokens: [1029, 3290, 13],
          temperature: 0.0,
          avg_logprob: -0.4,
          compression_ratio: 1.1,
          no_speech_prob: 0.05
        }
      ]
    }
  })

  describe('TXT Format', () => {
    it('should format as plain text', () => {
      const result = formatter.formatAsTxt(mockWhisperResult)

      expect(result).toBe('This is a sample transcription text.')
    })

    it('should handle empty text', () => {
      const emptyResult: WhisperResult = {
        text: '',
        segments: []
      }

      const result = formatter.formatAsTxt(emptyResult)

      expect(result).toBe('')
    })

    it('should handle multiple segments', () => {
      const result = formatter.formatAsTxt(mockWhisperResult)

      expect(result).toBe('This is a sample transcription text.')
    })
  })

  describe('SRT Format', () => {
    it('should format as SRT subtitles', () => {
      const result = formatter.formatAsSrt(mockWhisperResult)

      expect(result).toContain('1')
      expect(result).toContain('00:00:00,000 --> 00:00:02,500')
      expect(result).toContain('This is a sample')
      expect(result).toContain('2')
      expect(result).toContain('00:00:02,500 --> 00:00:05,000')
      expect(result).toContain('transcription text.')
    })

    it('should format SRT timecodes correctly', () => {
      const result = formatter.formatAsSrt(mockWhisperResult)

      // Check timecode format: HH:MM:SS,mmm
      const timecodeRegex = /\d{2}:\d{2}:\d{2},\d{3}/g
      const matches = result.match(timecodeRegex)
      expect(matches).toHaveLength(4) // Two segments, each has start + end
    })

    it('should handle empty segments', () => {
      const emptyResult: WhisperResult = {
        text: '',
        segments: []
      }

      const result = formatter.formatAsSrt(emptyResult)

      expect(result).toBe('')
    })

    it('should tolerate missing segments', () => {
      const missingSegments = { text: 'hello' } as WhisperResult

      expect(formatter.formatAsSrt(missingSegments)).toBe('')
    })

    it('should handle long segments', () => {
      const longSegment: WhisperResult = {
        text: 'Long text segment.',
        segments: [
          {
            id: 0,
            seek: 0,
            start: 0.0,
            end: 65.5, // Over a minute
            text: 'Long text segment.',
            tokens: [503, 318],
            temperature: 0.0,
            avg_logprob: -0.5,
            compression_ratio: 1.2,
            no_speech_prob: 0.1
          }
        ]
      }

      const result = formatter.formatAsSrt(longSegment)

      expect(result).toContain('00:01:05,500') // 65.5 seconds
    })
  })

  describe('VTT Format', () => {
    it('should format as WebVTT', () => {
      const result = formatter.formatAsVtt(mockWhisperResult)

      expect(result).toContain('WEBVTT')
      expect(result).toContain('00:00:00.000 --> 00:00:02.500')
      expect(result).toContain('This is a sample')
    })

    it('should include WEBVTT header', () => {
      const result = formatter.formatAsVtt(mockWhisperResult)

      expect(result).toMatch(/^WEBVTT\n/)
    })

    it('should format VTT timecodes with dots', () => {
      const result = formatter.formatAsVtt(mockWhisperResult)

      // VTT uses dots instead of commas
      expect(result).toContain('00:00:00.000 --> 00:00:02.500')
      expect(result).not.toContain('00:00:00,000')
    })

    it('should handle empty segments', () => {
      const emptyResult: WhisperResult = {
        text: '',
        segments: []
      }

      const result = formatter.formatAsVtt(emptyResult)

      expect(result).toBe('WEBVTT\n')
    })

    it('should tolerate missing segments', () => {
      const missingSegments = { text: 'hello' } as WhisperResult

      expect(formatter.formatAsVtt(missingSegments)).toBe('WEBVTT\n')
    })
  })

  describe('JSON Format', () => {
    it('should format as JSON', () => {
      const result = formatter.formatAsJson(mockWhisperResult)

      const parsed = JSON.parse(result)
      expect(parsed).toHaveProperty('text')
      expect(parsed).toHaveProperty('segments')
      expect(parsed.text).toBe('This is a sample transcription text.')
      expect(parsed.segments).toHaveLength(2)
    })

    it('should preserve all segment data', () => {
      const result = formatter.formatAsJson(mockWhisperResult)

      const parsed = JSON.parse(result)
      expect(parsed.segments[0]).toHaveProperty('start')
      expect(parsed.segments[0]).toHaveProperty('end')
      expect(parsed.segments[0]).toHaveProperty('text')
      expect(parsed.segments[0]).toHaveProperty('tokens')
    })

    it('should handle empty result', () => {
      const emptyResult: WhisperResult = {
        text: '',
        segments: []
      }

      const result = formatter.formatAsJson(emptyResult)

      const parsed = JSON.parse(result)
      expect(parsed.text).toBe('')
      expect(parsed.segments).toEqual([])
    })
  })

  describe('Format Selection', () => {
    it('should format based on format parameter', () => {
      const txtResult = formatter.format(mockWhisperResult, 'txt')
      expect(txtResult).toBe('This is a sample transcription text.')

      const srtResult = formatter.format(mockWhisperResult, 'srt')
      expect(srtResult).toContain('00:00:00,000 --> 00:00:02,500')

      const vttResult = formatter.format(mockWhisperResult, 'vtt')
      expect(vttResult).toContain('WEBVTT')

      const jsonResult = formatter.format(mockWhisperResult, 'json')
      const parsed = JSON.parse(jsonResult)
      expect(parsed).toHaveProperty('text')
    })

    it('should throw error for invalid format', () => {
      expect(() => formatter.format(mockWhisperResult, 'invalid' as any))
        .toThrow('Invalid format: invalid')
    })
  })

  describe('File Extension Mapping', () => {
    it('should return correct file extension for each format', () => {
      expect(formatter.getFileExtension('txt')).toBe('.txt')
      expect(formatter.getFileExtension('srt')).toBe('.srt')
      expect(formatter.getFileExtension('vtt')).toBe('.vtt')
      expect(formatter.getFileExtension('json')).toBe('.json')
    })

    it('should throw error for invalid format extension', () => {
      expect(() => formatter.getFileExtension('invalid' as any))
        .toThrow('Invalid format: invalid')
    })
  })

  describe('Timecode Formatting', () => {
    it('should format seconds to SRT timecode', () => {
      const timecode = formatter.formatSrtTimecode(3661.5) // 1:01:01.5

      expect(timecode).toBe('01:01:01,500')
    })

    it('should format seconds to VTT timecode', () => {
      const timecode = formatter.formatVttTimecode(3661.5) // 1:01:01.5

      expect(timecode).toBe('01:01:01.500')
    })

    it('should handle zero time', () => {
      const srtTime = formatter.formatSrtTimecode(0)
      const vttTime = formatter.formatVttTimecode(0)

      expect(srtTime).toBe('00:00:00,000')
      expect(vttTime).toBe('00:00:00.000')
    })

    it('should handle milliseconds correctly', () => {
      const srtTime = formatter.formatSrtTimecode(1.234)
      const vttTime = formatter.formatVttTimecode(1.234)

      expect(srtTime).toBe('00:00:01,234')
      expect(vttTime).toBe('00:00:01.234')
    })
  })

  describe('Segment Processing', () => {
    it('should merge adjacent segments if needed', () => {
      // Some implementations merge very short segments
      const result = formatter.formatAsTxt(mockWhisperResult)

      expect(result).toContain('This is a sample transcription text.')
    })

    it('should handle segments with no_speech', () => {
      const resultWithNoSpeech: WhisperResult = {
        text: 'Spoken text.',
        segments: [
          {
            id: 0,
            seek: 0,
            start: 0.0,
            end: 1.0,
            text: 'Spoken text.',
            tokens: [503],
            temperature: 0.0,
            avg_logprob: -0.5,
            compression_ratio: 1.2,
            no_speech_prob: 0.9 // High probability of no speech
          }
        ]
      }

      const txtResult = formatter.formatAsTxt(resultWithNoSpeech)

      expect(txtResult).toBe('Spoken text.')
    })

    it('should tolerate missing segment text in subtitle formats', () => {
      const incompleteResult = {
        text: 'Recovered from segments',
        segments: [
          {
            id: 0,
            seek: 0,
            start: 0,
            end: 1,
            tokens: [],
            temperature: 0,
            avg_logprob: 0,
            compression_ratio: 0,
            no_speech_prob: 0
          }
        ]
      } as unknown as WhisperResult

      expect(() => formatter.formatAsSrt(incompleteResult)).not.toThrow()
      expect(() => formatter.formatAsVtt(incompleteResult)).not.toThrow()
    })

    it('should support whisper.cpp transcription array output', () => {
      const whisperCppResult = {
        transcription: [
          {
            text: 'Hello',
            offsets: { from: 0, to: 1250 }
          },
          {
            text: 'world',
            offsets: { from: 1250, to: 2500 }
          }
        ]
      } as unknown as WhisperResult

      expect(formatter.formatAsTxt(whisperCppResult)).toBe('Hello world')
      expect(formatter.formatAsSrt(whisperCppResult)).toContain('Hello')
      expect(formatter.formatAsSrt(whisperCppResult)).toContain('00:00:00,000 --> 00:00:01,250')
      expect(formatter.formatAsVtt(whisperCppResult)).toContain('Hello')
      expect(formatter.formatAsVtt(whisperCppResult)).toContain('00:00:00.000 --> 00:00:01.250')
    })
  })

  describe('Text Normalization', () => {
    it('should normalize whitespace', () => {
      const resultWithExtraSpaces: WhisperResult = {
        text: '  Too  much  spaces  ',
        segments: []
      }

      const result = formatter.formatAsTxt(resultWithExtraSpaces)

      // Depending on normalization logic
      expect(result).toContain('Too')
      expect(result).toContain('much')
      expect(result).toContain('spaces')
    })

    it('should reconstruct text when top-level text is missing', () => {
      const missingTextResult = {
        segments: [
          {
            id: 0,
            seek: 0,
            start: 0,
            end: 1,
            text: 'Hello',
            tokens: [],
            temperature: 0,
            avg_logprob: 0,
            compression_ratio: 0,
            no_speech_prob: 0
          },
          {
            id: 1,
            seek: 0,
            start: 1,
            end: 2,
            text: 'world',
            tokens: [],
            temperature: 0,
            avg_logprob: 0,
            compression_ratio: 0,
            no_speech_prob: 0
          }
        ]
      } as unknown as WhisperResult

      expect(formatter.formatAsTxt(missingTextResult)).toBe('Hello world')
    })

    it('should reconstruct text when top-level text is blank', () => {
      const blankTextResult = {
        text: '   ',
        segments: [
          {
            id: 0,
            seek: 0,
            start: 0,
            end: 1,
            text: 'Hello',
            tokens: [],
            temperature: 0,
            avg_logprob: 0,
            compression_ratio: 0,
            no_speech_prob: 0
          },
          {
            id: 1,
            seek: 0,
            start: 1,
            end: 2,
            text: 'world',
            tokens: [],
            temperature: 0,
            avg_logprob: 0,
            compression_ratio: 0,
            no_speech_prob: 0
          }
        ]
      } as unknown as WhisperResult

      expect(formatter.formatAsTxt(blankTextResult)).toBe('Hello world')
    })

    it('should preserve line breaks in subtitle formats', () => {
      const resultWithLines: WhisperResult = {
        text: 'Line 1\nLine 2',
        segments: [
          {
            id: 0,
            seek: 0,
            start: 0.0,
            end: 2.0,
            text: 'Line 1',
            tokens: [503],
            temperature: 0.0,
            avg_logprob: -0.5,
            compression_ratio: 1.2,
            no_speech_prob: 0.1
          },
          {
            id: 1,
            seek: 0,
            start: 2.0,
            end: 4.0,
            text: 'Line 2',
            tokens: [503],
            temperature: 0.0,
            avg_logprob: -0.5,
            compression_ratio: 1.2,
            no_speech_prob: 0.1
          }
        ]
      }

      const srtResult = formatter.formatAsSrt(resultWithLines)

      expect(srtResult).toContain('Line 1')
      expect(srtResult).toContain('Line 2')
    })
  })
})
