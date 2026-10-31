import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  decodePng,
  encodeIco,
  encodePng,
  ICO_FRAME_SIZES,
  resizeImage
} from './trim-windows-icon-source.mjs'

const root = new URL('../../', import.meta.url)
const source = decodePng(readFileSync(new URL('resources/icon-source/workbench.png', root)))
if (source.width !== source.height || source.width < 1024) {
  throw new Error('Workbench icon source must be square and at least 1024 pixels.')
}

const pngs = new Map()
function png(size) {
  if (!pngs.has(size)) {
    pngs.set(size, encodePng(resizeImage(source, size, size)))
  }
  return pngs.get(size)
}

const outputs = new Map([
  ['resources/icon.png', png(256)],
  ['resources/icon-dev.png', png(256)],
  ['resources/build/icon.png', png(1024)],
  ['resources/tray/workbench.png', png(18)],
  ['resources/tray/workbench@2x.png', png(36)],
  [
    'resources/build/icon.ico',
    encodeIco(ICO_FRAME_SIZES.map((size) => resizeImage(source, size, size)))
  ]
])

// PNG-backed ICNS slots include Retina representations; preserve the supplied
// artwork's full canvas instead of trimming or recoloring its background.
const slots = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512]
]
const chunks = slots.map(([type, size]) => {
  const data = png(size)
  const header = Buffer.alloc(8)
  header.write(type, 0, 'ascii')
  header.writeUInt32BE(data.length + 8, 4)
  return Buffer.concat([header, data])
})
const header = Buffer.alloc(8)
header.write('icns', 0, 'ascii')
header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4)
outputs.set('resources/build/icon.icns', Buffer.concat([header, ...chunks]))

const check = process.argv.includes('--check')
let stale = false
for (const [path, bytes] of outputs) {
  const file = new URL(path, root)
  if (check) {
    if (!readFileSync(file).equals(bytes)) {
      console.error(`Outdated icon: ${path}`)
      stale = true
    }
  } else {
    writeFileSync(file, bytes)
    console.log(`Generated ${fileURLToPath(file)}`)
  }
}
if (stale) {
  process.exitCode = 1
}
