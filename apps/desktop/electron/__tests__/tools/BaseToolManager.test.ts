import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BaseToolManager,
  type ManagedToolState,
  type ToolPlatformConfig
} from '../../main/tools/BaseToolManager'

const yauzlMock = vi.hoisted(() => ({
  open: vi.fn()
}))

vi.mock('yauzl', () => yauzlMock)

class TestToolManager extends BaseToolManager<{ binaryPath: string }> {
  constructor(userDataDir: string) {
    const platformConfigs: Record<'darwin' | 'linux' | 'win32', ToolPlatformConfig> = {
      darwin: {
        assetName: 'tool.zip',
        archiveType: 'zip',
        binaryRelativePath: path.join('payload', 'bin', 'tool'),
        finalFileName: 'tool'
      },
      linux: {
        assetName: 'tool.tar.xz',
        archiveType: 'tar.xz',
        binaryRelativePath: path.join('payload', 'bin', 'tool'),
        finalFileName: 'tool'
      },
      win32: {
        assetName: 'tool.zip',
        archiveType: 'zip',
        binaryRelativePath: path.join('payload', 'bin', 'tool.exe'),
        finalFileName: 'tool.exe'
      }
    }

    super({
      userDataDir,
      toolName: 'test-tool',
      repo: 'owner/repo',
      checksumAssetName: 'checksums.txt',
      platformConfigs
    })
  }

  protected override async describeInstallation(state: ManagedToolState): Promise<{ binaryPath: string }> {
    return { binaryPath: state.binaryPath }
  }

  async invokeSwapInBinary(sourcePath: string, targetPath: string): Promise<void> {
    await (this as any).swapInBinary(sourcePath, targetPath)
  }

  async invokeExtractArchive(
    archivePath: string,
    tempDir: string,
    config: ToolPlatformConfig
  ): Promise<string> {
    return (this as any).extractArchive(archivePath, tempDir, config)
  }
}

class FakeZipFile extends EventEmitter {
  private index = 0

  constructor(
    private readonly entries: Array<{ fileName: string; content?: string }>
  ) {
    super()
  }

  readEntry(): void {
    if (this.index >= this.entries.length) {
      queueMicrotask(() => this.emit('end'))
      return
    }

    const entry = this.entries[this.index]
    this.index += 1
    queueMicrotask(() => this.emit('entry', entry))
  }

  openReadStream(
    entry: { fileName: string; content?: string },
    callback: (error: Error | null, stream: NodeJS.ReadableStream | null) => void
  ): void {
    callback(null, Readable.from([entry.content ?? '']))
  }

  close(): void {}
}

describe('BaseToolManager', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
    tempDirs.length = 0
  })

  it('extracts zip entries sequentially and returns the binary path', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'fosswhisper-tool-zip-'))
    tempDirs.push(root)

    yauzlMock.open.mockImplementation((_archivePath, _options, callback) => {
      callback(null, new FakeZipFile([
        { fileName: 'payload/' },
        { fileName: 'payload/bin/' },
        { fileName: 'payload/bin/tool.exe', content: 'tool-binary' }
      ]))
    })

    const manager = new TestToolManager(root)
    const config: ToolPlatformConfig = {
      assetName: 'tool.zip',
      archiveType: 'zip',
      binaryRelativePath: path.join('payload', 'bin', 'tool.exe'),
      finalFileName: 'tool.exe'
    }

    const binaryPath = await manager.invokeExtractArchive(path.join(root, 'archive.zip'), root, config)

    expect(binaryPath).toBe(path.join(root, 'extract', 'payload', 'bin', 'tool.exe'))
    await expect(readFile(binaryPath, 'utf8')).resolves.toBe('tool-binary')
  })

  it('installs directory payloads into the target directory while keeping the binary path executable', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'fosswhisper-tool-swap-'))
    tempDirs.push(root)

    const sourceDir = path.join(root, 'source-bin')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(path.join(sourceDir, 'ffmpeg.exe'), 'ffmpeg-binary')
    await writeFile(path.join(sourceDir, 'ffprobe.exe'), 'ffprobe-binary')

    const manager = new TestToolManager(root)
    const targetPath = path.join(root, 'tools', 'ffmpeg', 'current', 'ffmpeg.exe')

    await manager.invokeSwapInBinary(sourceDir, targetPath)

    await expect(stat(targetPath)).resolves.toMatchObject({ isFile: expect.any(Function) })
    expect((await stat(targetPath)).isFile()).toBe(true)
    await expect(readFile(targetPath, 'utf8')).resolves.toBe('ffmpeg-binary')
    await expect(readFile(path.join(path.dirname(targetPath), 'ffprobe.exe'), 'utf8')).resolves.toBe('ffprobe-binary')
  })
})
