import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export type UpdateArtifact = { url: string; sha512: string; size: number }
type DownloadOptions = {
  cacheDir: string
  fetch: (url: string, init: RequestInit) => Promise<Response>
  signal: AbortSignal
  onChunk: (chunk: Uint8Array) => Promise<void>
  retries?: number
  retryDelayMs?: number
}

class DownloadProtocolError extends Error {}

async function verifyArtifact(file: string, artifact: UpdateArtifact): Promise<void> {
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk)
  }
  const encoding = /^[a-f\d]{128}$/i.test(artifact.sha512) ? 'hex' : 'base64'
  if (hash.digest(encoding) !== artifact.sha512) {
    await rm(file, { force: true })
    throw new DownloadProtocolError(
      'The downloaded update failed its SHA-512 check. Retry the download.'
    )
  }
}

async function pruneOldDownloads(cacheDir: string, current: string): Promise<void> {
  for (const entry of await readdir(cacheDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/^[a-f\d]{64}\.part$/.test(entry.name)) {
      continue
    }
    const file = join(cacheDir, entry.name)
    if (file === current) {
      continue
    }
    const info = await stat(file)
    if (Date.now() - info.mtimeMs > 7 * 24 * 60 * 60 * 1000) {
      await rm(file, { force: true })
    }
  }
}

async function fetchArtifact(
  artifact: UpdateArtifact,
  options: DownloadOptions,
  offset: number
): Promise<Response> {
  options.signal.throwIfAborted()
  const headerTimeout = new AbortController()
  const timer = setTimeout(() => headerTimeout.abort(), 30_000)
  timer.unref()
  try {
    const response = await options.fetch(artifact.url, {
      headers: {
        'Accept-Encoding': 'identity',
        ...(offset ? { Range: `bytes=${offset}-` } : {})
      },
      signal: AbortSignal.any([options.signal, headerTimeout.signal])
    })
    if (response.ok) {
      return response
    }
    await response.body?.cancel()
    throw response.status >= 500 || [408, 429].includes(response.status)
      ? new Error(`Update download returned HTTP ${response.status}.`)
      : new DownloadProtocolError(`Update download returned HTTP ${response.status}.`)
  } finally {
    clearTimeout(timer)
  }
}

/** The cache lives outside electron-updater's pending directory, which it clears on failure. */
export async function downloadResumableUpdate(
  artifact: UpdateArtifact,
  options: DownloadOptions
): Promise<void> {
  if (
    !Number.isSafeInteger(artifact.size) ||
    artifact.size <= 0 ||
    !/^(?:[A-Za-z\d+/]{86}==|[a-f\d]{128})$/i.test(artifact.sha512)
  ) {
    throw new DownloadProtocolError('The update manifest has an invalid file size or SHA-512.')
  }
  await mkdir(options.cacheDir, { recursive: true })
  const key = createHash('sha256')
    .update(`${artifact.url}\n${artifact.sha512}\n${artifact.size}`)
    .digest('hex')
  const file = join(options.cacheDir, `${key}.part`)
  await pruneOldDownloads(options.cacheDir, file)
  const output = await open(file, 'a+')
  let offset = (await output.stat()).size
  try {
    if (offset > artifact.size) {
      await output.truncate(0)
      offset = 0
    }
    if (offset === artifact.size) {
      await verifyArtifact(file, artifact)
    }
    if (offset) {
      for await (const chunk of createReadStream(file, { end: offset - 1 })) {
        options.signal.throwIfAborted()
        await options.onChunk(chunk)
      }
    }
    let failures = 0
    while (offset < artifact.size) {
      options.signal.throwIfAborted()
      try {
        const response = await fetchArtifact(artifact, options, offset)
        const range = response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/)
        if (
          response.status === 206 &&
          (!range || Number(range[1]) !== offset || Number(range[3]) !== artifact.size)
        ) {
          await response.body?.cancel()
          throw new DownloadProtocolError('The update server returned an unexpected byte range.')
        }
        if (![200, 206].includes(response.status) || !response.body) {
          await response.body?.cancel()
          throw new DownloadProtocolError('The update server returned an invalid response.')
        }
        // A server may ignore Range. Replay its prefix over the network, but never append it twice.
        let skip = response.status === 200 ? offset : 0
        const reader = response.body.getReader()
        const timeout = setTimeout(() => {
          void reader.cancel('Update download stalled')
        }, 30_000)
        timeout.unref()
        try {
          while (true) {
            const result = await reader.read()
            if (result.done) {
              break
            }
            timeout.refresh()
            options.signal.throwIfAborted()
            const skipped = Math.min(skip, result.value.length)
            skip -= skipped
            const chunk = result.value.subarray(skipped)
            if (!chunk.length) {
              continue
            }
            if (offset + chunk.length > artifact.size) {
              throw new DownloadProtocolError(
                'The update server sent more bytes than the manifest declares.'
              )
            }
            await output.writeFile(chunk)
            offset += chunk.length
            await options.onChunk(chunk)
          }
        } finally {
          clearTimeout(timeout)
          await reader.cancel().catch(() => {})
        }
        if (offset < artifact.size) {
          throw new Error('The update connection ended before the file was complete.')
        }
      } catch (error) {
        options.signal.throwIfAborted()
        if (error instanceof DownloadProtocolError || failures >= (options.retries ?? 5)) {
          throw error
        }
        const waitMs = Math.min((options.retryDelayMs ?? 1_000) * 2 ** failures++, 16_000)
        await delay(waitMs, undefined, { signal: options.signal })
      }
    }
    await output.sync()
    await verifyArtifact(file, artifact)
  } finally {
    await output.close()
  }
}
