import { spawnSync } from 'node:child_process'

import type { YtDlpInstallation } from '@shared/types'
import {
  BaseToolManager,
  type ManagedToolState,
  type ToolDownloadOptions,
  type ToolProgressUpdate,
  type ToolPlatformConfig
} from '../tools/BaseToolManager'

const PLATFORM_CONFIGS: Record<'darwin' | 'linux' | 'win32', ToolPlatformConfig> = {
  darwin: {
    assetName: 'yt-dlp_macos',
    archiveType: 'none',
    binaryRelativePath: 'yt-dlp_macos',
    finalFileName: 'yt-dlp'
  },
  linux: {
    assetName: 'yt-dlp',
    archiveType: 'none',
    binaryRelativePath: 'yt-dlp',
    finalFileName: 'yt-dlp'
  },
  win32: {
    assetName: 'yt-dlp.exe',
    archiveType: 'none',
    binaryRelativePath: 'yt-dlp.exe',
    finalFileName: 'yt-dlp.exe'
  }
}

export type YtDlpProgressUpdate = ToolProgressUpdate
export type YtDlpDownloadOptions = ToolDownloadOptions

export interface YtDlpManagerOptions {
  userDataDir: string
}

export class YtDlpManager extends BaseToolManager<YtDlpInstallation> {
  constructor(options: YtDlpManagerOptions) {
    super({
      userDataDir: options.userDataDir,
      toolName: 'yt-dlp',
      repo: 'yt-dlp/yt-dlp',
      checksumAssetName: 'SHA2-256SUMS',
      platformConfigs: PLATFORM_CONFIGS
    })
  }

  async downloadManaged(options?: YtDlpDownloadOptions): Promise<YtDlpInstallation> {
    return this.download(options)
  }

  async updateManaged(options?: YtDlpDownloadOptions): Promise<YtDlpInstallation> {
    return this.update(options)
  }

  async getManagedInfo(): Promise<YtDlpInstallation> {
    const info = await this.getInstalledInfo()
    return info ?? { type: 'none' }
  }

  getManagedBinaryPath(): string {
    return this.getBinaryPath()
  }

  protected override async describeInstallation(state: ManagedToolState): Promise<YtDlpInstallation> {
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
      const result = spawnSync(binaryPath, ['--version'], { encoding: 'utf8', timeout: 5000 })
      if (result.status === 0 && result.stdout.trim()) {
        return result.stdout.trim()
      }
    } catch {
      // ignore and fallback
    }
    return fallback ?? 'unknown'
  }
}
