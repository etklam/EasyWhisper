// 時間碼工具函式
import { padStart } from './string'

export function timeToSeconds(timecode: string): number {
  const parts = timecode.split(':').map(Number)
  const [hours = 0, minutes = 0, seconds = 0] = parts
  return hours * 3600 + minutes * 60 + seconds
}

export function formatTimecode(
  seconds: number,
  separator: ',' | '.' = ','
): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const hours = Math.floor(totalMs / 3600000)
  const minutes = Math.floor((totalMs % 3600000) / 60000)
  const secs = Math.floor((totalMs % 60000) / 1000)
  const ms = totalMs % 1000

  return `${padStart(hours, 2)}:${padStart(minutes, 2)}:${padStart(secs, 2)}${separator}${padStart(ms, 3)}`
}

export function formatSrtTimecode(seconds: number): string {
  return formatTimecode(seconds, ',')
}

export function formatVttTimecode(seconds: number): string {
  return formatTimecode(seconds, '.')
}
