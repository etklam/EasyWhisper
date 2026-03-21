import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { ExpiringValueCache } from '../utils'

type JsRuntimeName = 'deno' | 'node' | 'bun'
const DETECTION_CACHE_TTL_MS = 30_000
const runtimeDetectionCache = new ExpiringValueCache<string[]>(DETECTION_CACHE_TTL_MS)

const COMMON_RUNTIME_PATHS: Record<NodeJS.Platform, Record<JsRuntimeName, string[]>> = {
  darwin: {
    deno: ['/opt/homebrew/bin/deno', '/usr/local/bin/deno'],
    node: ['/opt/homebrew/bin/node', '/usr/local/bin/node'],
    bun: ['/opt/homebrew/bin/bun', '/usr/local/bin/bun']
  },
  linux: {
    deno: ['/usr/local/bin/deno', '/usr/bin/deno'],
    node: ['/usr/local/bin/node', '/usr/bin/node'],
    bun: ['/usr/local/bin/bun', '/usr/bin/bun']
  },
  win32: {
    deno: [
      path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages', 'DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe', 'deno.exe'),
      path.join(process.env.USERPROFILE ?? '', '.deno', 'bin', 'deno.exe')
    ],
    node: [
      path.join(process.env.PROGRAMFILES ?? '', 'nodejs', 'node.exe'),
      path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'nodejs', 'node.exe')
    ],
    bun: [path.join(process.env.USERPROFILE ?? '', '.bun', 'bin', 'bun.exe')]
  },
  aix: { deno: [], node: [], bun: [] },
  android: { deno: [], node: [], bun: [] },
  freebsd: { deno: [], node: [], bun: [] },
  haiku: { deno: [], node: [], bun: [] },
  openbsd: { deno: [], node: [], bun: [] },
  sunos: { deno: [], node: [], bun: [] },
  cygwin: { deno: [], node: [], bun: [] },
  netbsd: { deno: [], node: [], bun: [] }
}

export function detectSupportedJsRuntimes(options: { forceRefresh?: boolean } = {}): Promise<string[]> {
  return runtimeDetectionCache.get(async () => {
    const runtimes: JsRuntimeName[] = ['deno', 'node', 'bun']

    return runtimes
      .map((runtime) => {
        const runtimePath = resolveRuntimePath(runtime)
        return runtimePath ? `${runtime}:${runtimePath}` : null
      })
      .filter((runtime): runtime is string => runtime !== null)
  }, options)
}

export function invalidateJsRuntimeDetectionCache(): void {
  runtimeDetectionCache.invalidate()
}

function resolveRuntimePath(runtime: JsRuntimeName): string | null {
  const commandPath = findSystemCommand(runtime)
  if (commandPath) {
    return commandPath
  }

  const commonPaths = COMMON_RUNTIME_PATHS[process.platform]?.[runtime] ?? []
  for (const candidate of commonPaths) {
    if (candidate && existsSync(candidate) && isWorkingRuntime(candidate)) {
      return candidate
    }
  }

  return null
}

function findSystemCommand(command: string): string | null {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], {
    encoding: 'utf8',
    timeout: 5000
  })

  if (result.status === 0 && result.stdout) {
    const resolved = result.stdout.trim().split(/\r?\n/)[0]
    if (resolved && isWorkingRuntime(resolved)) {
      return resolved
    }
  }

  return null
}

function isWorkingRuntime(runtimePath: string): boolean {
  try {
    const result = spawnSync(runtimePath, ['--version'], {
      encoding: 'utf8',
      timeout: 5000
    })
    return result.status === 0
  } catch {
    return false
  }
}
