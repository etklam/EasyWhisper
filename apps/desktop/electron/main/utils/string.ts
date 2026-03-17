// 字串工具函式

export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

export function padStart(value: number, length: number, char: string = '0'): string {
  return String(value).padStart(length, char)
}

export function padEnd(value: number, length: number, char: string = '0'): string {
  return String(value).padEnd(length, char)
}

export function truncate(text: string, maxLength: number, suffix: string = '...'): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - suffix.length) + suffix
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
