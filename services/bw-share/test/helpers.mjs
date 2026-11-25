import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createAnnotationStore } from '../src/annotations-store.mjs'
import { createClientTokenStore } from '../src/client-tokens.mjs'
import { DEFAULT_ENROLL_KEY } from '../src/config.mjs'
import { createRequestHandler } from '../src/http.mjs'
import { createShareStore } from '../src/store.mjs'

/** @param {Record<string, unknown>} [overrides] */
export function testConfig(dataDir, overrides = {}) {
  return {
    host: '127.0.0.1',
    port: 0,
    dataDir,
    uploadToken: '',
    enrollKey: DEFAULT_ENROLL_KEY,
    publicBaseUrl: '',
    maxBytes: 1024 * 1024,
    retentionDays: 30,
    rateLimitPerMinute: 0,
    trustProxy: false,
    ...overrides
  }
}

export async function makeStore(overrides = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bw-share-'))
  const config = testConfig(dataDir, overrides)
  const store = createShareStore(config)
  await store.init()
  return {
    dataDir,
    config,
    store,
    async cleanup() {
      await fs.rm(dataDir, { recursive: true, force: true })
    }
  }
}

/**
 * @param {Record<string, unknown>} [overrides]
 * @param {{ dataDir?: string }} [options]  Pass a prepared data directory to seed registry or share
 *   state before the service reads it — a damaged registry, an existing share, a full token list.
 */
export async function startTestServer(overrides = {}, options = {}) {
  const dataDir = options.dataDir ?? (await fs.mkdtemp(path.join(os.tmpdir(), 'bw-share-')))
  // A caller-provided directory outlives one server: the damaged-registry and restart cases boot
  // twice over the same state, so only remove what this helper created.
  const ownsDataDir = options.dataDir === undefined
  const config = testConfig(dataDir, overrides)
  /** @type {string[]} */
  const logs = []
  const log = (line) => logs.push(line)
  const store = createShareStore({ ...config, log })
  await store.init()
  const clientTokens = createClientTokenStore({ dataDir, log })
  await clientTokens.init()
  const annotations = createAnnotationStore({ dataDir, log })
  const viewerHtml = readFileSync(new URL('../src/viewer.html', import.meta.url), 'utf8')
  const bridgeScript = readFileSync(new URL('../src/bridge.js', import.meta.url), 'utf8')
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
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = /** @type {import('node:net').AddressInfo} */ (server.address())
  return {
    base: `http://127.0.0.1:${address.port}`,
    dataDir,
    config,
    store,
    clientTokens,
    logs,
    server,
    async close() {
      server.closeAllConnections?.()
      await new Promise((resolve) => server.close(resolve))
      if (ownsDataDir) {
        await fs.rm(dataDir, { recursive: true, force: true })
      }
    }
  }
}

/** @param {string} url @param {Record<string, unknown>} body @param {Record<string, string>} [headers] */
export function writeRequest(url, body, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
}

/** @param {string} url @param {Record<string, unknown>} body @param {Record<string, string>} [headers] */
export function updateRequest(url, body, headers = {}) {
  return fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
}
