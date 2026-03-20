import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  access,
  chmod,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  statfs,
  writeFile
} from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { once } from 'node:events'

export type ArchiveType = 'none' | 'zip' | 'tar.xz'

export interface ToolPlatformConfig {
  assetName: string
  archiveType: ArchiveType
  binaryRelativePath: string
  finalFileName: string
}

export type ToolProgressPhase = 'download' | 'verify' | 'extract' | 'finalize'

export interface ToolProgressUpdate {
  phase: ToolProgressPhase
  downloadedBytes?: number
  totalBytes?: number
  percent?: number
  message?: string
}

export interface ToolDownloadOptions {
  onProgress?: (update: ToolProgressUpdate) => void
  signal?: AbortSignal
}

interface GithubAsset {
  name: string
  browser_download_url: string
  size: number
}

interface GithubRelease {
  tag_name: string
  assets: GithubAsset[]
  published_at: string
}

export interface ManagedToolState {
  version: string
  binaryPath: string
  installedAt: string
  platform: NodeJS.Platform
}

interface BaseToolManagerOptions {
  userDataDir: string
  toolName: string
  repo: string
  checksumAssetName: string
  platformConfigs: Record<'darwin' | 'linux' | 'win32', ToolPlatformConfig>
  cacheTtlMs?: number
}

interface ReleaseCacheEntry {
  release: GithubRelease
  expiresAt: number
}

export abstract class BaseToolManager<TInstallation> {
  private readonly toolRoot: string
  private readonly statePath: string
  private readonly cacheTtlMs: number
  private readonly userAgent = 'FOSSWhisper/desktop'
  private releaseCache?: ReleaseCacheEntry

  constructor(private readonly options: BaseToolManagerOptions) {
    this.toolRoot = path.join(options.userDataDir, 'tools', options.toolName)
    this.statePath = path.join(this.toolRoot, 'state.json')
    this.cacheTtlMs = options.cacheTtlMs ?? 10 * 60 * 1000
  }

  async getInstalledInfo(): Promise<TInstallation | null> {
    const state = await this.readState()
    if (!state) {
      return null
    }
    if (!(await this.pathExists(state.binaryPath))) {
      return null
    }
    return this.describeInstallation(state)
  }

  async download(options?: ToolDownloadOptions): Promise<TInstallation> {
    const release = await this.getLatestRelease()
    return this.installRelease(release, options)
  }

  async update(options?: ToolDownloadOptions): Promise<TInstallation> {
    const current = await this.readState()
    const release = await this.getLatestRelease(true)
    if (current && current.version === release.tag_name && (await this.pathExists(current.binaryPath))) {
      return this.describeInstallation(current)
    }
    return this.installRelease(release, options)
  }

  getBinaryPath(): string {
    const config = this.getPlatformConfig()
    return path.join(this.toolRoot, 'current', config.finalFileName)
  }

  protected abstract describeInstallation(state: ManagedToolState): Promise<TInstallation>

  private async installRelease(release: GithubRelease, options?: ToolDownloadOptions): Promise<TInstallation> {
    await mkdir(this.toolRoot, { recursive: true })
    const platformConfig = this.getPlatformConfig()
    const targetAsset = this.findAsset(release, platformConfig.assetName)
    const checksumAsset = this.findAsset(release, this.options.checksumAssetName)
    const checksum = await this.fetchChecksumValue(checksumAsset, platformConfig.assetName)
    const tempDir = path.join(this.toolRoot, 'tmp', randomUUID())
    await mkdir(tempDir, { recursive: true })
    const downloadPath = path.join(tempDir, targetAsset.name)
    try {
      await this.ensureDiskSpace(tempDir, targetAsset.size * 2)
      await this.downloadAsset(targetAsset.browser_download_url, downloadPath, targetAsset.size, options)
      await this.emitProgress(options, { phase: 'verify', percent: 0 })
      await this.verifyChecksum(downloadPath, checksum)
      await this.emitProgress(options, { phase: 'verify', percent: 100 })
      let binarySourcePath = downloadPath
      if (platformConfig.archiveType !== 'none') {
        await this.emitProgress(options, { phase: 'extract', percent: 0 })
        binarySourcePath = await this.extractArchive(downloadPath, tempDir, platformConfig)
        await this.emitProgress(options, { phase: 'extract', percent: 100 })
      }
      const finalPath = this.getBinaryPath()
      await this.swapInBinary(binarySourcePath, finalPath)
      const state: ManagedToolState = {
        version: release.tag_name,
        binaryPath: finalPath,
        installedAt: new Date().toISOString(),
        platform: process.platform
      }
      await this.writeState(state)
      await this.emitProgress(options, { phase: 'finalize', percent: 100 })
      return this.describeInstallation(state)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  private getPlatformConfig(): ToolPlatformConfig {
    const config = this.options.platformConfigs[process.platform as 'darwin' | 'linux' | 'win32']
    if (!config) {
      throw new Error(`Unsupported platform for ${this.options.toolName}: ${process.platform}`)
    }
    return config
  }

  private findAsset(release: GithubRelease, assetName: string): GithubAsset {
    const asset = release.assets.find((candidate) => candidate.name === assetName)
    if (!asset) {
      throw new Error(`Asset ${assetName} not found in release ${release.tag_name}`)
    }
    return asset
  }

  private async fetchChecksumValue(asset: GithubAsset, targetFileName: string): Promise<string> {
    const response = await this.fetchWithTimeout(asset.browser_download_url, {
      headers: { Accept: 'text/plain' }
    })
    if (!response.ok) {
      throw new Error(`Failed to download checksum file: ${response.status} ${response.statusText}`)
    }
    const content = await response.text()
    const lines = content.split(/\r?\n/)
    for (const line of lines) {
      if (!line.trim()) continue
      if (line.includes(` ${targetFileName}`) || line.includes(`*${targetFileName}`)) {
        const hash = line.trim().split(/\s+/)[0]
        if (!hash) {
          break
        }
        return hash
      }
    }
    throw new Error(`Checksum for ${targetFileName} not found`)
  }

  private async downloadAsset(
    url: string,
    destination: string,
    totalBytes: number,
    options?: ToolDownloadOptions
  ): Promise<void> {
    const maxAttempts = 3
    let lastError: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.downloadOnce(url, destination, totalBytes, options)
        return
      } catch (error) {
        lastError = error
        await rm(destination, { force: true }).catch(() => {})
        if (attempt === maxAttempts || options?.signal?.aborted) {
          break
        }
        await delay(500 * attempt)
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  private async downloadOnce(
    url: string,
    destination: string,
    totalBytes: number,
    options?: ToolDownloadOptions
  ): Promise<void> {
    if (options?.signal?.aborted) {
      throw new Error('Download aborted')
    }

    const response = await this.fetchWithTimeout(url, {
      headers: { Accept: 'application/octet-stream' }
    })
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download asset: ${response.status} ${response.statusText}`)
    }
    const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>)
    const fileStream = createWriteStream(destination)
    let downloaded = 0
    const abortHandler = (): void => {
      nodeStream.destroy(new Error('Download aborted'))
    }
    options?.signal?.addEventListener('abort', abortHandler, { once: true })
    try {
      for await (const chunk of nodeStream) {
        downloaded += chunk.length
        if (!fileStream.write(chunk)) {
          await once(fileStream, 'drain')
        }
        const percent = totalBytes > 0 ? (downloaded / totalBytes) * 100 : undefined
        await this.emitProgress(options, {
          phase: 'download',
          downloadedBytes: downloaded,
          totalBytes,
          percent
        })
      }
      fileStream.end()
      await finished(fileStream)
    } catch (error) {
      fileStream.destroy()
      await once(fileStream, 'close').catch(() => {})
      throw error
    } finally {
      options?.signal?.removeEventListener('abort', abortHandler)
    }
  }

  private async verifyChecksum(filePath: string, expected: string): Promise<void> {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('error', reject)
      stream.on('end', () => resolve())
    })
    const actual = hash.digest('hex')
    if (actual !== expected) {
      throw new Error(`Checksum mismatch: expected ${expected}, got ${actual}`)
    }
  }

  private async extractArchive(
    archivePath: string,
    tempDir: string,
    config: ToolPlatformConfig
  ): Promise<string> {
    const extractDir = path.join(tempDir, 'extract')
    await mkdir(extractDir, { recursive: true })

    if (config.archiveType === 'zip') {
      // 使用 yauzl 解壓 zip（輕量級，無外部依賴）
      const yauzl = await import('yauzl')
      const zipfile = await yauzl.open(archivePath, { lazyEntries: true })
      
      await new Promise<void>((resolve, reject) => {
        zipfile.on('entry', (entry) => {
          // 創建目錄
          if (/\/$/.test(entry.fileName)) {
            const dir = path.join(extractDir, entry.fileName)
            mkdir(dir, { recursive: true })
              .catch(() => {})
          } else {
            // 提取文件
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                reject(err)
                return
              }
              const dest = path.join(extractDir, entry.fileName)
              mkdir(path.dirname(dest), { recursive: true })
                .then(() => {
                  const writeStream = createWriteStream(dest)
                  readStream.pipe(writeStream)
                })
            })
          }
        })
        zipfile.on('end', () => resolve())
        zipfile.on('error', reject)
      })
    } else if (config.archiveType === 'tar.xz') {
      // 使用 tar 解壓 tar.xz
      await this.runCommand('tar', ['-xf', archivePath, '-C', extractDir, '-J'])
    }

    const binaryPath = path.join(extractDir, config.binaryRelativePath)
    if (!(await this.pathExists(binaryPath))) {
      throw new Error(`Binary ${config.binaryRelativePath} not found after extraction`)
    }

    // 如果是 ffmpeg 且存在 bin 目錄，需要複製整個目錄
    if (this.options.toolName === 'ffmpeg') {
      const binDir = path.dirname(binaryPath)
      if (await this.pathExists(binDir)) {
        // ffmpeg 需要 ffmpeg.exe + ffprobe.exe + DLLs + 其他文件
        // 返回 bin 目錄路徑，由 swapInBinary 處理
        return binDir
      }
    }

    return binaryPath
  }

  private async swapInBinary(sourcePath: string, targetPath: string): Promise<void> {
    await mkdir(path.dirname(targetPath), { recursive: true })

    // 檢查 sourcePath 是否是目錄（對於 ffmpeg 的 bin 目錄）
    const sourceStats = await import('node:fs/promises').then(fs => fs.stat(sourcePath).catch(() => null))
    const isDirectory = sourceStats?.isDirectory() ?? false

    if (isDirectory) {
      // 複製整個目錄（用於 ffmpeg 的 bin 目錄）
      const tempDir = path.join(
        path.dirname(targetPath),
        `.${path.basename(targetPath)}.${randomUUID()}.tmp`
      )
      await this.copyDirectoryRecursive(sourcePath, tempDir)

      const backupPath = `${targetPath}.bak`
      const targetExists = await this.pathExists(targetPath)
      let backupCreated = false

      if (targetExists) {
        await rm(backupPath, { force: true })
        try {
          await rename(targetPath, backupPath)
        } catch {
          await this.copyDirectoryRecursive(targetPath, backupPath)
          await rm(targetPath, { force: true, recursive: true })
        }
        backupCreated = true
      }

      try {
        await rename(tempDir, targetPath)
        if (backupCreated) {
          await rm(backupPath, { force: true, recursive: true })
        }
      } catch (error) {
        await rm(tempDir, { force: true, recursive: true }).catch(() => {})
        if (backupCreated) {
          await this.copyDirectoryRecursive(backupPath, targetPath)
          await rm(backupPath, { force: true, recursive: true })
        }
        throw error
      }
    } else {
      // 單文件處理（原邏輯）
      const tempTarget = path.join(
        path.dirname(targetPath),
        `${path.basename(targetPath)}.${randomUUID()}.tmp`
      )
      await copyFile(sourcePath, tempTarget)
      if (process.platform !== 'win32') {
        await chmod(tempTarget, 0o755)
      }
      const backupPath = `${targetPath}.bak`
      const targetExists = await this.pathExists(targetPath)
      let backupCreated = false

      if (targetExists) {
        await rm(backupPath, { force: true })
        try {
          await rename(targetPath, backupPath)
        } catch {
          await copyFile(targetPath, backupPath)
          await rm(targetPath, { force: true })
        }
        backupCreated = true
      }

      try {
        await rename(tempTarget, targetPath)
        if (backupCreated) {
          await rm(backupPath, { force: true })
        }
      } catch (error) {
        await rm(tempTarget, { force: true }).catch(() => {})
        if (backupCreated) {
          await rename(backupPath, targetPath).catch(async () => {
            await copyFile(backupPath, targetPath)
            await rm(backupPath, { force: true })
          })
        }
        throw error
      }
    }
  }

  private async copyDirectoryRecursive(source: string, target: string): Promise<void> {
    const { readdir, stat, copyFile, mkdir } = await import('node:fs/promises')
    
    await mkdir(target, { recursive: true })
    const entries = await readdir(source, { withFileTypes: true })

    for (const entry of entries) {
      const srcPath = path.join(source, entry.name)
      const destPath = path.join(target, entry.name)

      if (entry.isDirectory()) {
        await this.copyDirectoryRecursive(srcPath, destPath)
      } else {
        await copyFile(srcPath, destPath)
        // 對非 Windows 的可執行文件設定權限
        if (process.platform !== 'win32' && this.isExecutable(destPath)) {
          await chmod(destPath, 0o755)
        }
      }
    }
  }

  private isExecutable(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase()
    return ['.exe', '.bin', '.sh'].includes(ext)
  }

  private async ensureDiskSpace(dir: string, requiredBytes: number): Promise<void> {
    try {
      const stats = await statfs(dir)
      const available = BigInt(stats.bavail) * BigInt(stats.bsize)
      if (available < BigInt(requiredBytes)) {
        throw new Error('Insufficient disk space for managed download')
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOSYS' || code === 'ENOTSUP' || code === 'EINVAL') {
        return
      }
      throw error instanceof Error ? error : new Error(String(error))
    }
  }

  private async readState(): Promise<ManagedToolState | null> {
    try {
      const content = await readFile(this.statePath, 'utf8')
      const parsed = JSON.parse(content) as ManagedToolState
      return parsed
    } catch {
      return null
    }
  }

  private async writeState(state: ManagedToolState): Promise<void> {
    await mkdir(path.dirname(this.statePath), { recursive: true })
    await writeFile(this.statePath, JSON.stringify(state, null, 2), 'utf8')
  }

  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45_000)
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          'User-Agent': this.userAgent,
          ...(init?.headers ?? {})
        },
        signal: controller.signal
      })
      return response
    } finally {
      clearTimeout(timeout)
    }
  }

  private async getLatestRelease(force = false): Promise<GithubRelease> {
    if (!force && this.releaseCache && this.releaseCache.expiresAt > Date.now()) {
      return this.releaseCache.release
    }
    const response = await this.fetchWithTimeout(
      `https://api.github.com/repos/${this.options.repo}/releases/latest`,
      { headers: { Accept: 'application/vnd.github+json' } }
    )
    if (!response.ok) {
      throw new Error(
        `Failed to fetch latest release for ${this.options.toolName}: ${response.status} ${response.statusText}`
      )
    }
    const release = (await response.json()) as GithubRelease
    this.releaseCache = {
      release,
      expiresAt: Date.now() + this.cacheTtlMs
    }
    return release
  }

  private async runCommand(command: string, args: string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(command, args, { stdio: 'inherit' })
      proc.on('error', reject)
      proc.on('exit', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`${command} exited with code ${code}`))
        }
      })
    })
  }

  private async pathExists(candidate: string): Promise<boolean> {
    try {
      await access(candidate, fsConstants.F_OK)
      return true
    } catch {
      return false
    }
  }

  private async emitProgress(options: ToolDownloadOptions | undefined, update: ToolProgressUpdate): Promise<void> {
    options?.onProgress?.(update)
  }
}
