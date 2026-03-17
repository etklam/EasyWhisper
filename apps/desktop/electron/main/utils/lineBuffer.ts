export function createLineBuffer(onLine: (line: string) => void) {
  let buffer = ''

  return {
    push(chunk: Buffer): void {
      buffer += chunk.toString('utf8')
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.length > 0) {
          onLine(trimmed)
        }
      }
    },
    flush(): void {
      const trimmed = buffer.trim()
      if (trimmed.length > 0) {
        onLine(trimmed)
      }
      buffer = ''
    }
  }
}
