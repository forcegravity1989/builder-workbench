import { mkdtemp, open, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ARTIFACT_HANDLERS } from './artifacts'
import { ARTIFACT_CLI_MAX_RPC_BYTES } from '../../shared/artifacts'
import type { ShareListEntry, ShareResult } from '../../shared/workbench/share'

const published = {
  id: 'share-1',
  url: 'http://shares.example/s/share-1',
  expiresAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-08-06T00:00:00.000Z',
  change: 'created' as const
}

const listEntry: ShareListEntry = {
  id: 'share-1',
  url: 'http://shares.example/s/share-1',
  expiresAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-08-06T00:00:00.000Z',
  sourceKey: '/repo/report.html'
}

function okResult<T>(value: T): ShareResult<T> {
  return { ok: true, value }
}

function rpcResponse<T>(result: T) {
  return { id: 'request-1', ok: true, result, _meta: { runtimeId: 'runtime-1' } }
}

afterEach(() => vi.restoreAllMocks())

describe('artifact CLI handlers', () => {
  it('reads a relative HTML file and publishes it through the host share service', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'orca-artifact-cli-'))
    await writeFile(join(cwd, 'report.html'), '<h1>Hi</h1>', 'utf8')
    const call = vi.fn().mockResolvedValue(rpcResponse(okResult(published)))
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await ARTIFACT_HANDLERS['artifacts share']!({
      client: { call } as never,
      cwd,
      flags: new Map([['file', 'report.html']]),
      json: false
    })

    expect(call).toHaveBeenCalledWith('workbench.share.publish', {
      sourceKey: join(cwd, 'report.html'),
      content: '<h1>Hi</h1>',
      fileName: 'report.html'
    })
    expect(log).toHaveBeenCalledWith(published.url)
  })

  it('renders a Markdown file into an HTML document like the share button does', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'orca-artifact-cli-'))
    await writeFile(join(cwd, 'notes.md'), '# Title\n\ntext', 'utf8')
    const call = vi.fn().mockResolvedValue(rpcResponse(okResult(published)))
    vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await ARTIFACT_HANDLERS['artifacts share']!({
      client: { call } as never,
      cwd,
      flags: new Map([['file', 'notes.md']]),
      json: false
    })

    const request = call.mock.calls[0]![1] as { content: string; fileName: string }
    expect(call.mock.calls[0]![0]).toBe('workbench.share.publish')
    expect(request.fileName).toBe('notes.html')
    expect(request.content).toContain('<!doctype html>')
    expect(request.content).toContain('<title>notes</title>')
    expect(request.content).toContain('<h1>Title</h1>')
  })

  it('surfaces a share failure with its stable code and message', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'orca-artifact-cli-'))
    await writeFile(join(cwd, 'report.html'), '<h1>Hi</h1>', 'utf8')
    const call = vi.fn().mockResolvedValue(
      rpcResponse({
        ok: false,
        error: { code: 'too-large', message: '文件超过 10 MiB，无法分享' }
      } satisfies ShareResult<never>)
    )

    await expect(
      ARTIFACT_HANDLERS['artifacts share']!({
        client: { call } as never,
        cwd,
        flags: new Map([['file', 'report.html']]),
        json: false
      })
    ).rejects.toMatchObject({ code: 'too-large', message: '文件超过 10 MiB，无法分享' })
  })

  it('rejects unsupported file extensions before calling the runtime', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'orca-artifact-cli-'))
    await writeFile(join(cwd, 'report.txt'), 'hello', 'utf8')
    const call = vi.fn()

    await expect(
      ARTIFACT_HANDLERS['artifacts share']!({
        client: { call } as never,
        cwd,
        flags: new Map([['file', 'report.txt']]),
        json: false
      })
    ).rejects.toThrow(/HTML or Markdown/)
    expect(call).not.toHaveBeenCalled()
  })

  it('rejects a sparse oversized file before attempting the RPC', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'orca-artifact-cli-'))
    const handle = await open(join(cwd, 'oversized.html'), 'w')
    await handle.truncate(ARTIFACT_CLI_MAX_RPC_BYTES + 1)
    await handle.close()
    const call = vi.fn()

    await expect(
      ARTIFACT_HANDLERS['artifacts share']!({
        client: { call } as never,
        cwd,
        flags: new Map([['file', 'oversized.html']]),
        json: false
      })
    ).rejects.toThrow(/too large/)
    expect(call).not.toHaveBeenCalled()
  })

  it('lists the links this computer has shared', async () => {
    const call = vi.fn().mockResolvedValue(rpcResponse(okResult([listEntry])))
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await ARTIFACT_HANDLERS['artifacts list']!({
      client: { call } as never,
      cwd: '/repo',
      flags: new Map(),
      json: false
    })

    expect(call).toHaveBeenCalledWith('workbench.share.list', {})
    const printed = String(log.mock.calls.at(-1)?.[0])
    expect(printed).toContain('/repo/report.html')
    expect(printed).toContain('id: share-1')
    expect(printed).toContain(published.url)
  })

  it('unshares by resolved file path', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'orca-artifact-cli-'))
    const call = vi.fn().mockResolvedValue(rpcResponse(okResult(null)))
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await ARTIFACT_HANDLERS['artifacts unshare']!({
      client: { call } as never,
      cwd,
      flags: new Map([['file', 'report.html']]),
      json: false
    })

    expect(call).toHaveBeenCalledWith('workbench.share.remove', {
      sourceKey: join(cwd, 'report.html')
    })
    expect(log).toHaveBeenCalledWith('Artifact deleted.')
  })

  it('deletes by id after resolving it to the shared file', async () => {
    const call = vi.fn().mockImplementation((method: string) => {
      if (method === 'workbench.share.list') {
        return Promise.resolve(rpcResponse(okResult([listEntry])))
      }
      return Promise.resolve(rpcResponse(okResult(null)))
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await ARTIFACT_HANDLERS['artifacts delete']!({
      client: { call } as never,
      cwd: '/repo',
      flags: new Map([['id', 'share-1']]),
      json: false
    })

    expect(call).toHaveBeenCalledWith('workbench.share.remove', {
      sourceKey: '/repo/report.html'
    })
    expect(log).toHaveBeenCalledWith('Artifact deleted.')
  })

  it('rejects an unknown id without calling remove', async () => {
    const call = vi.fn().mockResolvedValue(rpcResponse(okResult([listEntry])))

    await expect(
      ARTIFACT_HANDLERS['artifacts delete']!({
        client: { call } as never,
        cwd: '/repo',
        flags: new Map([['id', 'missing']]),
        json: false
      })
    ).rejects.toMatchObject({ code: 'not_found' })
    expect(call).not.toHaveBeenCalledWith('workbench.share.remove', expect.anything())
  })

  it.each(['environment', 'pairing-code'])(
    'rejects explicit remote selector --%s',
    async (flag) => {
      const call = vi.fn()

      await expect(
        ARTIFACT_HANDLERS['artifacts list']!({
          client: { call } as never,
          cwd: '/repo',
          flags: new Map([[flag, 'remote-host']]),
          json: false
        })
      ).rejects.toThrow(/does not retarget artifact commands/)
      expect(call).not.toHaveBeenCalled()
    }
  )
})
