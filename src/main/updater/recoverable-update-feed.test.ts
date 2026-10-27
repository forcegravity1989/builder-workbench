import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse, stringify } from 'yaml'
import { z } from 'zod'
import { afterEach, expect, it } from 'vitest'
import { startRecoverableUpdateFeed } from './recoverable-update-feed'

const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).toReversed()) {
    await close()
  }
})

it('finishes the pinned GitHub package when its feed retires during transfer', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'workbench-feed-'))
  cleanup.push(() => rm(cacheDir, { recursive: true, force: true }))
  const bytes = Buffer.from('an installer payload')
  const paths: string[] = []
  let finishDownload: (() => void) | undefined
  const feed = await startRecoverableUpdateFeed({
    upstream: 'https://github.com/forcegravity1989/builder-workbench/releases/latest/download',
    cacheDir,
    fetch: async (url) => {
      paths.push(url)
      if (!url.endsWith('/latest.yml')) {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(bytes.subarray(0, 3))
              finishDownload = () => {
                controller.enqueue(bytes.subarray(3))
                controller.close()
              }
            }
          })
        )
      }
      return new Response(
        stringify({
          version: '0.8.0',
          files: [
            {
              url: 'workbench-windows-setup.exe',
              size: bytes.length,
              sha512: createHash('sha512').update(bytes).digest('base64')
            }
          ]
        })
      )
    }
  })
  cleanup.push(feed.close)
  const manifest = z
    .object({ files: z.array(z.object({ url: z.string() })) })
    .parse(parse(await (await fetch(`${feed.url}latest.yml`)).text()))
  expect((await fetch(feed.url.replace(/\/[a-f\d]+\/$/, '/wrong/latest.yml'))).status).toBe(404)
  const downloaded = await fetch(new URL(manifest.files[0]!.url, feed.url))
  const reader = downloaded.body!.getReader()
  const first = await reader.read()
  expect(Buffer.from(first.value!)).toEqual(bytes.subarray(0, 3))
  feed.close()
  if (!finishDownload) {
    throw new Error('The asset transfer did not start')
  }
  finishDownload()
  const chunks = [first.value!]
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) {
      break
    }
    chunks.push(chunk.value)
  }
  expect(Buffer.concat(chunks)).toEqual(bytes)
  expect(paths).toEqual([
    'https://github.com/forcegravity1989/builder-workbench/releases/latest/download/latest.yml',
    'https://github.com/forcegravity1989/builder-workbench/releases/download/v0.8.0/workbench-windows-setup.exe'
  ])
})
