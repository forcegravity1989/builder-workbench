import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { HandlerContext } from '../dispatch'
import { RuntimeClient } from '../runtime-client'
import { meetingPageExpression } from './page'
import { meetingOutputTarget, writeMeetingOutput } from './output'
import { selectMeetingRecordings, transcriptFingerprint, verifyTranscriptChunks } from './protocol'

describe('meeting transcript acquisition protocol', () => {
  it('requires an unambiguous recording selection and rejects empty, truncated, or changed text', () => {
    const recordings = [
      { index: 1, name: '录制-1-1', label: '录制-1-1\n上午' },
      { index: 2, name: '录制-2-1', label: '录制-2-1\n下午' }
    ]
    expect(selectMeetingRecordings(recordings, 'all')).toEqual(recordings)
    expect(selectMeetingRecordings(recordings, '2')).toEqual([recordings[1]])
    expect(selectMeetingRecordings(recordings, '录制-1-1')).toEqual([recordings[0]])
    expect(() => selectMeetingRecordings(recordings, '录制')).toThrow('无法唯一定位')
    expect(() => selectMeetingRecordings([recordings[0], recordings[0]], 'all')).toThrow('名称重复')
    const text = '本项目：验收与遗留。🎤'.repeat(4000)
    const metadata = { length: text.length, fingerprint: transcriptFingerprint(text) }
    expect(
      verifyTranscriptChunks([text.slice(0, 24000), text.slice(24000)], metadata)
    ).toMatchObject({ text, characters: text.length })
    expect(() => verifyTranscriptChunks([text.slice(1)], metadata)).toThrow('截断')
    expect(() => verifyTranscriptChunks([`X${text.slice(1)}`], metadata)).toThrow('发生变化')
    expect(() =>
      verifyTranscriptChunks([''], { length: 0, fingerprint: transcriptFingerprint('') })
    ).toThrow('为空')
    expect(
      () =>
        new Function(
          `return ${meetingPageExpression('A'.repeat(32), 'pick', { label: "录制'; throw 1; //" })}`
        )
    ).not.toThrow()
  })

  it('writes and independently reads back on the selected SSH host before publishing the output', async () => {
    let bytes = Buffer.alloc(0)
    let publishedBytes = Buffer.alloc(0)
    let corruptRead = false
    let failWriteResponse = false
    let failCleanup = false
    const client = new RuntimeClient('unused-test-runtime', 100, null, null)
    let hostId = 'ssh:test-host'
    const call = vi.spyOn(client, 'call').mockImplementation(async (method, input) => {
      const params = z.record(z.string(), z.unknown()).parse(input)
      let result: unknown = { ok: true }
      if (method === 'worktree.show') {
        result = { worktree: { path: '/srv/project', hostId } }
      }
      if (method === 'ssh.getState') {
        result = { state: { targetId: 'test-host', connectionGeneration: 7 } }
      }
      if (method === 'files.writeBase64Chunk') {
        bytes = params.append
          ? Buffer.concat([bytes, Buffer.from(String(params.contentBase64), 'base64')])
          : Buffer.from(String(params.contentBase64), 'base64')
        if (failWriteResponse) {
          throw new Error('write response lost')
        }
      }
      if (method === 'files.rename') {
        publishedBytes = bytes
      }
      if (method === 'files.delete') {
        if (failCleanup) {
          throw new Error('cleanup unavailable')
        }
        bytes = Buffer.alloc(0)
      }
      if (method === 'files.readChunk') {
        const chunk = bytes.subarray(
          Number(params.offset),
          Number(params.offset) + Number(params.length)
        )
        result = {
          bytesRead: chunk.length,
          contentBase64: corruptRead ? '' : chunk.toString('base64'),
          eof: Number(params.offset) + chunk.length >= bytes.length
        }
      }
      return { id: 'test-request', ok: true, result, _meta: { runtimeId: 'test-runtime' } }
    })
    const ctx: HandlerContext = {
      flags: new Map(),
      cwd: '/srv/project',
      json: true,
      client
    }
    const target = await meetingOutputTarget(ctx, 'id:ssh-tree', '/srv/project/.bw/meeting.json')
    const content = { text: '周一计划，周五验收。'.repeat(8000) }
    await writeMeetingOutput(ctx, target, content)
    expect(JSON.parse(bytes.toString('utf8'))).toEqual(content)
    expect(call).toHaveBeenLastCalledWith(
      'files.rename',
      expect.objectContaining({
        worktree: 'id:ssh-tree',
        newRelativePath: '.bw/meeting.json',
        expectedExecutionHostId: 'ssh:test-host',
        expectedSshTargetId: 'test-host',
        expectedSshConnectionGeneration: 7
      })
    )
    await expect(meetingOutputTarget(ctx, 'id:ssh-tree', '/other/meeting.json')).rejects.toThrow(
      '所选工作树内'
    )
    call.mockClear()
    corruptRead = true
    await expect(writeMeetingOutput(ctx, target, content)).rejects.toThrow('宿主读回')
    expect(call.mock.calls.some(([method]) => method === 'files.rename')).toBe(false)
    expect(call).toHaveBeenLastCalledWith(
      'files.delete',
      expect.objectContaining({ worktree: 'id:ssh-tree' })
    )
    failWriteResponse = true
    for (const cleanupUnavailable of [false, true]) {
      call.mockClear()
      failCleanup = cleanupUnavailable
      await expect(writeMeetingOutput(ctx, target, content)).rejects.toThrow('write response lost')
      const temporary = z
        .record(z.string(), z.unknown())
        .parse(call.mock.calls[0]?.[1]).relativePath
      expect(temporary).toMatch(/^\.bw\/meeting\.json\.partial-[\da-f-]{36}$/)
      expect(call.mock.calls.map(([method]) => method)).toEqual([
        'files.writeBase64Chunk',
        'files.delete'
      ])
      expect(call).toHaveBeenLastCalledWith('files.delete', {
        worktree: target.worktree,
        relativePath: temporary,
        ...target.provenance
      })
      expect(JSON.parse(publishedBytes.toString('utf8'))).toEqual(content)
      expect(bytes.length).toBe(cleanupUnavailable ? 24_000 : 0)
    }
    hostId = 'runtime:paired-host'
    const runtimeTarget = await meetingOutputTarget(
      ctx,
      'id:runtime-tree',
      '/srv/project/meeting.json'
    )
    expect(runtimeTarget.provenance.expectedExecutionHostId).toBe('runtime:paired-host')
  })
})
