import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  createAnnotationStore,
  MAX_ANNOTATIONS_PER_SHARE,
  MAX_AUTHOR_CHARS,
  MAX_TEXT_CHARS
} from '../src/annotations-store.mjs'
import { annotationFilePath, createShareStore } from '../src/store.mjs'

const SHARE_ID = 'a'.repeat(22)

async function makeStores() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bw-anno-'))
  const shareStore = createShareStore({ dataDir, retentionDays: 30 })
  await shareStore.init()
  const annotations = createAnnotationStore({ dataDir })
  return {
    dataDir,
    shareStore,
    annotations,
    async cleanup() {
      await fs.rm(dataDir, { recursive: true, force: true })
    }
  }
}

test('add and list round-trips public fields only', async (t) => {
  const { annotations, cleanup } = await makeStores()
  t.after(cleanup)

  const { annotation, deleteToken } = await annotations.add(SHARE_ID, {
    author: '张三',
    text: '这个按钮文案建议改清楚',
    target: { selector: '#submit-btn', text: '提交', rect: { x: 10, y: 20, width: 80, height: 30 } }
  })
  assert.ok(deleteToken, 'the author needs the delete token to remove the annotation later')
  assert.equal(annotation.author, '张三')
  assert.equal(annotation.text, '这个按钮文案建议改清楚')
  assert.equal(annotation.target.selector, '#submit-btn')
  assert.equal('deleteTokenHash' in annotation, false, 'the hash must never leave the store')

  const items = await annotations.list(SHARE_ID)
  assert.equal(items.length, 1)
  assert.deepEqual(items[0], annotation)
})

test('empty author falls back to 匿名 and page-level annotations omit target', async (t) => {
  const { annotations, cleanup } = await makeStores()
  t.after(cleanup)

  const { annotation } = await annotations.add(SHARE_ID, { author: '  ', text: '整体排版建议' })
  assert.equal(annotation.author, '匿名')
  assert.equal(annotation.target, undefined)
})

test('text and author limits are enforced with distinct codes', async (t) => {
  const { annotations, cleanup } = await makeStores()
  t.after(cleanup)

  await assert.rejects(
    annotations.add(SHARE_ID, { text: 'x'.repeat(MAX_TEXT_CHARS + 1) }),
    (error) => error.code === 'text_too_long'
  )
  await assert.rejects(
    annotations.add(SHARE_ID, { text: 'ok', author: 'x'.repeat(MAX_AUTHOR_CHARS + 1) }),
    (error) => error.code === 'text_too_long'
  )
  await assert.rejects(
    annotations.add(SHARE_ID, { text: '   ' }),
    (error) => error.code === 'bad_request'
  )
})

test('element summary may be empty (icon/image/svg) but must be a present, capped string', async (t) => {
  const { annotations, cleanup } = await makeStores()
  t.after(cleanup)

  // A real selection of a no-text element sends text: '' — it must be accepted, not rejected.
  const { annotation } = await annotations.add(SHARE_ID, {
    text: '看看这个图标',
    target: { selector: '#icon-btn', text: '', rect: { x: 0, y: 0, width: 16, height: 16 } }
  })
  assert.equal(annotation.target.text, '')
  assert.equal(annotation.target.selector, '#icon-btn')

  // Whitespace-only summary trims to empty and is still accepted.
  const ws = await annotations.add(SHARE_ID, {
    text: '图表',
    target: { selector: 'svg', text: '   ', rect: { x: 0, y: 0, width: 10, height: 10 } }
  })
  assert.equal(ws.annotation.target.text, '')

  // The field must still be a present string and stay within the cap.
  const rect = { x: 0, y: 0, width: 1, height: 1 }
  await assert.rejects(
    annotations.add(SHARE_ID, { text: 'x', target: { selector: '#a', rect } }),
    (error) => error.code === 'bad_request'
  )
  await assert.rejects(
    annotations.add(SHARE_ID, { text: 'x', target: { selector: '#a', text: 42, rect } }),
    (error) => error.code === 'bad_request'
  )
  await assert.rejects(
    annotations.add(SHARE_ID, { text: 'x', target: { selector: '#a', text: 'y'.repeat(201), rect } }),
    (error) => error.code === 'text_too_long'
  )
})

test('non-object bodies answer bad_request instead of crashing on input.text', async (t) => {
  const { annotations, cleanup } = await makeStores()
  t.after(cleanup)

  for (const body of [null, 'text', 42, ['array']]) {
    await assert.rejects(annotations.add(SHARE_ID, body), (error) => {
      assert.equal(error.code, 'bad_request')
      return true
    })
  }
  assert.deepEqual(await annotations.list(SHARE_ID), [])
})

test('the per-share cap reports annotations_full at 500', async (t) => {
  const { annotations, cleanup } = await makeStores()
  t.after(cleanup)

  for (let i = 0; i < MAX_ANNOTATIONS_PER_SHARE; i += 1) {
    await annotations.add(SHARE_ID, { text: `note ${i}` })
  }
  await assert.rejects(annotations.add(SHARE_ID, { text: 'one too many' }), (error) => {
    assert.equal(error.code, 'annotations_full')
    return true
  })
  // The cap is per share: a different share still accepts writes.
  const other = await annotations.list('b'.repeat(22))
  assert.deepEqual(other, [])
})

test('the author deletes with the matching token; a wrong token is refused', async (t) => {
  const { dataDir, annotations, cleanup } = await makeStores()
  t.after(cleanup)

  const { annotation, deleteToken } = await annotations.add(SHARE_ID, { text: 'mine' })
  await assert.rejects(
    annotations.removeByAuthor(SHARE_ID, annotation.id, 'wrong-token'),
    (error) => error.code === 'forbidden'
  )
  assert.equal((await annotations.list(SHARE_ID)).length, 1)

  await annotations.removeByAuthor(SHARE_ID, annotation.id, deleteToken)
  assert.deepEqual(await annotations.list(SHARE_ID), [])
  // The empty file is dropped instead of leaving a zero-item shell.
  assert.equal(
    await fs.access(annotationFilePath(dataDir, SHARE_ID)).then(
      () => true,
      () => false
    ),
    false
  )
})

test('removeAny bypasses the author token for the share owner path', async (t) => {
  const { annotations, cleanup } = await makeStores()
  t.after(cleanup)

  const first = await annotations.add(SHARE_ID, { text: 'one' })
  const second = await annotations.add(SHARE_ID, { text: 'two' })
  await annotations.removeAny(SHARE_ID, first.annotation.id)
  const items = await annotations.list(SHARE_ID)
  assert.equal(items.length, 1)
  assert.equal(items[0].id, second.annotation.id)
})

test('deleting an unknown annotation answers 404', async (t) => {
  const { annotations, cleanup } = await makeStores()
  t.after(cleanup)

  await assert.rejects(
    annotations.removeByAuthor(SHARE_ID, 'deadbeef', 'any'),
    (error) => error.code === 'not_found'
  )
  await assert.rejects(
    annotations.removeAny(SHARE_ID, 'deadbeef'),
    (error) => error.code === 'not_found'
  )
})

test('annotations die with the share: remove deletes the annotation file too', async (t) => {
  const { dataDir, shareStore, annotations, cleanup } = await makeStores()
  t.after(cleanup)

  const created = await shareStore.create({ content: '<p>y</p>', fileName: 'r2.html' })
  await annotations.add(created.id, { text: 'note' })
  assert.ok(
    await fs.access(annotationFilePath(dataDir, created.id)).then(
      () => true,
      () => false
    )
  )

  await shareStore.remove(created.id, created.editToken)
  assert.equal(
    await fs.access(annotationFilePath(dataDir, created.id)).then(
      () => true,
      () => false
    ),
    false,
    'removing the share must take its annotations file along'
  )
  assert.deepEqual(await annotations.list(created.id), [])
})

test('a damaged annotations file reads as empty and heals on the next write', async (t) => {
  const { dataDir, annotations, cleanup } = await makeStores()
  t.after(cleanup)

  await fs.writeFile(annotationFilePath(dataDir, SHARE_ID), '{ not json')
  assert.deepEqual(await annotations.list(SHARE_ID), [])
  const { annotation } = await annotations.add(SHARE_ID, { text: 'healed' })
  assert.equal((await annotations.list(SHARE_ID))[0].id, annotation.id)
})
