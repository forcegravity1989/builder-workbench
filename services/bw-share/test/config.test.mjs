import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_MAX_BYTES, DEFAULT_PORT, loadConfig } from '../src/config.mjs'

test('loadConfig applies documented defaults', () => {
  const config = loadConfig({})
  assert.equal(config.host, '0.0.0.0')
  assert.equal(config.port, DEFAULT_PORT)
  assert.equal(config.maxBytes, DEFAULT_MAX_BYTES)
  assert.equal(config.retentionDays, 30)
  assert.equal(config.rateLimitPerMinute, 30)
  assert.equal(config.uploadToken, '')
  assert.equal(config.publicBaseUrl, '')
  assert.equal(config.trustProxy, false)
})

test('loadConfig trims the public base url to an origin and optional prefix', () => {
  assert.equal(
    loadConfig({ BW_SHARE_PUBLIC_BASE_URL: 'https://share.example.com/' }).publicBaseUrl,
    'https://share.example.com'
  )
  assert.equal(
    loadConfig({ BW_SHARE_PUBLIC_BASE_URL: 'http://10.0.0.5:8787/share/' }).publicBaseUrl,
    'http://10.0.0.5:8787/share'
  )
})

test('loadConfig rejects unsafe public base urls', () => {
  assert.throws(() => loadConfig({ BW_SHARE_PUBLIC_BASE_URL: 'share.example.com' }))
  assert.throws(() => loadConfig({ BW_SHARE_PUBLIC_BASE_URL: 'ftp://share.example.com' }))
  assert.throws(() =>
    loadConfig({ BW_SHARE_PUBLIC_BASE_URL: 'https://user:pass@share.example.com' })
  )
  assert.throws(() => loadConfig({ BW_SHARE_PUBLIC_BASE_URL: 'https://share.example.com/?a=1' }))
})

test('loadConfig validates numeric bounds', () => {
  assert.throws(() => loadConfig({ BW_SHARE_PORT: '70000' }))
  assert.throws(() => loadConfig({ BW_SHARE_PORT: 'abc' }))
  assert.throws(() => loadConfig({ BW_SHARE_MAX_BYTES: '0' }))
  assert.throws(() => loadConfig({ BW_SHARE_RETENTION_DAYS: '-1' }))
  assert.equal(loadConfig({ BW_SHARE_RETENTION_DAYS: '0' }).retentionDays, 0)
  assert.equal(loadConfig({ BW_SHARE_PORT: '0' }).port, 0)
})

test('loadConfig reads the trust proxy switch strictly', () => {
  assert.equal(loadConfig({ BW_SHARE_TRUST_PROXY: '1' }).trustProxy, true)
  assert.equal(loadConfig({ BW_SHARE_TRUST_PROXY: 'yes' }).trustProxy, true)
  assert.equal(loadConfig({ BW_SHARE_TRUST_PROXY: 'false' }).trustProxy, false)
  assert.throws(() => loadConfig({ BW_SHARE_TRUST_PROXY: 'sometimes' }))
})
