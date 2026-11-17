import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import test from 'node:test'
import { createClientTokenStore } from '../src/client-tokens.mjs'
import { SHARE_PAGE_CSP } from '../src/http.mjs'
import { startTestServer, updateRequest, writeRequest } from './helpers.mjs'

/** @param {Response} response */
async function json(response) {
  return /** @type {any} */ (await response.json())
}

/** POST without content-length so the server has to stop a chunked stream mid-body. */
function chunkedPost(url, body) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      url,
      { method: 'POST', headers: { 'content-type': 'application/json' } },
      (response) => {
        let data = ''
        response.on('data', (chunk) => (data += chunk))
        response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(data) }))
      }
    )
    request.on('error', reject)
    for (let offset = 0; offset < body.length; offset += 256 * 1024) {
      request.write(body.slice(offset, offset + 256 * 1024))
    }
    request.end()
  })
}

const HTML = '<!doctype html><meta charset="utf-8"><h1>Report</h1><script>1+1</script>'

test('GET /healthz reports liveness', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const response = await fetch(`${server.base}/healthz`)
  assert.equal(response.status, 200)
  assert.equal((await json(response)).status, 'ok')
})

test('create, view, update and delete round-trip', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())

  const created = await writeRequest(`${server.base}/api/shares`, {
    content: HTML,
    fileName: 'report.html',
    contentType: 'text/html'
  })
  assert.equal(created.status, 201)
  const body = await json(created)
  assert.match(body.id, /^[A-Za-z0-9_-]{22}$/)
  assert.equal(body.url, `${server.base}/s/${body.id}`)
  assert.ok(body.editToken)
  assert.ok(body.expiresAt)

  const view = await fetch(body.url)
  assert.equal(view.status, 200)
  assert.match(view.headers.get('content-type') ?? '', /^text\/html/)
  assert.equal(view.headers.get('content-security-policy'), SHARE_PAGE_CSP)
  assert.equal(view.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(await view.text(), HTML)

  const updated = await updateRequest(
    `${server.base}/api/shares/${body.id}`,
    { content: '<p>v2</p>', fileName: 'report-v2.html' },
    { 'x-edit-token': body.editToken }
  )
  assert.equal(updated.status, 200)
  assert.equal(await (await fetch(body.url)).text(), '<p>v2</p>')

  const removed = await fetch(`${server.base}/api/shares/${body.id}`, {
    method: 'DELETE',
    headers: { 'x-edit-token': body.editToken }
  })
  assert.equal(removed.status, 204)
  assert.equal(await removed.text(), '')
  assert.equal((await fetch(body.url)).status, 404)
})

test('upload token gates writes when configured', async (t) => {
  const server = await startTestServer({ uploadToken: 'secret' })
  t.after(() => server.close())
  const payload = { content: HTML, fileName: 'report.html' }

  assert.equal((await writeRequest(`${server.base}/api/shares`, payload)).status, 401)
  assert.equal(
    (await writeRequest(`${server.base}/api/shares`, payload, { 'x-upload-token': 'nope' })).status,
    401
  )
  assert.equal(
    (await writeRequest(`${server.base}/api/shares`, payload, { 'x-upload-token': 'secret' }))
      .status,
    201
  )
})

test('publicBaseUrl wins over the request host', async (t) => {
  const server = await startTestServer({ publicBaseUrl: 'https://share.example.com/team' })
  t.after(() => server.close())
  const response = await writeRequest(`${server.base}/api/shares`, {
    content: HTML,
    fileName: 'report.html'
  })
  const body = await json(response)
  assert.equal(body.url, `https://share.example.com/team/s/${body.id}`)
})

test('rejects malformed and unsupported payloads', async (t) => {
  const server = await startTestServer({ maxBytes: 64 })
  t.after(() => server.close())

  const malformed = await fetch(`${server.base}/api/shares`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not json'
  })
  assert.equal(malformed.status, 400)
  assert.equal((await json(malformed)).error.code, 'bad_request')

  const markdown = await writeRequest(`${server.base}/api/shares`, {
    content: '# hi',
    fileName: 'notes.md',
    contentType: 'text/markdown'
  })
  assert.equal(markdown.status, 415)

  const tooLarge = await writeRequest(`${server.base}/api/shares`, {
    content: 'x'.repeat(65),
    fileName: 'big.html'
  })
  assert.equal(tooLarge.status, 413)
  assert.equal((await json(tooLarge)).error.code, 'too_large')
})

test('edit token is required and checked for update and delete', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'report.html' })
  )

  const noToken = await updateRequest(`${server.base}/api/shares/${created.id}`, {
    content: 'x',
    fileName: 'x.html'
  })
  assert.equal(noToken.status, 403)

  const wrongToken = await updateRequest(
    `${server.base}/api/shares/${created.id}`,
    { content: 'x', fileName: 'x.html' },
    { 'x-edit-token': 'wrong' }
  )
  assert.equal(wrongToken.status, 403)

  const wrongDelete = await fetch(`${server.base}/api/shares/${created.id}`, {
    method: 'DELETE',
    headers: { 'x-edit-token': 'wrong' }
  })
  assert.equal(wrongDelete.status, 403)

  // A failed write must not have changed the share.
  assert.equal(await (await fetch(created.url)).text(), HTML)
})

test('unknown ids and routes are not found', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  assert.equal((await fetch(`${server.base}/s/short`)).status, 404)
  assert.equal((await fetch(`${server.base}/s/${'a'.repeat(22)}`)).status, 404)
  const unknown = await fetch(`${server.base}/nope`)
  assert.equal(unknown.status, 404)
  assert.equal((await json(unknown)).error.code, 'not_found')
})

test('HEAD returns headers without a body', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'report.html' })
  )
  const response = await fetch(created.url, { method: 'HEAD' })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-length'), String(Buffer.byteLength(HTML)))
  assert.equal(await response.text(), '')
})

test('unsupported methods report Allow', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const response = await fetch(`${server.base}/api/shares`, { method: 'DELETE' })
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('allow'), 'POST')

  const health = await fetch(`${server.base}/healthz`, { method: 'POST' })
  assert.equal(health.status, 405)
  assert.equal(health.headers.get('allow'), 'GET, HEAD')

  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'report.html' })
  )
  const view = await fetch(created.url, { method: 'POST' })
  assert.equal(view.status, 405)
  assert.equal(view.headers.get('allow'), 'GET, HEAD')
})

test('writes are rate limited per window', async (t) => {
  const server = await startTestServer({ rateLimitPerMinute: 1 })
  t.after(() => server.close())
  const payload = { content: HTML, fileName: 'report.html' }
  assert.equal((await writeRequest(`${server.base}/api/shares`, payload)).status, 201)
  const limited = await writeRequest(`${server.base}/api/shares`, payload)
  assert.equal(limited.status, 429)
  assert.equal((await json(limited)).error.code, 'rate_limited')
})

test('oversized bodies get a readable 413, with and without content-length', async (t) => {
  // maxBytes 64 makes the transport cap 64 * 6 + 1 MiB.
  const server = await startTestServer({ maxBytes: 64 })
  t.after(() => server.close())
  const big = 'x'.repeat(1024 * 1024 + 4096)

  const declared = await writeRequest(`${server.base}/api/shares`, {
    content: big,
    fileName: 'a.html'
  })
  assert.equal(declared.status, 413)
  assert.equal((await json(declared)).error.code, 'too_large')

  const streamed = await chunkedPost(`${server.base}/api/shares`, JSON.stringify({ content: big }))
  assert.equal(streamed.status, 413)
  assert.equal(streamed.body.error.code, 'too_large')
})

test('trustProxy takes host, scheme and client ip from forwarded headers', async (t) => {
  const server = await startTestServer({ trustProxy: true, rateLimitPerMinute: 1 })
  t.after(() => server.close())
  const payload = { content: HTML, fileName: 'report.html' }

  const first = await writeRequest(`${server.base}/api/shares`, payload, {
    'x-forwarded-proto': 'https',
    'x-forwarded-host': 'share.corp.example:8443',
    'x-forwarded-for': '10.0.0.7'
  })
  assert.equal(first.status, 201)
  assert.match((await json(first)).url, /^https:\/\/share\.corp\.example:8443\/s\//)

  // The window keys on the forwarded address, so a different client is not blocked.
  const second = await writeRequest(`${server.base}/api/shares`, payload, {
    'x-forwarded-for': '10.0.0.8'
  })
  assert.equal(second.status, 201)
})

test('an expired share is not readable', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'report.html' })
  )

  const metaPath = path.join(server.dataDir, `${created.id}.json`)
  const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'))
  meta.expiresAt = new Date(Date.now() - 1000).toISOString()
  await fs.writeFile(metaPath, JSON.stringify(meta))

  const view = await fetch(created.url)
  assert.equal(view.status, 404)
  assert.equal(view.headers.get('cache-control'), 'no-store')
})

test('enrollment issues a per-device token that gates uploads', async (t) => {
  const server = await startTestServer({ uploadToken: 'static-secret' })
  t.after(() => server.close())
  const payload = { content: HTML, fileName: 'report.html' }

  const denied = await fetch(`${server.base}/api/client-tokens`, { method: 'POST' })
  assert.equal(denied.status, 401)

  const wrongKey = await fetch(`${server.base}/api/client-tokens`, {
    method: 'POST',
    headers: { 'x-enroll-key': 'not-the-key' }
  })
  assert.equal(wrongKey.status, 401)

  const enrolled = await fetch(`${server.base}/api/client-tokens`, {
    method: 'POST',
    headers: { 'x-enroll-key': server.config.enrollKey }
  })
  assert.equal(enrolled.status, 201)
  const { token } = await json(enrolled)
  assert.match(token, /^[a-f0-9]{64}$/)

  assert.equal(
    (await writeRequest(`${server.base}/api/shares`, payload, { 'x-upload-token': token })).status,
    201
  )
  assert.equal(
    (await writeRequest(`${server.base}/api/shares`, payload, { 'x-upload-token': 'nope' })).status,
    401
  )
})

test('issued client tokens are stored as hashes only', async (t) => {
  const server = await startTestServer({ uploadToken: 'static-secret' })
  t.after(() => server.close())
  const { token } = await json(
    await fetch(`${server.base}/api/client-tokens`, {
      method: 'POST',
      headers: { 'x-enroll-key': server.config.enrollKey }
    })
  )

  const registry = JSON.parse(
    await fs.readFile(path.join(server.dataDir, 'client-tokens.json'), 'utf8')
  )
  assert.equal(registry.version, 1)
  assert.equal(registry.tokens.length, 1)
  assert.notEqual(registry.tokens[0].hash, token)
  assert.match(registry.tokens[0].hash, /^[a-f0-9]{64}$/)

  const reloaded = createClientTokenStore({ dataDir: server.dataDir, log: () => {} })
  await reloaded.init()
  assert.equal(reloaded.matches(token), true)
})
