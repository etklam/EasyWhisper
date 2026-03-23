// @vitest-environment node

import { execFile as execFileCallback } from 'node:child_process'
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFileCallback)
const testDir = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(testDir, '../../..')
const desktopPackageJsonPath = path.join(desktopRoot, 'package.json')
const stageScriptPath = path.join(desktopRoot, 'scripts', 'stage_windows_whisper_runtime.mjs')
const verifyScriptPath = path.join(desktopRoot, 'scripts', 'verify_windows_whisper_runtime.mjs')

const tempRoots: string[] = []

afterEach(async () => {
  while (tempRoots.length > 0) {
    const tempRoot = tempRoots.pop()
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true })
    }
  }
})

describe('windows whisper runtime scripts', () => {
  it('keeps Windows packaging scripts on the verified signAndEditExecutable workaround', async () => {
    const packageJson = JSON.parse(await readFile(desktopPackageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['package:win:dir']).toContain('--config.win.signAndEditExecutable=false')
    expect(packageJson.scripts?.['package:win']).toContain('--config.win.signAndEditExecutable=false')
  })

  it('stages whisper-cli.exe and updates versions metadata', async () => {
    const desktopSandbox = await createDesktopSandbox()
    const runtimeDir = path.join(desktopSandbox, 'resources', 'win')
    const versionsPath = path.join(desktopSandbox, 'resources', 'versions.json')
    const manifestPath = runtimeManifestPathFor(desktopSandbox)
    const sourceDir = await createTempDir('easywhisper-stage-win-source-')

    await writeFile(path.join(sourceDir, 'whisper-cli.exe'), 'cli-binary', 'utf8')

    await execFileAsync(process.execPath, [stageScriptPath, '--source', sourceDir, '--version', '1.7.3'], {
      cwd: desktopRoot,
      env: {
        ...process.env,
        EASYWHISPER_DESKTOP_ROOT: desktopSandbox
      }
    })

    await expect(access(path.join(runtimeDir, 'whisper-cli.exe'))).resolves.toBeUndefined()

    const stagedCli = await readFile(path.join(runtimeDir, 'whisper-cli.exe'), 'utf8')
    expect(stagedCli).toBe('cli-binary')

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
    expect(manifest).toEqual({
      platform: 'win32',
      variant: 'vulkan',
      files: ['whisper-cli.exe']
    })

    const versions = JSON.parse(await readFile(versionsPath, 'utf8')) as Record<string, unknown>
    expect(versions['whisper-cli']).toEqual({
      version: '1.7.3',
      platform: 'win32',
      variant: 'vulkan',
      notes: expect.stringContaining('whisper-cli.exe')
    })
  })

  it('removes stale Windows whisper metadata entries while preserving unrelated tool versions', async () => {
    const desktopSandbox = await createDesktopSandbox()
    const versionsPath = path.join(desktopSandbox, 'resources', 'versions.json')
    const sourceDir = await createTempDir('easywhisper-stage-win-source-')

    await writeFile(path.join(sourceDir, 'whisper-cli.exe'), 'cli-binary', 'utf8')
    await writeFile(
      versionsPath,
      `${JSON.stringify({
        'whisper-cli-legacy': {
          version: '0.9.0',
          platform: 'win32',
          variant: 'wrapper',
          notes: 'stale windows runtime metadata'
        },
        ffmpeg: {
          version: '7.1',
          build: 'static-lgpl'
        }
      }, null, 2)}\n`,
      'utf8'
    )

    await execFileAsync(process.execPath, [stageScriptPath, '--source', sourceDir, '--version', '1.7.3'], {
      cwd: desktopRoot,
      env: {
        ...process.env,
        EASYWHISPER_DESKTOP_ROOT: desktopSandbox
      }
    })

    const versions = JSON.parse(await readFile(versionsPath, 'utf8')) as Record<string, unknown>
    expect(Object.keys(versions).sort((left, right) => left.localeCompare(right))).toEqual(['ffmpeg', 'whisper-cli'])
    expect(versions.ffmpeg).toEqual({
      version: '7.1',
      build: 'static-lgpl'
    })
  })

  it('replaces stale runtime artifacts while preserving repo-owned README.md', async () => {
    const desktopSandbox = await createDesktopSandbox()
    const runtimeDir = path.join(desktopSandbox, 'resources', 'win')
    const manifestPath = runtimeManifestPathFor(desktopSandbox)
    const sourceDir = await createTempDir('easywhisper-stage-win-source-')

    await writeFile(path.join(sourceDir, 'whisper-cli.exe'), 'cli-binary-v2', 'utf8')
    await writeFile(path.join(sourceDir, 'ggml-vulkan.dll'), 'fresh-runtime-dll', 'utf8')
    await writeFile(path.join(runtimeDir, 'stale-runtime.dll'), 'stale-runtime-dll', 'utf8')

    await execFileAsync(process.execPath, [stageScriptPath, '--source', sourceDir, '--version', '1.7.4'], {
      cwd: desktopRoot,
      env: {
        ...process.env,
        EASYWHISPER_DESKTOP_ROOT: desktopSandbox
      }
    })

    await expect(access(path.join(runtimeDir, 'README.md'))).resolves.toBeUndefined()
    await expect(access(path.join(runtimeDir, 'ggml-vulkan.dll'))).resolves.toBeUndefined()
    await expect(access(path.join(runtimeDir, 'stale-runtime.dll'))).rejects.toThrow()

    const stagedDependency = await readFile(path.join(runtimeDir, 'ggml-vulkan.dll'), 'utf8')
    expect(stagedDependency).toBe('fresh-runtime-dll')

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      files: string[]
    }
    expect(manifest.files).toEqual(['ggml-vulkan.dll', 'whisper-cli.exe'])
  })

  it('ignores stale wrapper artifacts and source manifests when staging the current CLI runtime', async () => {
    const desktopSandbox = await createDesktopSandbox()
    const runtimeDir = path.join(desktopSandbox, 'resources', 'win')
    const manifestPath = runtimeManifestPathFor(desktopSandbox)
    const sourceDir = await createTempDir('easywhisper-stage-win-source-')
    const legacyWrapperCliName = ['Whisper', 'CLI.exe'].join('')
    const legacyWrapperDllName = ['whisper', '.dll'].join('')

    await writeFile(path.join(sourceDir, 'whisper-cli.exe'), 'cli-binary', 'utf8')
    await writeFile(path.join(sourceDir, 'ggml-vulkan.dll'), 'fresh-runtime-dll', 'utf8')
    await writeFile(path.join(sourceDir, legacyWrapperCliName), 'legacy-wrapper-cli', 'utf8')
    await writeFile(path.join(sourceDir, legacyWrapperDllName), 'legacy-wrapper-dll', 'utf8')
    await writeFile(
      path.join(sourceDir, 'runtime-manifest.json'),
      `${JSON.stringify({
        platform: 'win32',
        variant: 'wrapper',
        files: [legacyWrapperCliName, legacyWrapperDllName]
      }, null, 2)}\n`,
      'utf8'
    )

    await execFileAsync(process.execPath, [stageScriptPath, '--source', sourceDir, '--version', '1.7.4'], {
      cwd: desktopRoot,
      env: {
        ...process.env,
        EASYWHISPER_DESKTOP_ROOT: desktopSandbox
      }
    })

    await expect(access(path.join(runtimeDir, 'whisper-cli.exe'))).resolves.toBeUndefined()
    await expect(access(path.join(runtimeDir, 'ggml-vulkan.dll'))).resolves.toBeUndefined()
    await expect(access(path.join(runtimeDir, legacyWrapperCliName))).rejects.toThrow()
    await expect(access(path.join(runtimeDir, legacyWrapperDllName))).rejects.toThrow()

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      variant: string
      files: string[]
    }
    expect(manifest.variant).toBe('vulkan')
    expect(manifest.files).toEqual(['ggml-vulkan.dll', 'whisper-cli.exe'])
  })

  it('passes preflight verification when whisper runtime files are staged and recorded in the manifest', async () => {
    const desktopSandbox = await createDesktopSandbox()
    const runtimeDir = path.join(desktopSandbox, 'resources', 'win')
    const versionsPath = path.join(desktopSandbox, 'resources', 'versions.json')

    await writeFile(path.join(runtimeDir, 'whisper-cli.exe'), 'cli-binary', 'utf8')
    await writeFile(path.join(runtimeDir, 'ggml-vulkan.dll'), 'runtime-dll', 'utf8')
    await writeFile(
      runtimeManifestPathFor(desktopSandbox),
      `${JSON.stringify({
        platform: 'win32',
        variant: 'vulkan',
        files: ['ggml-vulkan.dll', 'whisper-cli.exe']
      }, null, 2)}\n`,
      'utf8'
    )
    await writeFile(
      versionsPath,
      `${JSON.stringify({
        'whisper-cli': {
          version: '1.7.3',
          platform: 'win32',
          variant: 'vulkan',
          notes: 'staged for packaging'
        }
      }, null, 2)}\n`,
      'utf8'
    )

    await expect(
      execFileAsync(process.execPath, [verifyScriptPath], {
        cwd: desktopRoot,
        env: {
          ...process.env,
          EASYWHISPER_DESKTOP_ROOT: desktopSandbox
        }
      })
    ).resolves.toMatchObject({
      stdout: expect.stringContaining('whisper-cli.exe')
    })
  })

  it('fails preflight verification when the runtime manifest has not been staged', async () => {
    const desktopSandbox = await createDesktopSandbox()
    const runtimeDir = path.join(desktopSandbox, 'resources', 'win')
    const versionsPath = path.join(desktopSandbox, 'resources', 'versions.json')

    await writeFile(path.join(runtimeDir, 'whisper-cli.exe'), 'cli-binary', 'utf8')
    await writeFile(
      versionsPath,
      `${JSON.stringify({
        'whisper-cli': {
          version: '1.7.3',
          platform: 'win32',
          variant: 'vulkan',
          notes: 'staged for packaging'
        }
      }, null, 2)}\n`,
      'utf8'
    )

    await expect(
      execFileAsync(process.execPath, [verifyScriptPath], {
        cwd: desktopRoot,
        env: {
          ...process.env,
          EASYWHISPER_DESKTOP_ROOT: desktopSandbox
        }
      })
    ).rejects.toThrow('runtime-manifest.json is missing')
  })

  it('fails preflight verification when unmanaged legacy runtime artifacts remain in resources/win', async () => {
    const desktopSandbox = await createDesktopSandbox()
    const runtimeDir = path.join(desktopSandbox, 'resources', 'win')
    const versionsPath = path.join(desktopSandbox, 'resources', 'versions.json')
    const legacyWrapperCliName = ['Whisper', 'CLI.exe'].join('')

    await writeFile(path.join(runtimeDir, 'whisper-cli.exe'), 'cli-binary', 'utf8')
    await writeFile(path.join(runtimeDir, 'ggml-vulkan.dll'), 'runtime-dll', 'utf8')
    await writeFile(path.join(runtimeDir, legacyWrapperCliName), 'legacy-wrapper-cli', 'utf8')
    await writeFile(
      runtimeManifestPathFor(desktopSandbox),
      `${JSON.stringify({
        platform: 'win32',
        variant: 'vulkan',
        files: ['ggml-vulkan.dll', 'whisper-cli.exe']
      }, null, 2)}\n`,
      'utf8'
    )
    await writeFile(
      versionsPath,
      `${JSON.stringify({
        'whisper-cli': {
          version: '1.7.3',
          platform: 'win32',
          variant: 'vulkan',
          notes: 'staged for packaging'
        }
      }, null, 2)}\n`,
      'utf8'
    )

    await expect(
      execFileAsync(process.execPath, [verifyScriptPath], {
        cwd: desktopRoot,
        env: {
          ...process.env,
          EASYWHISPER_DESKTOP_ROOT: desktopSandbox
        }
      })
    ).rejects.toThrow(`resources/win contains unmanaged runtime file: ${legacyWrapperCliName}`)
  })

  it('fails preflight verification when whisper-cli.exe has not been staged for Windows packaging', async () => {
    const desktopSandbox = await createDesktopSandbox()
    const versionsPath = path.join(desktopSandbox, 'resources', 'versions.json')

    await writeFile(
      versionsPath,
      `${JSON.stringify({
        'whisper-cli': {
          version: '1.7.3',
          platform: 'win32',
          variant: 'vulkan',
          notes: 'staged for packaging'
        }
      }, null, 2)}\n`,
      'utf8'
    )

    await expect(
      execFileAsync(process.execPath, [verifyScriptPath], {
        cwd: desktopRoot,
        env: {
          ...process.env,
          EASYWHISPER_DESKTOP_ROOT: desktopSandbox
        }
      })
    ).rejects.toThrow('whisper-cli.exe is missing')
  })
})

async function createDesktopSandbox(): Promise<string> {
  const desktopSandbox = await createTempDir('easywhisper-desktop-sandbox-')
  const resourcesDir = path.join(desktopSandbox, 'resources')
  const runtimeDir = path.join(resourcesDir, 'win')

  await mkdir(runtimeDir, { recursive: true })
  await writeFile(path.join(runtimeDir, 'README.md'), 'runtime readme', 'utf8')
  await writeFile(versionsPathFor(desktopSandbox), '{}\n', 'utf8')

  return desktopSandbox
}

async function createTempDir(prefix: string): Promise<string> {
  const tempRoot = await mkdtemp(path.join(tmpdir(), prefix))
  tempRoots.push(tempRoot)
  return tempRoot
}

function versionsPathFor(desktopSandbox: string): string {
  return path.join(desktopSandbox, 'resources', 'versions.json')
}

function runtimeManifestPathFor(desktopSandbox: string): string {
  return path.join(desktopSandbox, 'resources', 'win', 'runtime-manifest.json')
}
