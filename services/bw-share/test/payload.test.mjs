import assert from 'node:assert/strict'
import test from 'node:test'
import { isShareError } from '../src/errors.mjs'
import { parseSharePayload } from '../src/payload.mjs'

/** @param {unknown} error @param {string} code */
function assertShareError(error, code) {
  assert.ok(isShareError(error), `expected ShareError, got ${String(error)}`)
  assert.equal(/** @type {{ code: string }} */ (error).code, code)
}

test('parseSharePayload returns the normalized payload', () => {
  const payload = parseSharePayload(
    { content: '<p>x</p>', fileName: '  a.html  ', title: 'T', contentType: 'text/html' },
    1024
  )
  assert.deepEqual(payload, { content: '<p>x</p>', fileName: 'a.html', title: 'T' })
})

test('parseSharePayload rejects non-object bodies', () => {
  for (const body of [null, [], 'x', 42]) {
    assert.throws(
      () => parseSharePayload(body, 1024),
      (error) => {
        assertShareError(error, 'bad_request')
        return true
      }
    )
  }
})

test('parseSharePayload rejects unsupported content types', () => {
  assert.throws(
    () => parseSharePayload({ content: 'x', fileName: 'a.md', contentType: 'text/markdown' }, 1024),
    (error) => {
      assertShareError(error, 'unsupported_media_type')
      return true
    }
  )
})

test('parseSharePayload measures decoded utf-8 bytes', () => {
  const content = '中'.repeat(4)
  assert.equal(Buffer.byteLength(content, 'utf8'), 12)
  assert.throws(
    () => parseSharePayload({ content, fileName: 'a.html' }, 11),
    (error) => {
      assertShareError(error, 'too_large')
      return true
    }
  )
})

test('parseSharePayload rejects empty content and bad names', () => {
  assert.throws(
    () => parseSharePayload({ content: '', fileName: 'a.html' }, 1024),
    (error) => {
      assertShareError(error, 'bad_request')
      return true
    }
  )
  const nameWithNewline = `a${String.fromCharCode(10)}.html`
  assert.throws(
    () => parseSharePayload({ content: 'x', fileName: nameWithNewline }, 1024),
    (error) => {
      assertShareError(error, 'bad_request')
      return true
    }
  )
  assert.throws(
    () => parseSharePayload({ content: 'x', fileName: 'a.html', title: 'x'.repeat(201) }, 1024),
    (error) => {
      assertShareError(error, 'bad_request')
      return true
    }
  )
})
