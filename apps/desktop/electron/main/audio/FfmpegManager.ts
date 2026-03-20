import { spawnSync } from 'node:child_process'
import path from 'node:path'

import type { FfmpegInstallation } from '@shared/types'
import {
  BaseToolManager,
  type ManagedToolState,
  type ToolDownloadOptions,
  type ToolPlatformConfig,
  type ToolProgressUpdate
} from '../tools/BaseToolManager'

const PLATFORM_CONFIGS: Record<'darwin' | 'linux' | 'win32', ToolPlatformConfig> = {
  darwin: {
    assetName: 'ffmpeg-master-latest-macos64-gpl.zip',
    archiveType: 'zip',
    binaryRelativePath: path.join('ffmpeg-master-latest-macos64-gpl', 'bin', 'ffmpeg'),
    finalFileName: 'ffmpeg'
  },
  linux: {
    assetName: 'ffmpeg-master-latest-linux64-gpl.tar.xz',
    archiveType: 'tar.xz',
    binaryRelativePath: path.join('ffmpeg-master-latest-linux64-gpl', 'bin', 'ffmpeg'),
    finalFileName: 'ffmpeg'
  },
  win32: {
    assetName: 'ffmpeg-master-latest-win64-gpl.zip',
    archiveType: 'zip',
    binaryRelativePath: path.join('ffmpeg-master-latest-win64-gpl', 'bin', 'ffmpeg.exe'),
    finalFileName: 'ffmpeg.exe'
  }
}

export type FfmpegProgressUpdate = ToolProgressUpdate
export type FfmpegDownloadOptions = ToolDownloadOptions

export interface FfmpegManagerOptions {
  userDataDir: string
}

export class FfmpegManager extends BaseToolManager<FfmpegInstallation> {
  constructor(options: FfmpegManagerOptions) {
    super({
      userDataDir: options.userDataDir,
      toolName: 'ffmpeg',
      repo: 'yt-dlp/FFmpeg-Builds',
      checksumAssetName: 'sha256sums.txt',
      platformConfigs: PLATFORM_CONFIGS
    })
  }

  async downloadManaged(options?: FfmpegDownloadOptions): Promise<FfmpegInstallation> {
    return this.download(options)
  }

  async updateManaged(options?: FfmpegDownloadOptions): Promise<FfmpegInstallation> {
    return this.update(options)
  }

  async getManagedInfo(): Promise<FfmpegInstallation> {
    const info = await this.getInstalledInfo()
    return info ?? { type: 'none' }
  }

  getManagedBinaryPath(): string {
    return this.getBinaryPath()
  }

  protected override async describeInstallation(state: ManagedToolState): Promise<FfmpegInstallation> {
    const version = await this.resolveVersion(state.binaryPath, state.version)
    return {
      type: 'managed',
      path: state.binaryPath,
      version,
      source: 'managed'
    }
  }

  private async resolveVersion(binaryPath: string, fallback?: string): Promise<string> {
    try {
      const result = spawnSync(binaryPath, ['-version'], { encoding: 'utf8', timeout: 5000 })
      if (result.status === 0 && result.stdout.trim()) {
        const match = result.stdout.match(/ffmpeg version ([^\s]+)/)
        return match?.[1] ?? result.stdout.trim().split(/\s+/)[2] ?? fallback ?? 'unknown'
      }
    } catch {
      // ignore and fallback
    }
    return fallback ?? 'unknown'
  }
}
