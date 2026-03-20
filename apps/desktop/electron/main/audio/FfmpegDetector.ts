import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

import type { FfmpegInstallation } from '@shared/types'
import { getToolsManager } from '../tools'

/**
 * 檢測系統中已安裝的 ffmpeg
 */
export class FfmpegDetector {
  /**
   * 檢測所有可能的 ffmpeg 安裝位置
   */
  async detect(): Promise<FfmpegInstallation> {
    // 1. 檢查 PATH 中的 ffmpeg 命令
    const systemInstall = await this.findSystemCommand()
    if (systemInstall) {
      const version = await this.getVersion(systemInstall.path)
      return {
        type: 'system',
        ...systemInstall,
        version
      }
    }

    // 2. 檢查常見的安裝路徑
    const pathInstall = await this.findInCommonPaths()
    if (pathInstall) {
      const version = await this.getVersion(pathInstall.path)
      return {
        type: 'system',
        ...pathInstall,
        version
      }
    }

    const managedPath = this.getManagedPath()
    if (managedPath && existsSync(managedPath)) {
      const version = await this.getVersion(managedPath)
      return {
        type: 'managed',
        path: managedPath,
        version
      }
    }

    return { type: 'none' }
  }

  /**
   * 通過 which/where 命令找到系統 PATH 中的 ffmpeg
   */
  private async findSystemCommand(): Promise<{ path: string; source: string } | null> {
    const result = spawnSync(
      process.platform === 'win32' ? 'where' : 'which',
      ['ffmpeg'],
      { encoding: 'utf8' }
    )

    if (result.status === 0 && result.stdout) {
      const systemPath = result.stdout.trim().split('\n')[0]
      const source = this.detectInstallationSource(systemPath)
      return { path: systemPath, source }
    }

    return null
  }

  /**
   * 檢查常見的安裝路徑
   */
  private async findInCommonPaths(): Promise<{ path: string; source: string } | null> {
    const commonPaths = this.getCommonPaths()

    for (const { path: checkPath, source } of commonPaths) {
      if (existsSync(checkPath)) {
        // 驗證是否可執行
        const test = spawnSync(checkPath, ['-version'], { timeout: 5000 })
        if (test.status === 0) {
          return { path: checkPath, source }
        }
      }
    }

    return null
  }

  /**
   * 根據平台返回常見的安裝路徑
   */
  private getCommonPaths(): Array<{ path: string; source: string }> {
    const paths: Array<{ path: string; source: string }> = []

    if (process.platform === 'darwin') {
      // macOS
      paths.push(
        { path: '/opt/homebrew/bin/ffmpeg', source: 'homebrew' },
        { path: '/usr/local/bin/ffmpeg', source: 'homebrew' },
        { path: '/opt/homebrew/opt/ffmpeg/bin/ffmpeg', source: 'homebrew' },
        { path: '/usr/local/opt/ffmpeg/bin/ffmpeg', source: 'homebrew' }
      )
    } else if (process.platform === 'linux') {
      // Linux
      paths.push(
        { path: '/usr/bin/ffmpeg', source: 'apt' },
        { path: '/usr/local/bin/ffmpeg', source: 'manual' },
        { path: path.join(process.env.HOME!, '/.local/bin/ffmpeg'), source: 'pip' }
      )
    } else if (process.platform === 'win32') {
      // Windows
      paths.push(
        { path: path.join(process.env.LOCALAPPDATA!, 'Programs', 'ffmpeg', 'ffmpeg.exe'), source: 'manual' },
        { path: path.join(process.env.PROGRAMFILES!, 'ffmpeg', 'bin', 'ffmpeg.exe'), source: 'manual' },
        { path: path.join(process.env.PROGRAMFILES!, 'FFmpeg', 'bin', 'ffmpeg.exe'), source: 'manual' }
      )
    }

    return paths
  }

  /**
   * 根據路徑推斷安裝來源
   */
  private detectInstallationSource(filePath: string): string {
    const lowerPath = filePath.toLowerCase()

    if (lowerPath.includes('homebrew')) {
      return 'homebrew'
    }
    if (lowerPath.includes('python') || lowerPath.includes('pip')) {
      return 'pip'
    }
    if (lowerPath.includes('/usr/bin/')) {
      return 'apt'
    }
    if (lowerPath.includes('/usr/local/bin/')) {
      return 'manual'
    }

    return 'manual'
  }

  /**
   * 獲取 ffmpeg 版本
   */
  private async getVersion(ffmpegPath: string): Promise<string> {
    try {
      const result = spawnSync(ffmpegPath, ['-version'], {
        encoding: 'utf8',
        timeout: 5000
      })

      if (result.status === 0 && result.stdout) {
        // 從輸出中提取版本號
        const match = result.stdout.match(/ffmpeg version ([^\s]+)/)
        return match ? match[1] : 'unknown'
      }

      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  private getManagedPath(): string | null {
    try {
      return getToolsManager().getFfmpegManager().getManagedBinaryPath()
    } catch {
      return null
    }
  }
}

/**
 * 快速檢查是否有系統 ffmpeg 可用
 */
export async function hasSystemFfmpeg(): Promise<boolean> {
  const detector = new FfmpegDetector()
  const result = await detector.detect()
  return result.type !== 'none'
}
