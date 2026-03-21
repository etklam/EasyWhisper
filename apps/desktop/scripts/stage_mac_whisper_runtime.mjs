import { mkdir, rm, copyFile, readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const desktopRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopRoot, '..', '..')
const sourceRoot = path.join(repoRoot, 'whisper', 'build')
const targetRoot = path.join(desktopRoot, 'resources', 'mac', 'whisper')
const targetLibDir = path.join(targetRoot, 'lib')
const targetCliPath = path.join(targetRoot, 'whisper-cli')

const REQUIRED_FILES = [
  path.join(sourceRoot, 'main', 'whisper-cli'),
  path.join(sourceRoot, 'src', 'libwhisper.1.dylib'),
  path.join(sourceRoot, 'ggml', 'src', 'libggml.0.dylib'),
  path.join(sourceRoot, 'ggml', 'src', 'libggml-base.0.dylib'),
  path.join(sourceRoot, 'ggml', 'src', 'libggml-cpu.0.dylib'),
  path.join(sourceRoot, 'ggml', 'src', 'ggml-blas', 'libggml-blas.0.dylib'),
  path.join(sourceRoot, 'ggml', 'src', 'ggml-metal', 'libggml-metal.0.dylib')
]

await rm(targetRoot, { recursive: true, force: true })
await mkdir(targetLibDir, { recursive: true })

for (const filePath of REQUIRED_FILES) {
  const targetPath =
    filePath.endsWith('whisper-cli')
      ? targetCliPath
      : path.join(targetLibDir, path.basename(filePath))
  await copyFile(filePath, targetPath)
}

const libFiles = await readdir(targetLibDir)

runInstallNameTool(['-add_rpath', '@executable_path/lib', targetCliPath])

for (const fileName of libFiles) {
  const dylibPath = path.join(targetLibDir, fileName)
  runInstallNameTool(['-id', `@rpath/${fileName}`, dylibPath])
  runInstallNameTool(['-add_rpath', '@loader_path', dylibPath])
}

function runInstallNameTool(args) {
  const result = spawnSync('install_name_tool', args, { encoding: 'utf8' })
  if (result.status === 0) {
    return
  }

  const detail = result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`
  if (detail.includes('would duplicate path')) {
    return
  }

  throw new Error(`install_name_tool ${args.join(' ')} failed: ${detail}`)
}
