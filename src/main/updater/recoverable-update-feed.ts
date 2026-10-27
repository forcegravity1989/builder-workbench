import { createHash, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { createServer, type ServerResponse } from 'node:http'
import { parse, stringify } from 'yaml'
import { z } from 'zod'
import { downloadResumableUpdate, type UpdateArtifact } from './resumable-update-download'

type FeedOptions = {
  upstream: string
  cacheDir: string
  fetch: (url: string, init: RequestInit) => Promise<Response>
}
const manifestSchema = z
  .object({
    version: z.string().min(1),
    files: z
      .array(
        z
          .object({
            url: z.string().min(1),
            sha512: z.string(),
            size: z.number().int().positive()
          })
          .passthrough()
      )
      .min(1)
  })
  .passthrough()

function artifactUrl(feed: string, filename: string, version: string): string {
  const base = feed.includes('/releases/latest/download')
    ? feed.replace('/releases/latest/download', `/releases/download/v${version}`)
    : feed
  return new URL(filename, `${base.replace(/\/+$/, '')}/`).href
}

async function sendChunk(
  response: ServerResponse,
  chunk: Uint8Array,
  signal: AbortSignal
): Promise<void> {
  signal.throwIfAborted()
  if (!response.write(chunk)) {
    await once(response, 'drain', { signal })
  }
}

/** A loopback feed adapts transport only; electron-updater still verifies and installs the package. */
export async function startRecoverableUpdateFeed(
  options: FeedOptions
): Promise<{ url: string; close: () => void }> {
  const prefix = `/${randomBytes(24).toString('hex')}/`
  const artifacts = new Map<string, UpdateArtifact>()
  const downloading = new Set<string>()
  const server = createServer((request, response) => {
    const controller = new AbortController()
    response.once('close', () => controller.abort())
    const serve = async (): Promise<void> => {
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      if (!path.startsWith(prefix) || !['GET', 'HEAD'].includes(request.method ?? '')) {
        response.writeHead(404).end()
        return
      }
      const filename = path.slice(prefix.length)
      if (filename === 'latest.yml') {
        const upstream = await options.fetch(`${options.upstream.replace(/\/+$/, '')}/latest.yml`, {
          signal: AbortSignal.timeout(5_000)
        })
        if (!upstream.ok) {
          response.writeHead(upstream.status).end()
          await upstream.body?.cancel()
          return
        }
        const manifest = manifestSchema.parse(parse(await upstream.text()))
        const files = manifest.files.map((entry) => {
          const url = artifactUrl(options.upstream, entry.url, manifest.version)
          const key = createHash('sha256').update(`${url}\n${entry.sha512}`).digest('hex')
          const name = new URL(url).pathname.split('/').pop()
          if (!name) {
            throw new Error('The update artifact has no filename.')
          }
          const route = `${key}/${name}`
          artifacts.set(route, { url, sha512: entry.sha512, size: entry.size })
          return { ...entry, url: route }
        })
        const body = stringify({ ...manifest, files, path: files[0].url })
        response.writeHead(200, { 'Content-Type': 'application/yaml', 'Cache-Control': 'no-store' })
        response.end(request.method === 'HEAD' ? undefined : body)
        return
      }
      const artifact = artifacts.get(filename)
      if (!artifact) {
        response.writeHead(404).end()
        return
      }
      if (request.headers.range) {
        // This adapter serves resumable full packages; native differential requests remain disabled.
        response.writeHead(416).end()
        return
      }
      if (request.method === 'HEAD') {
        response.writeHead(200, { 'Content-Length': artifact.size }).end()
        return
      }
      if (downloading.has(artifact.url)) {
        response.writeHead(409).end()
        return
      }
      downloading.add(artifact.url)
      try {
        response.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': artifact.size
        })
        response.flushHeaders()
        await downloadResumableUpdate(artifact, {
          cacheDir: options.cacheDir,
          fetch: options.fetch,
          signal: controller.signal,
          onChunk: (chunk) => sendChunk(response, chunk, controller.signal)
        })
        response.end()
      } finally {
        downloading.delete(artifact.url)
      }
    }
    void serve().catch((error: unknown) => {
      if (controller.signal.aborted) {
        return
      }
      console.warn(
        '[updater] Recoverable update transfer failed:',
        error instanceof Error ? error.message : String(error)
      )
      if (response.headersSent) {
        response.destroy()
      } else {
        response.writeHead(502).end('The update source could not complete the request.')
      }
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  server.on('error', (error) => console.warn('[updater] Update feed failed:', error.message))
  server.unref()
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Could not start the update download adapter.')
  }
  return {
    url: `http://127.0.0.1:${address.port}${prefix}`,
    close: () => {
      // A new tag retires this listener; existing downloads must keep their connection.
      server.close()
    }
  }
}
