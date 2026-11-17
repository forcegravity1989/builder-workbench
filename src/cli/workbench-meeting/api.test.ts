import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { transcriptExportPayload, utc8DayRange } from './api'
import { extractDocxText } from './docx'

function docxWithDocumentXml(xml: string): Buffer {
  const name = Buffer.from('word/document.xml', 'utf8')
  const data = deflateRawSync(Buffer.from(xml, 'utf8'))
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(8, 8)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(Buffer.byteLength(xml), 22)
  local.writeUInt16LE(name.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(Buffer.byteLength(xml), 24)
  central.writeUInt16LE(name.length, 28)
  central.writeUInt32LE(0, 42)
  const centralDirectory = Buffer.concat([central, name])
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(local.length + name.length + data.length, 16)
  return Buffer.concat([local, name, data, centralDirectory, end])
}

describe('eMeeting transcript API', () => {
  it('extracts paragraph text from the exported DOCX', () => {
    const text = extractDocxText(
      docxWithDocumentXml(
        '<w:document><w:body>' +
          '<w:p><w:r><w:t>00:00 开始 验收</w:t></w:r></w:p>' +
          '<w:p><w:r><w:t xml:space="preserve">A &amp; B</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>01:02 结束</w:t></w:r></w:p>' +
          '</w:body></w:document>'
      )
    )
    expect(text).toBe('00:00 开始 验收\nA & B\t01:02 结束')
  })

  it('exports the whole UTC+8 meeting day with the eMeeting payload fields', () => {
    const startTime = Date.parse('2026-11-13T16:00:00+08:00')
    expect(utc8DayRange(startTime)).toEqual({
      startTime: Date.parse('2026-11-13T00:00:00+08:00'),
      endTime: Date.parse('2026-11-13T23:59:59+08:00')
    })
    expect(
      transcriptExportPayload('B9FA20DB4AB676C5B25E55A71DA7E814', {
        subject: 'v1.0.46 版本验收会议',
        startTime
      })
    ).toMatchObject({
      languageType: 'Original',
      meetingNum: 'B9FA20DB4AB676C5B25E55A71DA7E814',
      subject: '20261113-v1.0.46 版本验收会议-语音转文字',
      type: 'speakText'
    })
  })
})
