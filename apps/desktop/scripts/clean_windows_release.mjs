import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const releaseDir = path.join(desktopRoot, 'release')

async function main() {
  let entries = []
  try {
    entries = await readdir(releaseDir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!shouldRemove(entry.name)) {
      continue
    }
    await rm(path.join(releaseDir, entry.name), { recursive: true, force: true })
  }
}

function shouldRemove(name) {
  if (/^win-.*-unpacked$/.test(name)) {
    return true
  }
  if (/^FOSSWhisper-.*-setup\.exe(\.blockmap)?$/.test(name)) {
    return true
  }
  return false
}

await main()
