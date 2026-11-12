import { describe, expect, it, vi } from 'vitest'
import type * as PreflightCommandExec from '../../ipc/preflight-command-exec'
import {
  classifyWelinkErrorText,
  ensureReportFolder,
  parseFirstJsonObject,
  parseFolderListing,
  parseUploadedFileId,
  removeReportFile,
  uploadReportFile,
  WelinkReportError
} from './welink-onebox-client'

const { execLocalMock } = vi.hoisted(() => ({ execLocalMock: vi.fn() }))

vi.mock('../../ipc/preflight-command-exec', async (importOriginal) => {
  const actual = await importOriginal<typeof PreflightCommandExec>()
  return { ...actual, execLocalPreflightCommandOrThrow: execLocalMock }
})

describe('welink onebox output protocol', () => {
  it('uses the CLI folder pagination and upload protocol without confusing parent flags', async () => {
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
      folders: [{ id: '3', name: 'Workbench 上报' }]
    })
    // Retain exact IDs across the CLI's folder field names.
    expect(
      parseFolderListing(
        parseFirstJsonObject('{"folders":[{"folderId":9,"folderName":"Workbench 上报"}]}')
      )
    ).toEqual({ folders: [{ id: '9', name: 'Workbench 上报' }] })
    expect(
      parseFolderListing({
        folders: [{ id: '9007199254740993', name: 'exact string ID' }]
      })
    ).toEqual({ folders: [{ id: '9007199254740993', name: 'exact string ID' }] })
    for (const id of [9_007_199_254_740_992, 1.5, undefined]) {
      expect(() => parseFolderListing({ folders: [{ id, name: 'Workbench 上报' }] })).toThrow(
        WelinkReportError
      )
    }
    expect(parseFirstJsonObject('no json here')).toBeNull()

    execLocalMock.mockReset()
    execLocalMock
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          files: Array.from({ length: 20 }, (_, id) => ({ id, name: `${id}.md` })),
          folders: [],
          limit: 20,
          offset: 0,
          totalCount: 21
        }),
        stderr: ''
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          files: [],
          folders: [{ id: 3, name: 'Workbench 上报' }],
          limit: 20,
          offset: 20,
          totalCount: 21
        }),
        stderr: ''
      })
    await expect(ensureReportFolder({}, '12345')).resolves.toBe('3')
    expect(execLocalMock).toHaveBeenNthCalledWith(
      1,
      'welink-cli',
      [
        'onebox',
        'folder-list',
        '--space-id',
        '12345',
        '--folder-id',
        '0',
        '--limit',
        '20',
        '--offset',
        '0'
      ],
      30_000
    )
    expect(execLocalMock).toHaveBeenNthCalledWith(
      2,
      'welink-cli',
      [
        'onebox',
        'folder-list',
        '--space-id',
        '12345',
        '--folder-id',
        '0',
        '--limit',
        '20',
        '--offset',
        '20'
      ],
      30_000
    )
    await expect(ensureReportFolder({}, '12345')).resolves.toBe('3')
    expect(execLocalMock).toHaveBeenCalledTimes(2)

    execLocalMock
      .mockResolvedValueOnce({
        stdout: '{"files":[],"folders":[],"limit":20,"offset":0,"totalCount":0}',
        stderr: ''
      })
      .mockResolvedValueOnce({ stdout: '{"id":55}', stderr: '' })
    await expect(ensureReportFolder({}, '12345', 'Workbench 遥测')).resolves.toBe('55')
    expect(execLocalMock).toHaveBeenLastCalledWith(
      'welink-cli',
      ['onebox', 'folder-new', '--space-id', '12345', '--parent', '0', '--name', 'Workbench 遥测'],
      30_000
    )

    execLocalMock.mockResolvedValueOnce({ stdout: uploadStdout, stderr: '' })
    await expect(
      uploadReportFile({}, '12345', '55', '/tmp/report file.md', 'report file.md')
    ).resolves.toBe('9007199254740993')
    expect(execLocalMock).toHaveBeenLastCalledWith(
      'welink-cli',
      ['onebox', 'file-upload', '--space-id', '12345', '--parent', '55', '/tmp/report file.md'],
      90_000
    )

    execLocalMock.mockResolvedValueOnce({ stdout: '{"unexpected":true}', stderr: '' })
    await expect(ensureReportFolder({}, 'bad-page')).rejects.toMatchObject({
      category: 'cli-incompatible'
    })
    expect(execLocalMock).toHaveBeenCalledTimes(6)
    execLocalMock.mockResolvedValueOnce({
      stdout:
        '{"files":[],"folders":[{"name":"Workbench 上报"}],"limit":20,"offset":0,"totalCount":1}',
      stderr: ''
    })
    await expect(ensureReportFolder({}, 'bad-folder')).rejects.toMatchObject({
      category: 'cli-incompatible'
    })
    expect(execLocalMock).toHaveBeenCalledTimes(7)
  })

  it('classifies CLI failures and maps them to safe copy and deletion-retry handling', async () => {
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
    expect(
      classifyWelinkErrorText(
        'The following arguments were not expected: 0 --parent\nRun with --help for more information.'
      )
    ).toBe('cli-incompatible')
    expect(classifyWelinkErrorText('something else entirely')).toBe('unknown')

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
      'cli-incompatible',
      'auth',
      'config',
      'rate-limit',
      'network',
      'file',
      'unknown'
    ] as const) {
      expect(new WelinkReportError(category, 'd').message.length).toBeGreaterThan(5)
    }
    execLocalMock.mockReset()
    execLocalMock.mockRejectedValueOnce(
      Object.assign(new Error('Command failed'), {
        stderr: 'Error: Get file info failed: This file does not exist.'
      })
    )
    await expect(removeReportFile({}, '12345', '777')).resolves.toBeUndefined()
    expect(execLocalMock).toHaveBeenLastCalledWith(
      'welink-cli',
      ['onebox', 'file-remove', '--space-id', '12345', '--file-id', '777'],
      30_000
    )
    execLocalMock.mockRejectedValueOnce(new Error('unexpected server failure'))
    await expect(removeReportFile({}, '12345', '777')).rejects.toMatchObject({
      category: 'unknown'
    })
    execLocalMock.mockRejectedValueOnce(new Error('This user does not exist.'))
    await expect(removeReportFile({}, '12345', '777')).rejects.toMatchObject({
      category: 'config'
    })
    execLocalMock.mockRejectedValueOnce(Object.assign(new Error('Command failed'), { code: 109 }))
    await expect(removeReportFile({}, '12345', '777')).rejects.toMatchObject({
      category: 'cli-incompatible'
    })
  })
})
