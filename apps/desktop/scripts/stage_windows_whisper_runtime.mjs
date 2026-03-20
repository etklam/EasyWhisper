import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const resourcesDir = path.join(desktopRoot, 'resources')
const runtimeDir = path.join(resourcesDir, 'win')
const versionsPath = path.join(resourcesDir, 'versions.json')

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const cliSource = options.cliPath ?? fromSourceDir(options.sourceDir, 'WhisperCLI.exe')
  const dllSource = options.dllPath ?? fromSourceDir(options.sourceDir, 'whisper.dll')

  if (!cliSource || !dllSource) {
    throw new Error(
      'Missing runtime inputs. Provide --source <dir> or both --cli <path> and --dll <path>.'
    )
  }

  await assertReadableFile(cliSource, 'WhisperCLI.exe')
  await assertReadableFile(dllSource, 'whisper.dll')

  await mkdir(runtimeDir, { recursive: true })

  const cliTarget = path.join(runtimeDir, 'WhisperCLI.exe')
  const dllTarget = path.join(runtimeDir, 'whisper.dll')
  await copyFile(cliSource, cliTarget)
  await copyFile(dllSource, dllTarget)

  const versions = await readVersions()
  versions['whisper-cli'] = {
    version: options.cliVersion ?? 'manual',
    platform: 'win32',
    notes: `Staged from ${cliSource}`
  }
  versions['whisper-dll'] = {
    version: options.dllVersion ?? options.cliVersion ?? 'manual',
    platform: 'win32',
    notes: `Staged from ${dllSource}`
  }

  await writeFile(versionsPath, `${JSON.stringify(versions, null, 2)}\n`, 'utf8')

  process.stdout.write(`${cliTarget}\n${dllTarget}\n${versionsPath}\n`)
}

function parseArgs(argv) {
  const options = {
    sourceDir: process.env.FOSSWHISPER_WINDOWS_WHISPER_SOURCE_DIR,
    cliPath: process.env.FOSSWHISPER_WINDOWS_WHISPER_CLI_PATH,
    dllPath: process.env.FOSSWHISPER_WINDOWS_WHISPER_DLL_PATH,
    cliVersion: process.env.FOSSWHISPER_WINDOWS_WHISPER_VERSION,
    dllVersion: process.env.FOSSWHISPER_WINDOWS_WHISPER_DLL_VERSION
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
      case '--dll':
        options.dllPath = value
        break
      case '--version':
        options.cliVersion = value
        break
      case '--dll-version':
        options.dllVersion = value
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

async function readVersions() {
  try {
    const raw = await readFile(versionsPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

await main()
