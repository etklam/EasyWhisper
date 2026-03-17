// 檔案工具函式

export function getExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return ext
}

export function hasExtension(filename: string, extensions: readonly string[]): boolean {
  const ext = getExtension(filename)
  return extensions.includes(ext)
}

export function getBasename(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '')
}
