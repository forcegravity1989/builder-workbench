import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { isShareError } from '../src/errors.mjs'
import { isValidShareId } from '../src/store.mjs'
import { makeStore } from './helpers.mjs'

const HTML = '<!doctype html><html><body><h1>Report</h1></body></html>'

/** @param {unknown} error @param {string} code */
function assertShareError(error, code) {
  assert.ok(isShareError(error), `expected ShareError, got ${String(error)}`)
  assert.equal(/** @type {{ code: string }} */ (error).code, code)
}

test('create stores content and a hashed edit token', async (t) => {
  const env = await makeStore()
  t.after(() => env.cleanup())
  const created = await env.store.create({ content: HTML, fileName: 'report.html' })

  assert.match(created.id, /^[A-Za-z0-9_-]{22}$/)
  assert.equal(isValidShareId(created.id), true)
  assert.equal(created.editToken.length, 43)

  const read = await env.store.read(created.id)
  assert.ok(read)
  assert.equal(read.content.toString('utf8'), HTML)
  assert.equal(read.meta.fileName, 'report.html')
  assert.equal(read.meta.bytes, Buffer.byteLength(HTML))
  assert.equal(read.meta.editTokenHash.length, 64)
  assert.notEqual(read.meta.editTokenHash, created.editToken)

  const names = await fs.readdir(env.dataDir)
  assert.deepEqual(names.sort(), [`${created.id}.html`, `${created.id}.json`])
})

test('update requires the edit token and replaces content', async (t) => {
  const env = await makeStore()
  t.after(() => env.cleanup())
  const created = await env.store.create({ content: HTML, fileName: 'report.html' })

  await assert.rejects(
    env.store.update(created.id, 'wrong-token', { content: 'x', fileName: 'x.html' }),
    (error) => {
      assertShareError(error, 'forbidden')
      return true
    }
  )

  const updated = await env.store.update(created.id, created.editToken, {
    content: '<p>v2</p>',
    fileName: 'report-v2.html',
    title: 'v2'
  })
  assert.equal(updated.fileName, 'report-v2.html')
  assert.equal(updated.title, 'v2')
  const read = await env.store.read(created.id)
  assert.ok(read)
  assert.equal(read.content.toString('utf8'), '<p>v2</p>')
})

test('remove requires the edit token and is idempotent only before deletion', async (t) => {
  const env = await makeStore()
  t.after(() => env.cleanup())
  const created = await env.store.create({ content: HTML, fileName: 'report.html' })

  await assert.rejects(env.store.remove(created.id, 'wrong-token'), (error) => {
    assertShareError(error, 'forbidden')
    return true
  })
  await env.store.remove(created.id, created.editToken)
  assert.equal(await env.store.read(created.id), null)
  await assert.rejects(env.store.remove(created.id, created.editToken), (error) => {
    assertShareError(error, 'not_found')
    return true
  })
})

test('read refuses ids that are not in the generated shape', async (t) => {
  const env = await makeStore()
  t.after(() => env.cleanup())
  assert.equal(await env.store.read('../etc/passwd'), null)
  assert.equal(await env.store.read('short'), null)
})

test('expired shares are unreadable and swept from disk', async (t) => {
  const env = await makeStore({ retentionDays: 1 })
  t.after(() => env.cleanup())
  const created = await env.store.create({ content: HTML, fileName: 'report.html' })

  const metaPath = path.join(env.dataDir, `${created.id}.json`)
  const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'))
  meta.expiresAt = new Date(Date.now() - 1000).toISOString()
  await fs.writeFile(metaPath, JSON.stringify(meta))

  assert.equal(await env.store.read(created.id), null)
  assert.equal(await env.store.sweep(), 1)
  await assert.rejects(fs.access(metaPath))
  await assert.rejects(fs.access(path.join(env.dataDir, `${created.id}.html`)))
})

test('update without a title clears the previous one', async (t) => {
  const env = await makeStore()
  t.after(() => env.cleanup())
  const created = await env.store.create({ content: HTML, fileName: 'a.html', title: 'old' })

  const updated = await env.store.update(created.id, created.editToken, {
    content: HTML,
    fileName: 'a.html'
  })
  assert.equal(updated.title, undefined)
  const read = await env.store.read(created.id)
  assert.ok(read)
  assert.equal(read.meta.title, undefined)
})

test('concurrent updates to one share serialize', async (t) => {
  const env = await makeStore()
  t.after(() => env.cleanup())
  const created = await env.store.create({ content: HTML, fileName: 'a.html' })

  await Promise.all([
    env.store.update(created.id, created.editToken, { content: '<p>one</p>', fileName: 'a.html' }),
    env.store.update(created.id, created.editToken, { content: '<p>two</p>', fileName: 'a.html' })
  ])
  const read = await env.store.read(created.id)
  assert.ok(read)
  assert.ok(['<p>one</p>', '<p>two</p>'].includes(read.content.toString('utf8')))
  const names = await fs.readdir(env.dataDir)
  assert.deepEqual(names.sort(), [`${created.id}.html`, `${created.id}.json`])
})

test('sweep removes abandoned temp files', async (t) => {
  const env = await makeStore()
  t.after(() => env.cleanup())
  const created = await env.store.create({ content: HTML, fileName: 'a.html' })

  const stale = path.join(env.dataDir, `${created.id}.html.tmp-deadbeef`)
  await fs.writeFile(stale, 'partial')
  const old = new Date(Date.now() - 2 * 60 * 60 * 1000)
  await fs.utimes(stale, old, old)

  assert.equal(await env.store.sweep(), 0)
  await assert.rejects(fs.access(stale))
  assert.ok(await env.store.read(created.id))
})

test('retentionDays 0 keeps shares without an expiry', async (t) => {
  const env = await makeStore({ retentionDays: 0 })
  t.after(() => env.cleanup())
  const created = await env.store.create({ content: HTML, fileName: 'report.html' })
  assert.equal(created.meta.expiresAt, null)
  assert.equal(await env.store.sweep(), 0)
  assert.ok(await env.store.read(created.id))
})

test('open reports the length of the bytes it actually streams', async (t) => {
  const env = await makeStore()
  t.after(() => env.cleanup())
  const created = await env.store.create({ content: HTML, fileName: 'a.html' })

  const share = await env.store.open(created.id)
  assert.ok(share)
  const chunks = []
  for await (const chunk of share.stream) {
    chunks.push(chunk)
  }
  const body = Buffer.concat(chunks)
  assert.equal(share.size, body.length)
  assert.equal(body.toString('utf8'), HTML)
})

test('a read still in flight never turns an update into a filesystem error', async (t) => {
  const env = await makeStore()
  t.after(() => env.cleanup())
  const created = await env.store.create({ content: HTML, fileName: 'a.html' })

  // Never consumed: on Windows this keeps a handle on the current version for the whole update.
  const held = await env.store.open(created.id)
  assert.ok(held)
  const outcome = await env.store
    .update(created.id, created.editToken, { content: '<p>v2</p>', fileName: 'a.html' })
    .then(
      () => 'updated',
      (error) => error
    )
  held.stream.destroy()

  if (outcome !== 'updated') {
    // Retryable, and the previous version is still intact and readable.
    assertShareError(outcome, 'busy')
    assert.equal(/** @type {{ status: number }} */ (outcome).status, 503)
  }
  const read = await env.store.read(created.id)
  assert.ok(read)
  assert.ok([HTML, '<p>v2</p>'].includes(read.content.toString('utf8')))
})

test('a finished read releases the file so the next update succeeds', async (t) => {
  const env = await makeStore()
  t.after(() => env.cleanup())
  const created = await env.store.create({ content: HTML, fileName: 'a.html' })

  const share = await env.store.open(created.id)
  assert.ok(share)
  for await (const chunk of share.stream) {
    void chunk
  }
  await new Promise((resolve) => {
    if (share.stream.closed) {
      resolve(undefined)
      return
    }
    share.stream.once('close', resolve)
  })

  const updated = await env.store.update(created.id, created.editToken, {
    content: '<p>v2</p>',
    fileName: 'a.html'
  })
  assert.equal(updated.bytes, Buffer.byteLength('<p>v2</p>'))
})

const BROKEN_METADATA = [
  ['editTokenHash missing', (meta) => delete meta.editTokenHash],
  [
    'editTokenHash not a digest',
    (meta) => {
      meta.editTokenHash = 'nope'
    }
  ],
  [
    'expiresAt unparseable',
    (meta) => {
      meta.expiresAt = 'not-a-date'
    }
  ],
  [
    'bytes not a number',
    (meta) => {
      meta.bytes = '12'
    }
  ],
  [
    'another share id',
    (meta) => {
      meta.id = 'aaaaaaaaaaaaaaaaaaaaaa'
    }
  ]
]

for (const [label, mutate] of BROKEN_METADATA) {
  test(`metadata that cannot describe a share (${label}) reads as missing and is swept`, async (t) => {
    const env = await makeStore()
    t.after(() => env.cleanup())
    const created = await env.store.create({ content: HTML, fileName: 'a.html' })
    const metaPath = path.join(env.dataDir, `${created.id}.json`)
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'))
    mutate(meta)
    await fs.writeFile(metaPath, JSON.stringify(meta))

    // A 404 the client already handles by recreating the link — not a 500 from a token check with
    // no hash to compare, and not a share the sweep can never reclaim.
    assert.equal(await env.store.read(created.id), null)
    assert.equal(await env.store.open(created.id), null)
    await assert.rejects(
      env.store.update(created.id, created.editToken, { content: '<p>x</p>', fileName: 'a.html' }),
      (error) => {
        assertShareError(error, 'not_found')
        return true
      }
    )
    await assert.rejects(env.store.remove(created.id, created.editToken), (error) => {
      assertShareError(error, 'not_found')
      return true
    })
    assert.equal(await env.store.sweep(), 1)
    assert.deepEqual(await fs.readdir(env.dataDir), [])
  })
}

test('metadata this build wrote is still accepted', async (t) => {
  const env = await makeStore()
  t.after(() => env.cleanup())
  const created = await env.store.create({ content: HTML, fileName: 'a.html' })

  const read = await env.store.read(created.id)
  assert.ok(read)
  assert.equal(read.content.toString('utf8'), HTML)
  assert.equal(await env.store.sweep(), 0)
})
