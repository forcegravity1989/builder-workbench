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

test('annotations round-trip: public readback of an element annotation', async (t) => {
  const server = await startTestServer()
  t.after(() => server.close())
  const created = await json(
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: 'r.html' })
  )
  const api = `${server.base}/api/shares/${created.id}/annotations`

  const posted = await writeRequest(api, {
    author: '张三',
    text: '按钮文案建议改清楚',
    target: { selector: '#go', text: '', rect: { x: 1, y: 2, width: 3, height: 4 } }
  })
  assert.equal(posted.status, 201)
  const annotation = await json(posted)
  assert.equal(annotation.annotation.author, '张三')
  assert.equal(annotation.annotation.target.selector, '#go')
  assert.equal(annotation.annotation.target.text, '')
  assert.ok(annotation.deleteToken)
  assert.equal('deleteTokenHash' in annotation.annotation, false)

  const listed = await json(await fetch(api))
  assert.equal(listed.items.length, 1)
  assert.deepEqual(listed.items[0], annotation.annotation)
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
        headers: { 'x-delete-token': second.deleteToken }
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
  assert.deepEqual((await json(await fetch(api))).items, [])
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
    await writeRequest(`${server.base}/api/shares`, { content: HTML, fileName: '<draft>.html' })
  )

  const viewer = await fetch(created.url)
  assert.equal(viewer.status, 200)
  assert.equal(viewer.headers.get('content-security-policy'), VIEWER_CSP)
  assert.ok(
    viewer.headers.get('content-security-policy').includes("frame-ancestors 'none'"),
    'other sites must not be able to frame the viewer to clickjack a submit'
  )
  const viewerBody = await viewer.text()
  assert.ok(viewerBody.includes('&lt;draft&gt;.html'), 'the viewer header shows the file name')
  assert.ok(viewerBody.includes('content-frame'), 'the viewer embeds the content iframe')
  assert.ok(!viewerBody.includes('<h1>Report</h1>'), 'the viewer must not inline the raw content')

  const raw = await fetch(`${created.url}/raw`)
  assert.equal(await raw.text(), HTML)
  assert.equal(raw.headers.get('content-security-policy'), SHARE_PAGE_CSP)

  assert.equal((await fetch(`${server.base}/s/${'a'.repeat(22)}`)).status, 404)
  assert.equal((await fetch(`${server.base}/s/${'a'.repeat(22)}/raw`)).status, 404)
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
  assert.equal(
    (await json(await fetch(`${server.base}/api/shares/${live.id}/annotations`))).items.length,
    1
  )
})
