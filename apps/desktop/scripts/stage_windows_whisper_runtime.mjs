import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = process.env.EASYWHISPER_DESKTOP_ROOT
  ? path.resolve(process.env.EASYWHISPER_DESKTOP_ROOT)
  : path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const resourcesDir = path.join(desktopRoot, 'resources')
const runtimeDir = path.join(resourcesDir, 'win')
const versionsPath = path.join(resourcesDir, 'versions.json')
const runtimeManifestPath = path.join(runtimeDir, 'runtime-manifest.json')
const ignoredSourceRuntimeFileNames = new Set([
  'runtime-manifest.json',
  'whisper.dll',
  'whispercli.exe'
])

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const cliSource = options.cliPath ?? fromSourceDir(options.sourceDir, 'whisper-cli.exe')

  if (!cliSource) {
    throw new Error('Missing runtime inputs. Provide --source <dir> or --cli <path>.')
  }

  await assertReadableFile(cliSource, 'whisper-cli.exe')
  const additionalSources = await listAdditionalRuntimeFiles(options.sourceDir, cliSource)

  await mkdir(runtimeDir, { recursive: true })
  await clearManagedRuntimeFiles()

  const cliTarget = path.join(runtimeDir, 'whisper-cli.exe')
  await copyFile(cliSource, cliTarget)

  for (const sourcePath of additionalSources) {
    await copyFile(sourcePath, path.join(runtimeDir, path.basename(sourcePath)))
  }

  const stagedFileNames = [
    path.basename(cliTarget),
    ...additionalSources.map((sourcePath) => path.basename(sourcePath))
  ].sort((left, right) => left.localeCompare(right))

  await writeRuntimeManifest(stagedFileNames)

  const versions = await readVersions()
  pruneStaleWindowsWhisperMetadata(versions)
  versions['whisper-cli'] = {
    version: options.cliVersion ?? 'manual',
    platform: 'win32',
    variant: 'vulkan',
    notes: `Staged from ${cliSource}`
  }

  await writeFile(versionsPath, `${JSON.stringify(versions, null, 2)}\n`, 'utf8')

  const stagedTargets = [
    cliTarget,
    ...additionalSources.map((sourcePath) => path.join(runtimeDir, path.basename(sourcePath)))
  ]
  process.stdout.write(`${stagedTargets.join('\n')}\n${runtimeManifestPath}\n${versionsPath}\n`)
}

function parseArgs(argv) {
  const options = {
    sourceDir: process.env.FOSSWHISPER_WINDOWS_WHISPER_SOURCE_DIR,
    cliPath: process.env.FOSSWHISPER_WINDOWS_WHISPER_CLI_PATH,
    cliVersion: process.env.FOSSWHISPER_WINDOWS_WHISPER_VERSION
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
      case '--cli':
        options.cliPath = value
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

function fromSourceDir(sourceDir, fileName) {
  return sourceDir ? path.join(sourceDir, fileName) : null
}

async function listAdditionalRuntimeFiles(sourceDir, cliSource) {
  if (!sourceDir) {
    return []
  }

  const normalizedCliSource = path.resolve(cliSource)
  const entries = await readdir(sourceDir, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(sourceDir, entry.name))
    .filter((filePath) => path.resolve(filePath) !== normalizedCliSource)
    .filter((filePath) => shouldStageAdditionalRuntimeFile(filePath))

  files.sort((left, right) => left.localeCompare(right))
  return files
}

function shouldStageAdditionalRuntimeFile(filePath) {
  const normalizedFileName = path.basename(filePath).toLowerCase()
  return !ignoredSourceRuntimeFileNames.has(normalizedFileName)
}

async function assertReadableFile(filePath, label) {
  let fileStat
  try {
    fileStat = await stat(filePath)
  } catch {
    throw new Error(`${label} not found at ${filePath}`)
  }
  if (!fileStat.isFile()) {
    throw new Error(`${label} is not a file: ${filePath}`)
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

async function readVersions() {
  try {
    const raw = await readFile(versionsPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function pruneStaleWindowsWhisperMetadata(versions) {
  for (const [key, value] of Object.entries(versions)) {
    if (key === 'whisper-cli') {
      continue
    }
    if (!key.startsWith('whisper')) {
      continue
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue
    }
    if (value.platform !== 'win32') {
      continue
    }

    delete versions[key]
  }
}

async function writeRuntimeManifest(files) {
  const manifest = {
    platform: 'win32',
    variant: 'vulkan',
    files
  }

  await writeFile(runtimeManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

await main()
