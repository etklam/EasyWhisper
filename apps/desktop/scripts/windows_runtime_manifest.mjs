export const WINDOWS_RUNTIME_PLATFORM = 'win32'
export const DEFAULT_WINDOWS_RUNTIME_VARIANT = 'vulkan'
export const WINDOWS_RUNTIME_VARIANTS = ['vulkan', 'cuda', 'cpu']
export const WINDOWS_RUNTIME_REPO_OWNED_SUPPORT_FILES = ['README.md', 'runtime-manifest.json']
export const WINDOWS_RUNTIME_FILE_PATTERNS = {
  vulkan: [/^whisper-cli\.exe$/i, /^ggml-.*\.dll$/i],
  cuda: [/^whisper-cli\.exe$/i, /^cublas.*\.dll$/i, /^cudart.*\.dll$/i],
  cpu: [/^whisper-cli\.exe$/i]
}

const repoOwnedSupportFileNames = new Set(
  WINDOWS_RUNTIME_REPO_OWNED_SUPPORT_FILES.map((fileName) => fileName.toLowerCase())
)

export function buildWindowsRuntimeManifest({ variant = DEFAULT_WINDOWS_RUNTIME_VARIANT, version, files }) {
  const normalizedVariant = assertWindowsRuntimeVariant(variant)
  const normalizedVersion = assertWindowsRuntimeVersion(version)
  const normalizedFiles = normalizeWindowsRuntimeFiles(files, normalizedVariant)

  return {
    platform: WINDOWS_RUNTIME_PLATFORM,
    variant: normalizedVariant,
    version: normalizedVersion,
    files: normalizedFiles
  }
}

export function assertWindowsRuntimeManifest(manifest, options = {}) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('runtime-manifest.json must contain an object payload.')
  }

  if (manifest.platform !== WINDOWS_RUNTIME_PLATFORM) {
    throw new Error(`runtime-manifest.json must target platform ${WINDOWS_RUNTIME_PLATFORM} for Windows packaging.`)
  }

  const supportedVariants = options.supportedVariants ?? WINDOWS_RUNTIME_VARIANTS
  const normalizedVariant = assertWindowsRuntimeVariant(manifest.variant, supportedVariants)
  const normalizedVersion = assertWindowsRuntimeVersion(manifest.version)
  const normalizedFiles = normalizeWindowsRuntimeFiles(manifest.files, normalizedVariant)

  return {
    platform: WINDOWS_RUNTIME_PLATFORM,
    variant: normalizedVariant,
    version: normalizedVersion,
    files: normalizedFiles
  }
}

export function isWindowsRuntimeRepoOwnedSupportFile(fileName) {
  return repoOwnedSupportFileNames.has(fileName.toLowerCase())
}

export function isWindowsRuntimeManagedFile(fileName, variant = DEFAULT_WINDOWS_RUNTIME_VARIANT) {
  const normalizedVariant = assertWindowsRuntimeVariant(variant)
  return WINDOWS_RUNTIME_FILE_PATTERNS[normalizedVariant].some((pattern) => pattern.test(fileName))
}

function assertWindowsRuntimeVariant(variant, supportedVariants = WINDOWS_RUNTIME_VARIANTS) {
  if (typeof variant !== 'string' || variant.length === 0) {
    throw new Error('runtime-manifest.json must declare a non-empty Windows runtime variant.')
  }

  if (!supportedVariants.includes(variant)) {
    const supportedLabel = supportedVariants.map((value) => `"${value}"`).join(', ')
    throw new Error(`Unsupported Windows runtime variant: ${variant}. Expected one of ${supportedLabel}.`)
  }

  return variant
}

function assertWindowsRuntimeVersion(version) {
  if (typeof version !== 'string' || version.trim().length === 0) {
    throw new Error('runtime-manifest.json must declare a non-empty runtime version.')
  }

  return version.trim()
}

function normalizeWindowsRuntimeFiles(files, variant) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('runtime-manifest.json must declare at least one staged runtime file.')
  }

  const normalizedFiles = files.map((fileName) => {
    if (typeof fileName !== 'string' || fileName.trim().length === 0) {
      throw new Error('runtime-manifest.json files entries must be non-empty strings.')
    }

    return fileName.trim()
  })

  if (!normalizedFiles.includes('whisper-cli.exe')) {
    throw new Error('runtime-manifest.json must include whisper-cli.exe.')
  }

  for (const fileName of normalizedFiles) {
    if (isWindowsRuntimeRepoOwnedSupportFile(fileName)) {
      throw new Error(`runtime-manifest.json must not manage repo-owned support file: ${fileName}`)
    }

    if (!isWindowsRuntimeManagedFile(fileName, variant)) {
      throw new Error(`runtime-manifest.json lists unsupported ${variant} runtime file: ${fileName}`)
    }
  }

  return [...normalizedFiles].sort((left, right) => left.localeCompare(right))
}
