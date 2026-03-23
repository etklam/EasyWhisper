import { constants as fsConstants } from 'node:fs'
import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = process.env.EASYWHISPER_DESKTOP_ROOT
  ? path.resolve(process.env.EASYWHISPER_DESKTOP_ROOT)
  : path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const runtimeDir = path.join(desktopRoot, 'resources', 'win')
const versionsPath = path.join(desktopRoot, 'resources', 'versions.json')
const cliPath = path.join(runtimeDir, 'whisper-cli.exe')
const runtimeManifestPath = path.join(runtimeDir, 'runtime-manifest.json')

async function main() {
  await assertReadableFile(cliPath, 'whisper-cli.exe is missing. Run pnpm stage:win:whisper before packaging Windows builds.')
  const runtimeManifest = await readRuntimeManifest()

  const versions = await readVersions()
  const whisperCli = versions['whisper-cli']

  if (!whisperCli || typeof whisperCli !== 'object') {
    throw new Error('versions.json is missing the whisper-cli entry required for Windows packaging.')
  }

  if (whisperCli.platform !== 'win32') {
    throw new Error('versions.json whisper-cli entry must target platform win32 for Windows packaging.')
  }

  if (whisperCli.variant !== 'vulkan') {
    throw new Error('versions.json whisper-cli entry must declare variant "vulkan" for the current Windows runtime.')
  }

  assertRuntimeManifest(runtimeManifest)

  const stagedRuntimePaths = runtimeManifest.files.map((fileName) => path.join(runtimeDir, fileName))
  await Promise.all(stagedRuntimePaths.map((filePath) => assertReadableFile(
    filePath,
    `runtime-manifest.json references a missing runtime file: ${path.basename(filePath)}`
  )))
  await assertNoUnmanagedRuntimeFiles(runtimeManifest.files)

  process.stdout.write(`${cliPath}\n${runtimeManifestPath}\n`)
}

async function assertReadableFile(filePath, message) {
  try {
    await access(filePath, fsConstants.R_OK)
  } catch {
    throw new Error(message)
  }
}

async function readVersions() {
  let raw
  try {
    raw = await readFile(versionsPath, 'utf8')
  } catch {
    throw new Error('versions.json is missing. Run pnpm stage:win:whisper before packaging Windows builds.')
  }

  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('versions.json is not valid JSON.')
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

function assertRuntimeManifest(runtimeManifest) {
  if (!runtimeManifest || typeof runtimeManifest !== 'object') {
    throw new Error('runtime-manifest.json must contain an object payload.')
  }

  if (runtimeManifest.platform !== 'win32') {
    throw new Error('runtime-manifest.json must target platform win32 for Windows packaging.')
  }

  if (runtimeManifest.variant !== 'vulkan') {
    throw new Error('runtime-manifest.json must declare variant "vulkan" for the current Windows runtime.')
  }

  if (!Array.isArray(runtimeManifest.files) || runtimeManifest.files.length === 0) {
    throw new Error('runtime-manifest.json must declare at least one staged runtime file.')
  }

  if (!runtimeManifest.files.every((fileName) => typeof fileName === 'string' && fileName.length > 0)) {
    throw new Error('runtime-manifest.json files entries must be non-empty strings.')
  }

  if (!runtimeManifest.files.includes('whisper-cli.exe')) {
    throw new Error('runtime-manifest.json must include whisper-cli.exe.')
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
