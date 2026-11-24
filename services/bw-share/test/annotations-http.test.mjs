// HTTP-level tests for the share viewer and its annotations API (/s/:id viewer, /raw, /content,
// /api/shares/:id/annotations). Kept apart from http.test.mjs so each file stays focused.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { SHARE_PAGE_CSP, VIEWER_CSP } from '../src/http.mjs'
import { startTestServer, writeRequest } from './helpers.mjs'

/** @param {Response} response */
async function json(response) {
  return /** @type {any} */ (await response.json())
}

const HTML = '<!doctype html><meta charset="utf-8"><h1>Report</h1><script>1+1</script>'

test('annotations round-trip: post, list, author delete', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'r.html' })
  )
  const api = `${server.base}/api/shares/${created.id}/annotations`

  const posted = await writeRequest(api, {
    author: '张三',
    text: '按钮文案建议改清楚',
    target: { selector: '#go', text: '提交', rect: { x: 1, y: 2, width: 3, height: 4 } }
  })
  assert.equal(posted.status, 201)
  const annotation = await json(posted)
  assert.equal(annotation.annotation.author, '张三')
  assert.equal(annotation.annotation.target.selector, '#go')
  assert.ok(annotation.deleteToken)
  assert.equal('deleteTokenHash' in annotation.annotation, false)

  const listed = await json(await fetch(api))
  assert.equal(listed.items.length, 1)
  assert.deepEqual(listed.items[0], annotation.annotation)

  const removed = await fetch(`${api}/${annotation.annotation.id}`, {
    method: 'DELETE',
    headers: { 'x-delete-token': annotation.deleteToken }
  })
  assert.equal(removed.status, 204)
  assert.deepEqual((await json(await fetch(api))).items, [])
})

test('annotation writes are validated and capped', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'r.html' })
  )
  const api = `${server.base}/api/shares/${created.id}/annotations`

  const empty = await writeRequest(api, { text: '   ' })
  assert.equal(empty.status, 400)
  assert.equal((await json(empty)).error.code, 'bad_request')

  const tooLong = await writeRequest(api, { text: 'x'.repeat(2001) })
  assert.equal(tooLong.status, 400)
  assert.equal((await json(tooLong)).error.code, 'text_too_long')

  const badTarget = await writeRequest(api, { text: 'ok', target: { selector: '#go' } })
  assert.equal(badTarget.status, 400)
  assert.equal((await json(badTarget)).error.code, 'bad_request')

  const anonymous = await json(await writeRequest(api, { text: '匿名也能写' }))
  assert.equal(anonymous.annotation.author, '匿名')
})

test('element annotation with an empty text summary is accepted (icon/image/svg)', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'r.html' })
  )
  const api = `${server.base}/api/shares/${created.id}/annotations`

  // Selecting a no-text element sends target.text: '' — the API must accept it, not 400.
  const posted = await writeRequest(api, {
    text: '看看这个图标',
    target: { selector: '#icon-btn', text: '', rect: { x: 0, y: 0, width: 16, height: 16 } }
  })
  assert.equal(posted.status, 201)
  const body = await json(posted)
  assert.equal(body.annotation.target.text, '')
  assert.equal(body.annotation.target.selector, '#icon-btn')
  assert.ok(body.deleteToken)
})

test('annotation deletion checks author and owner credentials', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'r.html' })
  )
  const api = `${server.base}/api/shares/${created.id}/annotations`
  const first = await json(await writeRequest(api, { text: 'one' }))
  const second = await json(await writeRequest(api, { text: 'two' }))
  const item = (id) => `${api}/${id}`

  assert.equal((await fetch(item(first.annotation.id), { method: 'DELETE' })).status, 403)
  assert.equal(
    (
      await fetch(item(first.annotation.id), {
        method: 'DELETE',
        headers: { 'x-delete-token': 'wrong' }
      })
    ).status,
    403
  )

  // The share owner's edit token deletes any annotation without an author token.
  const ownerDelete = await fetch(item(second.annotation.id), {
    method: 'DELETE',
    headers: { 'x-edit-token': created.editToken }
  })
  assert.equal(ownerDelete.status, 204)
  // A wrong edit token is refused.
  assert.equal(
    (
      await fetch(item(first.annotation.id), {
        method: 'DELETE',
        headers: { 'x-edit-token': 'wrong' }
      })
    ).status,
    403
  )
  // The author's own token still works after the owner used theirs.
  assert.equal(
    (
      await fetch(item(first.annotation.id), {
        method: 'DELETE',
        headers: { 'x-delete-token': first.deleteToken }
      })
    ).status,
    204
  )
})

test('annotations answer 404 for unknown shares', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const api = `${server.base}/api/shares/${'a'.repeat(22)}/annotations`
  assert.equal((await fetch(api)).status, 404)
  assert.equal((await writeRequest(api, { text: 'x' })).status, 404)
})

test('annotation writes share the per-IP rate limit', async (t) => {
  // Budget 2: one for creating the share, one for the first annotation.
  const server = await startTestServer({ rateLimitPerMinute: 2 })
  t.after(() => server.close())
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'r.html' })
  )
  const api = `${server.base}/api/shares/${created.id}/annotations`

  assert.equal((await writeRequest(api, { text: 'first' })).status, 201)
  const limited = await writeRequest(api, { text: 'second' })
  assert.equal(limited.status, 429)
  assert.equal((await json(limited)).error.code, 'rate_limited')
  // Reads are never limited.
  assert.equal((await fetch(api)).status, 200)
})

test('annotation writes require a JSON content type', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'r.html' })
  )
  const api = `${server.base}/api/shares/${created.id}/annotations`

  // Sandboxed share content cannot send application/json without a preflight (never allowed
  // here), so it would fall back to text/plain — which this check refuses.
  const plain = await fetch(api, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ text: 'smuggled in as text' })
  })
  assert.equal(plain.status, 415)
  assert.equal((await json(plain)).error.code, 'unsupported_media_type')
  assert.deepEqual((await json(await fetch(api))).items, [], 'nothing was written')

  // A charset parameter stays acceptable, matching the viewer's own requests.
  const withCharset = await fetch(api, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ text: 'ok' })
  })
  assert.equal(withCharset.status, 201)

  // Media types are case-insensitive (RFC 9110); a mixed-case type is still JSON.
  const mixedCase = await fetch(api, {
    method: 'POST',
    headers: { 'content-type': 'Application/JSON' },
    body: JSON.stringify({ text: 'ok too' })
  })
  assert.equal(mixedCase.status, 201)
})

test('/s/:id serves the viewer page; /raw keeps the original bytes', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'r.html' })
  )

  const viewer = await fetch(created.url)
  assert.equal(viewer.status, 200)
  assert.equal(viewer.headers.get('content-security-policy'), VIEWER_CSP)
  assert.ok(
    viewer.headers.get('content-security-policy').includes("frame-ancestors 'none'"),
    'other sites must not be able to frame the viewer to clickjack a submit'
  )
  const viewerBody = await viewer.text()
  assert.ok(viewerBody.includes('r.html'), 'the viewer header shows the file name')
  assert.ok(viewerBody.includes('content-frame'), 'the viewer embeds the content iframe')
  assert.ok(!viewerBody.includes('<h1>Report</h1>'), 'the viewer must not inline the raw content')

  const raw = await fetch(`${created.url}/raw`)
  assert.equal(await raw.text(), HTML)
  assert.equal(raw.headers.get('content-security-policy'), SHARE_PAGE_CSP)

  assert.equal((await fetch(`${server.base}/s/${'a'.repeat(22)}`)).status, 404)
  assert.equal((await fetch(`${server.base}/s/${'a'.repeat(22)}/raw`)).status, 404)
})

test('/s/:id/content appends the bridge after the original bytes', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'r.html' })
  )

  const content = await fetch(`${created.url}/content`)
  assert.equal(content.status, 200)
  assert.equal(content.headers.get('content-security-policy'), SHARE_PAGE_CSP)
  const body = await content.text()
  assert.ok(body.startsWith(HTML), 'the original bytes come first')
  assert.ok(body.includes('bw-anno-ready'), 'the bridge script is appended')
  assert.equal(
    Number(content.headers.get('content-length')),
    Buffer.byteLength(body),
    'content-length covers content plus bridge'
  )
})

test('the viewer escapes the file name it interpolates', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, {
      content: HTML,
      fileName: '<script>alert(1)</script>.html'
    })
  )

  const viewerBody = await (await fetch(created.url)).text()
  assert.ok(
    viewerBody.includes('&lt;script&gt;'),
    'the file name must arrive escaped, not as live markup'
  )
  assert.ok(!viewerBody.includes('<script>alert(1)'), 'no raw script from the file name')
})

test('annotations answer 404 once the share has expired', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'r.html' })
  )
  const api = `${server.base}/api/shares/${created.id}/annotations`
  assert.equal((await writeRequest(api, { text: 'before expiry' })).status, 201)

  const metaPath = path.join(server.dataDir, `${created.id}.json`)
  const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'))
  meta.expiresAt = new Date(Date.now() - 1000).toISOString()
  await fs.writeFile(metaPath, JSON.stringify(meta))

  assert.equal((await fetch(api)).status, 404)
  assert.equal((await writeRequest(api, { text: 'after expiry' })).status, 404)
  assert.equal(
    (
      await fetch(`${api}/anything`, {
        method: 'DELETE',
        headers: { 'x-edit-token': created.editToken }
      })
    ).status,
    404
  )
})

test('sweep removes orphan annotation files but keeps a live share’s annotations', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const orphan = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'o.html' })
  )
  const live = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'l.html' })
  )
  await writeRequest(`${server.base}/api/shares/${orphan.id}/annotations`, { text: 'x' })
  await writeRequest(`${server.base}/api/shares/${live.id}/annotations`, { text: 'y' })
  const orphanAnno = path.join(server.dataDir, `${orphan.id}.annotations.json`)
  const liveAnno = path.join(server.dataDir, `${live.id}.annotations.json`)

  // Drop the orphan share's meta and content, leaving its annotation file behind.
  await fs.rm(path.join(server.dataDir, `${orphan.id}.json`))
  await fs.rm(path.join(server.dataDir, `${orphan.id}.html`))
  await server.store.sweep()

  await assert.rejects(fs.access(orphanAnno), 'orphan annotation file is reclaimed')
  await fs.access(liveAnno)
  assert.equal((await json(await fetch(`${server.base}/api/shares/${live.id}/annotations`))).items.length, 1)
})

test('annotation deletes share the per-IP rate limit', async (t) => {
  // Budget 2: one for creating the share, one for the annotation; the delete is the third write.
  const server = await startTestServer({ rateLimitPerMinute: 2 })
  t.after(() => server.close())
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'r.html' })
  )
  const api = `${server.base}/api/shares/${created.id}/annotations`
  const posted = await json(await writeRequest(api, { text: 'one' }))

  const limited = await fetch(`${api}/${posted.annotation.id}`, {
    method: 'DELETE',
    headers: { 'x-delete-token': posted.deleteToken }
  })
  assert.equal(limited.status, 429)
  assert.equal((await json(limited)).error.code, 'rate_limited')
  assert.equal((await json(await fetch(api))).items.length, 1, 'nothing was deleted')
})

test('HEAD on viewer, content and raw returns headers without a body', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'r.html' })
  )

  for (const url of [created.url, `${created.url}/content`, `${created.url}/raw`]) {
    const head = await fetch(url, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(await head.text(), '')
    assert.ok(Number(head.headers.get('content-length')) > 0)
  }
})
