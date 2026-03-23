import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildWindowsRuntimeManifest,
  DEFAULT_WINDOWS_RUNTIME_VARIANT,
  isWindowsRuntimeManagedFile,
  isWindowsRuntimeRepoOwnedSupportFile
} from './windows_runtime_manifest.mjs'

const desktopRoot = process.env.EASYWHISPER_DESKTOP_ROOT
  ? path.resolve(process.env.EASYWHISPER_DESKTOP_ROOT)
  : path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const runtimeDir = path.join(desktopRoot, 'resources', 'win')
const runtimeManifestPath = path.join(runtimeDir, 'runtime-manifest.json')

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (!options.sourceDir) {
    throw new Error('Missing runtime source. Provide --source <dir>.')
  }

  if (!options.cliVersion) {
    throw new Error('Missing runtime version. Provide --version <value>.')
  }

  await assertReadableDirectory(options.sourceDir, 'runtime source directory')
  const stagedSources = await listManagedRuntimeSources(options.sourceDir, options.variant)

  await mkdir(runtimeDir, { recursive: true })
  await clearManagedRuntimeFiles()

  const stagedTargets = []
  for (const sourcePath of stagedSources) {
    const targetPath = path.join(runtimeDir, path.basename(sourcePath))
    await copyFile(sourcePath, targetPath)
    stagedTargets.push(targetPath)
  }

  const manifest = buildWindowsRuntimeManifest({
    variant: options.variant,
    version: options.cliVersion,
    files: stagedTargets.map((targetPath) => path.basename(targetPath))
  })
  await writeFile(runtimeManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  process.stdout.write(`${[...stagedTargets, runtimeManifestPath].join('\n')}\n`)
}

function parseArgs(argv) {
  const options = {
    sourceDir: process.env.FOSSWHISPER_WINDOWS_WHISPER_SOURCE_DIR,
    cliVersion: process.env.FOSSWHISPER_WINDOWS_WHISPER_VERSION,
    variant: process.env.FOSSWHISPER_WINDOWS_WHISPER_VARIANT ?? DEFAULT_WINDOWS_RUNTIME_VARIANT
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const value = argv[index + 1]

    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }
    if (value === undefined) {
      throw new Error(`Missing value for ${arg}`)
    }

    switch (arg) {
      case '--source':
        options.sourceDir = value
        break
      case '--version':
        options.cliVersion = value
        break
      default:
        throw new Error(`Unknown option: ${arg}`)
    }

    index += 1
  }

  return options
}

async function listManagedRuntimeSources(sourceDir, variant) {
  const entries = await readdir(sourceDir, { withFileTypes: true })
  const managedSources = []

  for (const entry of entries) {
    if (!entry.isFile()) {
      throw new Error(`Unsupported Windows runtime source entry: ${entry.name}`)
    }

    if (isWindowsRuntimeRepoOwnedSupportFile(entry.name)) {
      continue
    }

    if (!isWindowsRuntimeManagedFile(entry.name, variant)) {
      throw new Error(`Unsupported Windows runtime source file: ${entry.name}`)
    }

    managedSources.push(path.join(sourceDir, entry.name))
  }

  managedSources.sort((left, right) => left.localeCompare(right))

  if (!managedSources.some((sourcePath) => path.basename(sourcePath) === 'whisper-cli.exe')) {
    throw new Error(`whisper-cli.exe not found in runtime source directory: ${sourceDir}`)
  }

  return managedSources
}

async function assertReadableDirectory(filePath, label) {
  let fileStat
  try {
    fileStat = await stat(filePath)
  } catch {
    throw new Error(`${label} not found at ${filePath}`)
  }

  if (!fileStat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${filePath}`)
  }
}

async function clearManagedRuntimeFiles() {
  const entries = await readdir(runtimeDir, { withFileTypes: true })

  await Promise.all(entries.map(async (entry) => {
    if (entry.name === 'README.md') {
      return
    }

    await rm(path.join(runtimeDir, entry.name), { recursive: true, force: true })
  }))
}

await main()
