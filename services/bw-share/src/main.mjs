import { readFileSync } from 'node:fs'
import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { createAnnotationStore } from './annotations-store.mjs'
import { loadConfig } from './config.mjs'
import { createClientTokenStore } from './client-tokens.mjs'
import { createRequestHandler } from './http.mjs'
import { createShareStore } from './store.mjs'

const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const SHUTDOWN_GRACE_MS = 5000

/**
 * Start the service. Errors thrown here are startup failures: they are reported and the process
 * exits non-zero so the supervisor (systemd) can surface a clear unit state.
 *
 * @param {{ config?: import('./config.mjs').ShareConfig, log?: (line: string) => void }} [options]
 */
export async function startServer(options = {}) {
  const log = options.log ?? console.log
  const config = options.config ?? loadConfig()
  const store = createShareStore({ ...config, log })
  await store.init()
  const clientTokens = createClientTokenStore({ dataDir: config.dataDir, log })
  await clientTokens.init()
  const annotations = createAnnotationStore({ dataDir: config.dataDir, log })
  const viewerHtml = readFileSync(new URL('./viewer.html', import.meta.url), 'utf8')
  const bridgeScript = readFileSync(new URL('./bridge.js', import.meta.url), 'utf8')
  const removed = await store.sweep()
  if (removed > 0) {
    log(`removed ${removed} expired share(s) at startup`)
  }
  if (!config.uploadToken && clientTokens.size() === 0 && !clientTokens.isDegraded()) {
    log(
      'warning: no upload token is configured and no device has enrolled yet; uploads are open until one does.'
    )
  }
  const server = http.createServer(
    createRequestHandler({
      store,
      annotations,
      clientTokens,
      config,
      viewerHtml,
      bridgeScript,
      log
    })
  )
  // A 200 MiB report can arrive as a much larger transport body once JSON escaping is counted, and
  // large inlined images need time on slow links. Headers keep the tight budget.
  server.requestTimeout = 600_000
  server.headersTimeout = 15_000
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      reject(error)
    }
    server.once('error', onError)
    server.listen(config.port, config.host, () => {
      server.off('error', onError)
      resolve(undefined)
    })
  })
  const sweeper = setInterval(() => {
    store.sweep().catch((error) => {
      log(`sweep failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  }, SWEEP_INTERVAL_MS)
  sweeper.unref()
  const address = server.address()
  const boundPort = typeof address === 'object' && address ? address.port : config.port
  log(`bw-share listening on http://${config.host}:${boundPort} (data: ${config.dataDir})`)
  return { server, store, clientTokens, config, sweeper }
}

/**
 * @param {{ server: import('node:http').Server, sweeper: NodeJS.Timeout }} handle
 * @param {(line: string) => void} log
 */
export function installShutdownHandlers({ server, sweeper }, log) {
  let closing = false
  const shutdown = (signal) => {
    if (closing) {
      return
    }
    closing = true
    log(`received ${signal}, shutting down`)
    clearInterval(sweeper)
    server.close(() => {
      process.exit(0)
    })
    setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const log = (line) => console.log(`[bw-share] ${line}`)
  try {
    const handle = await startServer({ log })
    installShutdownHandlers(handle, log)
  } catch (error) {
    log(`startup failed: ${error instanceof Error ? error.stack : String(error)}`)
    process.exit(1)
  }
}
