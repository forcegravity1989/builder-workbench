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

it('serves the native updater a verified package from the pinned GitHub release', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'workbench-feed-'))
  cleanup.push(() => rm(cacheDir, { recursive: true, force: true }))
  const bytes = Buffer.from('an installer payload')
  const paths: string[] = []
  const feed = await startRecoverableUpdateFeed({
    upstream: 'https://github.com/forcegravity1989/builder-workbench/releases/latest/download',
    cacheDir,
    fetch: async (url) => {
      paths.push(url)
      if (!url.endsWith('/latest.yml')) {
        return new Response(bytes)
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
  const downloaded = await fetch(new URL(manifest.files[0]!.url, feed.url))
  expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(bytes)
  expect(paths).toEqual([
    'https://github.com/forcegravity1989/builder-workbench/releases/latest/download/latest.yml',
    'https://github.com/forcegravity1989/builder-workbench/releases/download/v0.8.0/workbench-windows-setup.exe'
  ])
  expect((await fetch(feed.url.replace(/\/[a-f\d]+\/$/, '/wrong/latest.yml'))).status).toBe(404)
})
