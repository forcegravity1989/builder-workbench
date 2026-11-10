// Protocol guards for the welink-cli onebox transport (Issue #553): output
// parsing, failure classification and the user-copy mapping are data
// contracts — the CLI prints text (no --json), and a wrong category sends
// users down the wrong recovery path.

import { describe, expect, it } from 'vitest'
import {
  classifyWelinkErrorText,
  parseFirstJsonObject,
  parseFolderListing,
  parseUploadedFileId,
  WelinkReportError
} from './welink-onebox-client'

describe('welink onebox output protocol', () => {
  it('parses file-upload text output and folder JSON listings', () => {
    // Exact shape from the field research (调研 §2): trailing `File ID:` line.
    const uploadStdout = [
      'Computing file MD5...',
      'File: workbench-feedback-x.md',
      'Size: 123 bytes',
      'MD5: abc',
      'Requesting upload URL...',
      'Uploading file...',
      'Upload completed!',
      'File ID: 9007199254740993'
    ].join('\n')
    expect(parseUploadedFileId(uploadStdout)).toBe('9007199254740993')
    // Same-content dedupe skips the upload step but still prints the id.
    expect(parseUploadedFileId('MD5 matched an existing file.\nFile ID: 42\n')).toBe('42')
    expect(parseUploadedFileId('Upload completed!\n')).toBeNull()

    const listing = parseFirstJsonObject(
      'Loading...\n{"files":[{"id":7,"name":"a.md"}],"folders":[{"id":3,"name":"Workbench 上报"}],"totalCount":1}\n'
    )
    expect(parseFolderListing(listing)).toEqual({
      files: [{ id: '7', name: 'a.md' }],
      folders: [{ id: '3', name: 'Workbench 上报' }]
    })
    // Fallback field names survive; malformed entries drop without failing the list.
    expect(
      parseFolderListing(
        parseFirstJsonObject(
          '{"files":[{"fileId":9,"fileName":"b.ndjson"},{"nope":true}],"folders":[]}'
        )
      )
    ).toEqual({ files: [{ id: '9', name: 'b.ndjson' }], folders: [] })
    expect(parseFirstJsonObject('no json here')).toBeNull()
  })

  it('classifies CLI failures into the four actionable categories', () => {
    // All shapes below are verbatim from the field research (调研 §4).
    expect(
      classifyWelinkErrorText(
        'Error: Request upload URL failed (status 429): {"message":"Frequency Control","code":"48503"}'
      )
    ).toBe('rate-limit')
    expect(
      classifyWelinkErrorText(
        'Error: API returned error response:\n{"code":"404","message":{"code":"NoSuchUser","message":"This user does not exist.","requestId":"r-1","type":"error"}}'
      )
    ).toBe('config')
    expect(classifyWelinkErrorText('Error: Cannot open file: C:\\tmp\\x.md')).toBe('file')
    expect(
      classifyWelinkErrorText("Status: not authenticated\nHint: Run 'welink-cli auth login'.")
    ).toBe('auth')
    expect(classifyWelinkErrorText('User Token: EXPIRED')).toBe('auth')
    expect(
      classifyWelinkErrorText(
        'Error: Get folder list failed: dial tcp: lookup open.inner.welink.huawei.com: no such host (ENOTFOUND)'
      )
    ).toBe('network')
    expect(classifyWelinkErrorText('Timed out running welink-cli')).toBe('network')
    expect(classifyWelinkErrorText('something else entirely')).toBe('unknown')
  })

  it('maps categories to user copy and keeps raw CLI text out of the message', () => {
    const rateLimited = new WelinkReportError('rate-limit', 'Error: status 429 requestId=abc-123')
    expect(rateLimited.name).toBe('WelinkReportError')
    expect(rateLimited.message).toBe('WeLink 接口限流,请稍后重试。')
    // requestId-bearing bodies never reach users; they stay in the span cause.
    expect(rateLimited.message).not.toContain('requestId')
    expect(rateLimited.detail).toContain('requestId=abc-123')
    const long = new WelinkReportError('unknown', 'x'.repeat(900))
    expect(long.detail).toHaveLength(400)
    for (const category of [
      'not-installed',
      'auth',
      'config',
      'rate-limit',
      'network',
      'file',
      'unknown'
    ] as const) {
      expect(new WelinkReportError(category, 'd').message.length).toBeGreaterThan(5)
    }
  })
})
