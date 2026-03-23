// @vitest-environment node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(testDir, '../../..')
const packageJsonPath = path.join(desktopRoot, 'package.json')

describe('desktop packaging icon config', () => {
  it('uses generated icon assets and builds them before packaging', async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>
      build?: {
        win?: { icon?: string }
        mac?: { icon?: string }
      }
    }

    expect(packageJson.scripts?.['icons:build']).toBe('node ./scripts/generate_app_icons.mjs')
    expect(packageJson.scripts?.['package:win']).toContain('pnpm run icons:build')
    expect(packageJson.scripts?.['package:win:dir']).toContain('pnpm run icons:build')
    expect(packageJson.scripts?.['package:mac']).toContain('pnpm run icons:build')
    expect(packageJson.scripts?.['package:mac:dir']).toContain('pnpm run icons:build')
    expect(packageJson.build?.win?.icon).toBe('build/icon.ico')
    expect(packageJson.build?.mac?.icon).toBe('build/icon.icns')
  })
})
