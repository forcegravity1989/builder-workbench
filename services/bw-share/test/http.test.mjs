import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createClientTokenStore } from '../src/client-tokens.mjs'
import { DEFAULT_ENROLL_KEY } from '../src/config.mjs'
import { isShareError } from '../src/errors.mjs'
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

  const view = await fetch(`${body.url}/raw`)
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
  assert.equal(await (await fetch(`${body.url}/raw`)).text(), '<p>v2</p>')

  const removed = await fetch(`${server.base}/api/shares/${body.id}`, {
    method: 'DELETE',
    headers: { 'x-edit-token': body.editToken }
  })
  assert.equal(removed.status, 204)
  assert.equal(await removed.text(), '')
  assert.equal((await fetch(`${body.url}/raw`)).status, 404)
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
  assert.equal(await (await fetch(`${created.url}/raw`)).text(), HTML)
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
  const response = await fetch(`${created.url}/raw`, { method: 'HEAD' })
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

test('trustProxy keys the rate limit on the proxy-appended address, not a forged prefix', async (t) => {
  const server = await startTestServer({ trustProxy: true, rateLimitPerMinute: 1 })
  t.after(() => server.close())
  const payload = { content: HTML, fileName: 'report.html' }

  const first = await writeRequest(`${server.base}/api/shares`, payload, {
    'x-forwarded-for': '9.9.9.9, 10.0.0.7'
  })
  assert.equal(first.status, 201)

  // Same real peer, different forged prefix: the allowance must not reset.
  const second = await writeRequest(`${server.base}/api/shares`, payload, {
    'x-forwarded-for': '8.8.8.8, 10.0.0.7'
  })
  assert.equal(second.status, 429)
  assert.equal((await json(second)).error.code, 'rate_limited')
})

test('a served read releases the file so the next update succeeds', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'r.html' })
  )
  assert.equal(await (await fetch(`${created.url}/raw`)).text(), HTML)

  const updated = await updateRequest(
    `${server.base}/api/shares/${created.id}`,
    { content: '<p>v2</p>', fileName: 'r.html' },
    { 'x-edit-token': created.editToken }
  )
  assert.equal(updated.status, 200)
  assert.equal(await (await fetch(`${created.url}/raw`)).text(), '<p>v2</p>')
})

test('viewing while updating never answers 500 and never misstates content-length', async (t) => {
  const server = await startTestServer({ maxBytes: 4 * 1024 * 1024 })
  t.after(() => server.close())
  const large = `<p>${'y'.repeat(2 * 1024 * 1024)}</p>`
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: large, fileName: 'r.html' })
  )

  for (let round = 0; round < 12; round += 1) {
    const content = round % 2 === 0 ? '<p>small</p>' : large
    const [view, updated] = await Promise.all([
      fetch(`${created.url}/raw`),
      updateRequest(
        `${server.base}/api/shares/${created.id}`,
        { content, fileName: 'r.html' },
        { 'x-edit-token': created.editToken }
      )
    ])
    const updatedBody = await updated.text()
    assert.notEqual(updated.status, 500, `round ${round}: update answered 500 (${updatedBody})`)
    assert.ok(
      updated.status === 200 || updated.status === 503,
      `round ${round}: unexpected ${updated.status} (${updatedBody})`
    )
    if (updated.status === 503) {
      // The caller only sees a retryable 503, so the reason has to reach the operator's log.
      assert.ok(
        server.logs.some((line) => /gave up replacing/.test(line)),
        `round ${round}: a refused write left no diagnostic in the log`
      )
    }
    const declared = Number(view.headers.get('content-length'))
    const body = await view.text()
    assert.equal(
      Buffer.byteLength(body),
      declared,
      `round ${round}: content-length ${declared} but ${Buffer.byteLength(body)} bytes streamed`
    )
  }
})

test('a full client token registry reports enrollment_full, not a retryable busy', async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bw-share-full-'))
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }))
  const tokens = Array.from({ length: 5000 }, (_, index) => ({
    hash: String(index).padStart(64, '0'),
    createdAt: new Date().toISOString()
  }))
  await fs.writeFile(
    path.join(dataDir, 'client-tokens.json'),
    JSON.stringify({ version: 1, tokens })
  )

  const store = createClientTokenStore({ dataDir, log: () => {} })
  await store.init()
  assert.equal(store.size(), 5000)
  await assert.rejects(store.issue(), (error) => {
    assert.ok(isShareError(error), `expected ShareError, got ${String(error)}`)
    assert.equal(/** @type {{ status: number }} */ (error).status, 503)
    assert.equal(/** @type {{ code: string }} */ (error).code, 'enrollment_full')
    return true
  })
})

const DAMAGED_REGISTRIES = [
  ['truncated to zero bytes', ''],
  ['not JSON at all', '{ not json'],
  ['JSON of the wrong shape', JSON.stringify({ hello: 'world' })],
  ['a registry version this build does not know', JSON.stringify({ version: 99, tokens: [] })],
  // Shape-valid but empty: what an operator gets by emptying the file instead of deleting it. No
  // normal path writes an empty token list, so this must not read as a fresh instance.
  ['valid JSON holding an empty token list', JSON.stringify({ version: 1, tokens: [] })],
  [
    'valid JSON whose every token hash is unusable',
    JSON.stringify({
      version: 1,
      tokens: [
        { hash: 'not-a-digest', createdAt: '2026-01-01T00:00:00.000Z' },
        { hash: 'also-not-a-digest' }
      ]
    })
  ]
]

for (const [label, contents] of DAMAGED_REGISTRIES) {
  test(`a damaged token registry (${label}) refuses writes instead of reopening them`, async (t) => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bw-share-damaged-'))
    t.after(() => fs.rm(dataDir, { recursive: true, force: true }))
    await fs.writeFile(path.join(dataDir, 'client-tokens.json'), contents)

    const server = await startTestServer({}, { dataDir })
    t.after(() => server.close())
    assert.equal(server.clientTokens.isDegraded(), true)

    // Before the restart this service needed a device token; "no tokens loaded" must not read as
    // "fresh instance", or an authenticated service silently becomes anonymous-writable.
    const anonymous = await writeRequest(`${server.base}/api/shares`, {
      content: HTML,
      fileName: 'a.html'
    })
    assert.equal(anonymous.status, 503)
    assert.equal((await json(anonymous)).error.code, 'registry_unavailable')

    // Enrollment would rewrite the registry with only the new device, revoking everybody else.
    const enroll = await fetch(`${server.base}/api/client-tokens`, {
      method: 'POST',
      headers: { 'x-enroll-key': DEFAULT_ENROLL_KEY }
    })
    assert.equal(enroll.status, 503)
    assert.equal((await json(enroll)).error.code, 'registry_unavailable')

    // The file is left for the operator instead of being replaced or moved aside, so a restart
    // reaches the same verdict rather than the fresh-instance posture.
    assert.equal(await fs.readFile(path.join(dataDir, 'client-tokens.json'), 'utf8'), contents)
    assert.ok(
      server.logs.some((line) => /registry is unusable/.test(line)),
      `expected an operator-facing log, got: ${server.logs.join(' | ')}`
    )
  })
}

test('a damaged registry still serves shares and still honours a static token', async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bw-share-damaged-read-'))
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }))

  // Create a share while the instance is healthy and anonymous-open.
  const healthy = await startTestServer({}, { dataDir })
  const created = await json(
    await writeRequest(`${healthy.base}/api/shares`, { content: HTML, fileName: 'a.html' })
  )
  await healthy.close()

  await fs.writeFile(path.join(dataDir, 'client-tokens.json'), '{ not json')
  const server = await startTestServer({ uploadToken: 'static-secret' }, { dataDir })
  t.after(() => server.close())
  assert.equal(server.clientTokens.isDegraded(), true)

  // Reading needs no registry: colleagues keep being able to open the link. The link is fetched
  // from the restarted server, which listens on a new port.
  const view = await fetch(`${server.base}/s/${created.id}/raw`)
  assert.equal(view.status, 200)
  assert.equal(await view.text(), HTML)

  // A static token is verifiable without the registry, so operator scripts keep working.
  const withStatic = await writeRequest(
    `${server.base}/api/shares`,
    { content: HTML, fileName: 'b.html' },
    { 'x-upload-token': 'static-secret' }
  )
  assert.equal(withStatic.status, 201)
  await withStatic.body?.cancel()
})

test('a fresh instance with no registry still accepts anonymous writes', async (t) => {
  // Pins the distinction the degraded path depends on: "never enrolled" is the documented
  // fresh-instance posture, "registry unreadable" is not.
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bw-share-fresh-'))
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }))
  const server = await startTestServer({}, { dataDir })
  t.after(() => server.close())
  assert.equal(server.clientTokens.isDegraded(), false)

  const anonymous = await writeRequest(`${server.base}/api/shares`, {
    content: HTML,
    fileName: 'a.html'
  })
  assert.equal(anonymous.status, 201)
  await anonymous.body?.cancel()
})

test('an issued token still authenticates after a restart', async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bw-share-restart-'))
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }))

  const first = await startTestServer({ uploadToken: 'static-secret' }, { dataDir })
  const enrolled = await fetch(`${first.base}/api/client-tokens`, {
    method: 'POST',
    headers: { 'x-enroll-key': DEFAULT_ENROLL_KEY }
  })
  const { token } = await json(enrolled)
  await first.close()

  const second = await startTestServer({ uploadToken: 'static-secret' }, { dataDir })
  t.after(() => second.close())
  assert.equal(second.clientTokens.isDegraded(), false)
  const uploaded = await writeRequest(
    `${second.base}/api/shares`,
    { content: HTML, fileName: 'a.html' },
    { 'x-upload-token': token }
  )
  assert.equal(uploaded.status, 201)
  await uploaded.body?.cancel()
  // The durable write leaves no staging file behind.
  const leftovers = (await fs.readdir(dataDir)).filter((name) => name.includes('.tmp'))
  assert.deepEqual(leftovers, [])
})

test('a viewer who leaves mid-download does not hold the file against the next update', async (t) => {
  const server = await startTestServer({ maxBytes: 4 * 1024 * 1024 })
  t.after(() => server.close())
  const large = `<p>${'y'.repeat(2 * 1024 * 1024)}</p>`
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: large, fileName: 'r.html' })
  )

  // Read one chunk and walk away. pipe() leaves the source running when the destination closes, so
  // without an explicit destroy the handle survives until GC and, on Windows, the next update of
  // this share spends its whole rename retry budget and answers 503.
  const controller = new AbortController()
  const view = await fetch(`${created.url}/raw`, { signal: controller.signal })
  const reader = view.body.getReader()
  await reader.read()
  controller.abort()
  await reader.cancel().catch(() => {})
  await new Promise((resolve) => setTimeout(resolve, 200))

  const updated = await updateRequest(
    `${server.base}/api/shares/${created.id}`,
    { content: '<p>v2</p>', fileName: 'r.html' },
    { 'x-edit-token': created.editToken }
  )
  const body = await updated.text()
  assert.equal(
    updated.status,
    200,
    `update after an aborted read answered ${updated.status}: ${body}`
  )
  assert.equal(await (await fetch(`${created.url}/raw`)).text(), '<p>v2</p>')
})

test('a registry with some unusable entries keeps the usable ones and stays closed', async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bw-share-partial-'))
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }))

  // Enroll one device on a healthy instance, then corrupt a second entry by hand.
  const healthy = await startTestServer({ uploadToken: 'static-secret' }, { dataDir })
  const enrolled = await fetch(`${healthy.base}/api/client-tokens`, {
    method: 'POST',
    headers: { 'x-enroll-key': DEFAULT_ENROLL_KEY }
  })
  const { token } = await json(enrolled)
  await healthy.close()

  const registryPath = path.join(dataDir, 'client-tokens.json')
  const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'))
  registry.tokens.push({ hash: 'not-a-digest', createdAt: '2026-01-01T00:00:00.000Z' })
  await fs.writeFile(registryPath, JSON.stringify(registry, null, 2))

  const server = await startTestServer({ uploadToken: 'static-secret' }, { dataDir })
  t.after(() => server.close())
  // Dropping unusable entries only narrows who may write, so this is not a degraded registry.
  assert.equal(server.clientTokens.isDegraded(), false)
  assert.equal(server.clientTokens.size(), 1)

  const anonymous = await writeRequest(`${server.base}/api/shares`, {
    content: HTML,
    fileName: 'a.html'
  })
  assert.equal(anonymous.status, 401)
  await anonymous.body?.cancel()

  const withToken = await writeRequest(
    `${server.base}/api/shares`,
    { content: HTML, fileName: 'b.html' },
    { 'x-upload-token': token }
  )
  assert.equal(withToken.status, 201)
  await withToken.body?.cancel()

  assert.ok(
    server.logs.some(
      (line) => /held 1 unusable entr/.test(line) && /the other 1 still authenticate/.test(line)
    ),
    `expected a quantified partial-loss log, got: ${server.logs.join(' | ')}`
  )
})
