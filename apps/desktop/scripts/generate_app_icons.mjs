import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const ICO_SIZES = [16, 32, 64, 128, 256]
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024]
const ICNS_TYPES = new Map([
  [16, 'icp4'],
  [32, 'icp5'],
  [64, 'icp6'],
  [128, 'ic07'],
  [256, 'ic08'],
  [512, 'ic09'],
  [1024, 'ic10']
])

async function main() {
  const desktopRoot = resolveDesktopRoot()
  const buildDir = path.join(desktopRoot, 'build')
  const svgPath = path.join(buildDir, 'icon.svg')
  const icoPath = path.join(buildDir, 'icon.ico')
  const icnsPath = path.join(buildDir, 'icon.icns')

  await assertReadableFile(svgPath, 'build/icon.svg is missing. Add apps/desktop/build/icon.svg before generating app icons.')
  await mkdir(buildDir, { recursive: true })

  const rendered = await renderPngBuffers(svgPath, [...new Set([...ICO_SIZES, ...ICNS_SIZES])])
  const icoBuffer = buildIco(rendered.filter((image) => ICO_SIZES.includes(image.size)))
  const icnsBuffer = buildIcns(rendered.filter((image) => ICNS_SIZES.includes(image.size)))

  assertNonEmpty(icoBuffer, 'Generated icon.ico is empty.')
  assertNonEmpty(icnsBuffer, 'Generated icon.icns is empty.')

  await writeFile(icoPath, icoBuffer)
  await writeFile(icnsPath, icnsBuffer)

  console.log(icoPath)
  console.log(icnsPath)
}

function resolveDesktopRoot() {
  if (process.env.EASYWHISPER_DESKTOP_ROOT) {
    return path.resolve(process.env.EASYWHISPER_DESKTOP_ROOT)
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(scriptDir, '..')
}

async function assertReadableFile(filePath, message) {
  try {
    await access(filePath, constants.R_OK)
  } catch (error) {
    throw new Error(message, { cause: error })
  }
}

async function renderPngBuffers(svgPath, sizes) {
  const source = await readFile(svgPath, 'utf8')

  return sizes.map((size) => {
    const resvg = new Resvg(source, {
      fitTo: {
        mode: 'width',
        value: size
      }
    })
    const png = resvg.render().asPng()
    assertNonEmpty(png, `Failed to render PNG for ${size}x${size}.`)
    return { size, png }
  })
}

function buildIco(images) {
  const count = images.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)

  const directory = Buffer.alloc(count * 16)
  let offset = header.length + directory.length

  images.forEach((image, index) => {
    const entryOffset = index * 16
    const dim = image.size >= 256 ? 0 : image.size

    directory.writeUInt8(dim, entryOffset + 0)
    directory.writeUInt8(dim, entryOffset + 1)
    directory.writeUInt8(0, entryOffset + 2)
    directory.writeUInt8(0, entryOffset + 3)
    directory.writeUInt16LE(1, entryOffset + 4)
    directory.writeUInt16LE(32, entryOffset + 6)
    directory.writeUInt32LE(image.png.length, entryOffset + 8)
    directory.writeUInt32LE(offset, entryOffset + 12)

    offset += image.png.length
  })

  return Buffer.concat([header, directory, ...images.map((image) => image.png)])
}

function buildIcns(images) {
  const entries = images.map((image) => {
    const type = ICNS_TYPES.get(image.size)
    if (!type) {
      throw new Error(`Unsupported ICNS icon size: ${image.size}`)
    }

    const header = Buffer.alloc(8)
    header.write(type, 0, 4, 'ascii')
    header.writeUInt32BE(image.png.length + 8, 4)
    return Buffer.concat([header, image.png])
  })

  const totalLength = 8 + entries.reduce((sum, entry) => sum + entry.length, 0)
  const fileHeader = Buffer.alloc(8)
  fileHeader.write('icns', 0, 4, 'ascii')
  fileHeader.writeUInt32BE(totalLength, 4)

  return Buffer.concat([fileHeader, ...entries])
}

function assertNonEmpty(buffer, message) {
  if (!buffer || buffer.length === 0) {
    throw new Error(message)
  }
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error)
  console.error(detail)
  process.exitCode = 1
})
