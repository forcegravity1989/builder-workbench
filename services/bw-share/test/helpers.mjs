import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
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

export async function startTestServer(overrides = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bw-share-'))
  const config = testConfig(dataDir, overrides)
  const store = createShareStore(config)
  await store.init()
  /** @type {string[]} */
  const logs = []
  const clientTokens = createClientTokenStore({
    dataDir,
    log: (line) => logs.push(line)
  })
  await clientTokens.init()
  const server = http.createServer(
    createRequestHandler({ store, clientTokens, config, log: (line) => logs.push(line) })
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
      await fs.rm(dataDir, { recursive: true, force: true })
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
