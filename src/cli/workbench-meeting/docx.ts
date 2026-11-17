import { inflateRawSync } from 'node:zlib'

const ZIP_LOCAL_FILE = 0x04034b50
const ZIP_CENTRAL_DIRECTORY = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50
const ZIP_END_MIN_BYTES = 22
const ZIP_END_MAX_SEARCH = 66_000

/** Reads one entry from a standard ZIP container (DOCX never needs ZIP64). */
function readZipEntry(archive: Buffer, wanted: string): Buffer {
  let end = -1
  for (
    let offset = archive.length - ZIP_END_MIN_BYTES;
    offset >= Math.max(0, archive.length - ZIP_END_MAX_SEARCH);
    offset--
  ) {
    if (archive.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      end = offset
      break
    }
  }
  if (end < 0) {
    throw new Error('DOCX 缺少 ZIP 目录结构')
  }
  const count = archive.readUInt16LE(end + 10)
  let offset = archive.readUInt32LE(end + 16)
  for (let index = 0; index < count; index++) {
    if (offset + 46 > archive.length || archive.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY) {
      throw new Error('DOCX ZIP 目录损坏')
    }
    const method = archive.readUInt16LE(offset + 10)
    const compressedSize = archive.readUInt32LE(offset + 20)
    const nameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)
    const localOffset = archive.readUInt32LE(offset + 42)
    const name = archive.toString('utf8', offset + 46, offset + 46 + nameLength)
    if (name === wanted) {
      if (
        localOffset + 30 > archive.length ||
        archive.readUInt32LE(localOffset) !== ZIP_LOCAL_FILE
      ) {
        throw new Error('DOCX ZIP 条目损坏')
      }
      const dataOffset =
        localOffset +
        30 +
        archive.readUInt16LE(localOffset + 26) +
        archive.readUInt16LE(localOffset + 28)
      const data = archive.subarray(dataOffset, dataOffset + compressedSize)
      if (dataOffset + compressedSize > archive.length) {
        throw new Error('DOCX ZIP 条目被截断')
      }
      return method === 0 ? data : inflateRawSync(data)
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  throw new Error(`DOCX 缺少 ${wanted}`)
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&(lt|gt|amp|quot|apos);/g, (_, name: string) => {
      const entities: Record<string, string> = {
        lt: '<',
        gt: '>',
        amp: '&',
        quot: '"',
        apos: "'"
      }
      return entities[name]
    })
}

/** Converts WordprocessingML to the paragraph text a reader sees. */
export function docxXmlToText(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\b[^>]*\/>/g, '\t')
      .replace(/<w:br\b[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function extractDocxText(archive: Buffer): string {
  return docxXmlToText(readZipEntry(archive, 'word/document.xml').toString('utf8'))
}
