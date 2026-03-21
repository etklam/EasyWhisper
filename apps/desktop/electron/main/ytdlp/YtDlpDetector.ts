import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

import type { YtDlpInstallation } from '@shared/types'
import { getToolsManager } from '../tools'
import { ExpiringValueCache } from '../utils'

const DETECTION_CACHE_TTL_MS = 30_000
const detectionCache = new ExpiringValueCache<YtDlpInstallation>(DETECTION_CACHE_TTL_MS)

/**
 * 檢測系統中已安裝的 yt-dlp
 * 返回找到的路徑和版本信息
 */
export class YtDlpDetector {
  /**
   * 檢測所有可能的 yt-dlp 安裝位置
   */
  async detect(options: { forceRefresh?: boolean } = {}): Promise<YtDlpInstallation> {
    return detectionCache.get(async () => this.runDetection(), options)
  }

  invalidateCache(): void {
    detectionCache.invalidate()
  }

  private async runDetection(): Promise<YtDlpInstallation> {
    // 1. 檢查 PATH 中的 yt-dlp 命令
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

    // 3. 檢查管理版本（下載到 userData 的版本）
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
   * 通過 which/where 命令找到系統 PATH 中的 yt-dlp
   */
  private async findSystemCommand(): Promise<{ path: string; source: string } | null> {
    const result = spawnSync(
      process.platform === 'win32' ? 'where' : 'which',
      ['yt-dlp'],
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

    for (const { path: checkPathPattern, source } of commonPaths) {
      for (const checkPath of expandPathPattern(checkPathPattern)) {
        if (!existsSync(checkPath)) {
          continue
        }
        // 驗證是否可執行
        const test = spawnSync(checkPath, ['--version'], { timeout: 5000 })
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
        { path: '/opt/homebrew/bin/yt-dlp', source: 'homebrew' },
        { path: '/usr/local/bin/yt-dlp', source: 'homebrew' },
        { path: '/opt/homebrew/opt/yt-dlp/bin/yt-dlp', source: 'homebrew' },
        { path: '/usr/local/opt/yt-dlp/bin/yt-dlp', source: 'homebrew' },
        { path: path.join(process.env.HOME!, '/Library/Python/3.*/bin/yt-dlp'), source: 'pip' },
        { path: '/opt/homebrew/bin/python3', source: 'pip' }, // 可能需要通過 python -m yt_dlp
        { path: '/usr/local/bin/python3', source: 'pip' }
      )
    } else if (process.platform === 'linux') {
      // Linux
      paths.push(
        { path: '/usr/bin/yt-dlp', source: 'apt' },
        { path: '/usr/local/bin/yt-dlp', source: 'manual' },
        { path: path.join(process.env.HOME!, '/.local/bin/yt-dlp'), source: 'pip' },
        { path: path.join(process.env.HOME!, '/bin/yt-dlp'), source: 'manual' }
      )
    } else if (process.platform === 'win32') {
      // Windows
      paths.push(
        { path: path.join(process.env.LOCALAPPDATA!, 'Programs', 'Python', 'Python3*', 'Scripts', 'yt-dlp.exe'), source: 'pip' },
        { path: path.join(process.env.APPDATA!, 'Python', 'Python3*', 'Scripts', 'yt-dlp.exe'), source: 'pip' },
        { path: path.join(process.env.USERPROFILE!, 'AppData', 'Local', 'Programs', 'yt-dlp', 'yt-dlp.exe'), source: 'manual' }
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
      return 'apt' // 或其他包管理器
    }
    if (lowerPath.includes('/usr/local/bin/')) {
      return 'manual'
    }

    return 'manual'
  }

  /**
   * 獲取 yt-dlp 版本
   */
  private async getVersion(ytDlpPath: string): Promise<string> {
    try {
      const result = spawnSync(ytDlpPath, ['--version'], {
        encoding: 'utf8',
        timeout: 5000
      })

      if (result.status === 0 && result.stdout) {
        return result.stdout.trim()
      }

      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  /**
   * 獲取管理版本的安裝路徑
   */
  private getManagedPath(): string | null {
    try {
      return getToolsManager().getYtDlpManager().getManagedBinaryPath()
    } catch {
      return null
    }
  }
}

export function expandPathPattern(pattern: string): string[] {
  const normalized = path.normalize(pattern)
  if (!/[*?]/.test(normalized)) {
    return [normalized]
  }

  const parsed = path.parse(normalized)
  const segments = normalized.slice(parsed.root.length).split(path.sep).filter(Boolean)
  let candidates = [parsed.root || '.']

  for (const segment of segments) {
    if (!/[*?]/.test(segment)) {
      candidates = candidates.map((base) => path.join(base, segment))
      continue
    }

    const matcher = wildcardToRegExp(segment)
    const next: string[] = []

    for (const base of candidates) {
      try {
        const entries = readdirSync(base, { withFileTypes: true })
        for (const entry of entries) {
          if (matcher.test(entry.name)) {
            next.push(path.join(base, entry.name))
          }
        }
      } catch {
        // Ignore unreadable/non-existent path prefixes.
      }
    }

    candidates = next
  }

  return candidates
}

function wildcardToRegExp(segment: string): RegExp {
  const escaped = segment.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
  return new RegExp(`^${escaped.replaceAll('*', '.*')}$`, 'i')
}

/**
 * 快速檢查是否有系統 yt-dlp 可用
 */
export async function hasSystemYtDlp(): Promise<boolean> {
  const detector = new YtDlpDetector()
  const result = await detector.detect()
  return result.type !== 'none'
}
