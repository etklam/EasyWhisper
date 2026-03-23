import { constants as fsConstants } from 'node:fs'
import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  assertWindowsRuntimeManifest,
  DEFAULT_WINDOWS_RUNTIME_VARIANT
} from './windows_runtime_manifest.mjs'

const desktopRoot = process.env.EASYWHISPER_DESKTOP_ROOT
  ? path.resolve(process.env.EASYWHISPER_DESKTOP_ROOT)
  : path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const runtimeDir = path.join(desktopRoot, 'resources', 'win')
const cliPath = path.join(runtimeDir, 'whisper-cli.exe')
const runtimeManifestPath = path.join(runtimeDir, 'runtime-manifest.json')

async function main() {
  await assertReadableFile(cliPath, 'whisper-cli.exe is missing. Run pnpm stage:win:whisper before packaging Windows builds.')
  const runtimeManifest = await readRuntimeManifest()
  const normalizedManifest = assertWindowsRuntimeManifest(runtimeManifest, {
    supportedVariants: [DEFAULT_WINDOWS_RUNTIME_VARIANT]
  })

  const stagedRuntimePaths = normalizedManifest.files.map((fileName) => path.join(runtimeDir, fileName))
  await Promise.all(stagedRuntimePaths.map((filePath) => assertReadableFile(
    filePath,
    `runtime-manifest.json references a missing runtime file: ${path.basename(filePath)}`
  )))
  await assertNoUnmanagedRuntimeFiles(normalizedManifest.files)

  process.stdout.write(`${cliPath}\n${runtimeManifestPath}\n`)
}

async function assertReadableFile(filePath, message) {
  try {
    await access(filePath, fsConstants.R_OK)
  } catch {
    throw new Error(message)
  }
}

async function readRuntimeManifest() {
  let raw
  try {
    raw = await readFile(runtimeManifestPath, 'utf8')
  } catch {
    throw new Error('runtime-manifest.json is missing. Run pnpm stage:win:whisper before packaging Windows builds.')
  }

  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('runtime-manifest.json is not valid JSON.')
  }
}

async function assertNoUnmanagedRuntimeFiles(managedFileNames) {
  const allowedFileNames = new Set([
    'README.md',
    'runtime-manifest.json',
    ...managedFileNames
  ])
  const entries = await readdir(runtimeDir, { withFileTypes: true })

  for (const entry of entries) {
    if (allowedFileNames.has(entry.name)) {
      continue
    }

    throw new Error(`resources/win contains unmanaged runtime file: ${entry.name}. Re-run pnpm stage:win:whisper.`)
  }
}

await main()
