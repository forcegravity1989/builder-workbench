import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { downloadResumableUpdate } from './resumable-update-download'

const content = Buffer.from('a verified update package '.repeat(2048))
const artifact = {
  url: 'https://example.test/v0.8.0/workbench-windows-setup.exe',
  size: content.length,
  sha512: createHash('sha512').update(content).digest('base64')
}
const caches: string[] = []
async function cache(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'workbench-update-'))
  caches.push(path)
  return path
}
afterEach(async () => {
  await Promise.all(caches.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

function interrupted(): Response {
  let reads = 0
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (reads++ === 0) {
          controller.enqueue(content.subarray(0, 4096))
        } else {
          controller.error(new TypeError('net::ERR_CONTENT_LENGTH_MISMATCH'))
        }
      }
    })
  )
}

function resumed(offset: number): Response {
  return new Response(content.subarray(offset), {
    status: offset ? 206 : 200,
    headers: offset
      ? { 'Content-Range': `bytes ${offset}-${content.length - 1}/${content.length}` }
      : {}
  })
}

describe('resumable update byte protocol', () => {
  it('reconnects after a mid-body failure and emits each byte once', async () => {
    const ranges: unknown[] = []
    const chunks: Uint8Array[] = []
    await downloadResumableUpdate(artifact, {
      cacheDir: await cache(),
      signal: new AbortController().signal,
      retryDelayMs: 0,
      onChunk: async (chunk) => {
        chunks.push(chunk)
      },
      fetch: async (_, init) => {
        const range = new Headers(init.headers).get('range')
        ranges.push(range)
        return range ? resumed(4096) : interrupted()
      }
    })
    expect(ranges).toEqual([null, 'bytes=4096-'])
    expect(Buffer.concat(chunks)).toEqual(content)
  })

  it('retains a failed transfer across a new download invocation', async () => {
    const cacheDir = await cache()
    const base = {
      cacheDir,
      signal: new AbortController().signal,
      onChunk: async () => {},
      retries: 0
    }
    await expect(
      downloadResumableUpdate(artifact, { ...base, fetch: async () => interrupted() })
    ).rejects.toThrow(/MISMATCH/)
    const chunks: Uint8Array[] = []
    await downloadResumableUpdate(artifact, {
      ...base,
      onChunk: async (chunk) => {
        chunks.push(chunk)
      },
      fetch: async (_, init) => {
        expect(new Headers(init.headers).get('range')).toBe('bytes=4096-')
        return resumed(4096)
      }
    })
    expect(Buffer.concat(chunks)).toEqual(content)
  })

  it('handles a server ignoring Range without duplicating the cached prefix', async () => {
    let attempts = 0
    const chunks: Uint8Array[] = []
    await downloadResumableUpdate(artifact, {
      cacheDir: await cache(),
      signal: new AbortController().signal,
      retryDelayMs: 0,
      onChunk: async (chunk) => {
        chunks.push(chunk)
      },
      fetch: async () => (attempts++ ? resumed(0) : interrupted())
    })
    expect(Buffer.concat(chunks)).toEqual(content)
  })

  it('rejects an incorrect Content-Range instead of combining unrelated bytes', async () => {
    await expect(
      downloadResumableUpdate(artifact, {
        cacheDir: await cache(),
        signal: new AbortController().signal,
        onChunk: async () => {},
        fetch: async () =>
          new Response(content, {
            status: 206,
            headers: { 'Content-Range': `bytes 7-${content.length - 1}/${content.length}` }
          })
      })
    ).rejects.toThrow(/unexpected byte range/)
  })

  it('removes corrupt cached bytes so a manual retry can recover', async () => {
    const cacheDir = await cache()
    await expect(
      downloadResumableUpdate(artifact, {
        cacheDir,
        signal: new AbortController().signal,
        onChunk: async () => {},
        fetch: async () => new Response(Buffer.alloc(content.length))
      })
    ).rejects.toThrow(/SHA-512/)
    expect(await readdir(cacheDir)).toEqual([])
  })

  it('stops on cancellation and leaves the partial download available', async () => {
    const controller = new AbortController()
    const cacheDir = await cache()
    await expect(
      downloadResumableUpdate(artifact, {
        cacheDir,
        signal: controller.signal,
        onChunk: async () => {
          controller.abort()
        },
        fetch: async () => interrupted()
      })
    ).rejects.toThrow()
    expect(await readdir(cacheDir)).toHaveLength(1)
  })
})
