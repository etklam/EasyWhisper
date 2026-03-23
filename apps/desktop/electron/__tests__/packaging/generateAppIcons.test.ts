// @vitest-environment node

import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFileCallback)
const testDir = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(testDir, '../../..')
const scriptPath = path.join(desktopRoot, 'scripts', 'generate_app_icons.mjs')

const tempRoots: string[] = []

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (root) {
      await rm(root, { recursive: true, force: true })
    }
  }
})

describe('generate_app_icons', () => {
  it('generates ico and icns from build/icon.svg', async () => {
    const sandboxRoot = await createDesktopSandbox()
    const buildDir = path.join(sandboxRoot, 'build')
    const icoPath = path.join(buildDir, 'icon.ico')
    const icnsPath = path.join(buildDir, 'icon.icns')

    await writeFile(path.join(buildDir, 'icon.svg'), SAMPLE_ICON_SVG, 'utf8')

    await execFileAsync(process.execPath, [scriptPath], {
      cwd: desktopRoot,
      env: {
        ...process.env,
        EASYWHISPER_DESKTOP_ROOT: sandboxRoot
      }
    })

    await expect(stat(icoPath)).resolves.toMatchObject({
      size: expect.any(Number)
    })
    await expect(stat(icnsPath)).resolves.toMatchObject({
      size: expect.any(Number)
    })

    const ico = await readFile(icoPath)
    const icns = await readFile(icnsPath)
    expect(ico.byteLength).toBeGreaterThan(0)
    expect(icns.byteLength).toBeGreaterThan(0)
    expect(icns.includes(Buffer.from('ic09'))).toBe(true)
    expect(icns.includes(Buffer.from('ic10'))).toBe(true)
  })

  it('fails clearly when build/icon.svg is missing', async () => {
    const sandboxRoot = await createDesktopSandbox()

    await expect(
      execFileAsync(process.execPath, [scriptPath], {
        cwd: desktopRoot,
        env: {
          ...process.env,
          EASYWHISPER_DESKTOP_ROOT: sandboxRoot
        }
      })
    ).rejects.toThrow('build/icon.svg is missing')
  })
})

async function createDesktopSandbox(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'easywhisper-icon-build-'))
  tempRoots.push(root)
  await mkdir(path.join(root, 'build'), { recursive: true })
  return root
}

const SAMPLE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect x="32" y="32" width="448" height="448" rx="108" fill="#0f3d4c"/>
  <rect x="212" y="134" width="88" height="172" rx="44" fill="#f8fafc"/>
  <rect x="192" y="318" width="128" height="28" rx="14" fill="#f8fafc"/>
  <rect x="236" y="344" width="40" height="44" rx="20" fill="#f8fafc"/>
  <rect x="184" y="386" width="144" height="26" rx="13" fill="#f8fafc"/>
  <polygon points="280,176 392,120 360,220 446,244 292,314 326,240 252,228" fill="#22c7d6"/>
</svg>`
