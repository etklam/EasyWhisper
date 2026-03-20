import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { expandPathPattern } from '../../main/ytdlp/YtDlpDetector'

describe('expandPathPattern', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
    tempDirs.length = 0
  })

  it('returns the original path when no wildcard is present', () => {
    const target = path.join(os.tmpdir(), 'fosswhisper-no-wildcard', 'yt-dlp.exe')
    expect(expandPathPattern(target)).toEqual([path.normalize(target)])
  })

  it('expands wildcard directory segments to matching files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'fosswhisper-ytdlp-detector-'))
    tempDirs.push(root)

    const py311 = path.join(root, 'Programs', 'Python', 'Python311', 'Scripts')
    const py312 = path.join(root, 'Programs', 'Python', 'Python312', 'Scripts')
    const other = path.join(root, 'Programs', 'Python', 'Other', 'Scripts')

    await mkdir(py311, { recursive: true })
    await mkdir(py312, { recursive: true })
    await mkdir(other, { recursive: true })
    await writeFile(path.join(py311, 'yt-dlp.exe'), '')
    await writeFile(path.join(py312, 'yt-dlp.exe'), '')
    await writeFile(path.join(other, 'yt-dlp.exe'), '')

    const pattern = path.join(root, 'Programs', 'Python', 'Python3*', 'Scripts', 'yt-dlp.exe')
    const expanded = expandPathPattern(pattern).sort()

    expect(expanded).toEqual([
      path.join(py311, 'yt-dlp.exe'),
      path.join(py312, 'yt-dlp.exe')
    ])
  })
})
