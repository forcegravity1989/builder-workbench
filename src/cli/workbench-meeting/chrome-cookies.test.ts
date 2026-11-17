import { createCipheriv, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  cookieHeaderFromRows,
  cookieMatchesHost,
  decryptRow,
  type ChromeCookieRow
} from './chrome-cookies'

const NOW = 1_800_000_000

function row(overrides: Partial<ChromeCookieRow> = {}): ChromeCookieRow {
  return {
    hostKey: '.huawei.com',
    name: 'sid',
    value: 'abc',
    encryptedValue: Buffer.alloc(0),
    expiresUnix: NOW + 3600,
    ...overrides
  }
}

function windowsEncrypted(plaintext: string, key: Buffer): Buffer {
  // Why: Chrome/Edge on Windows use AES-256-GCM as v10 nonce|ciphertext|tag.
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([Buffer.from('v10'), nonce, ciphertext, cipher.getAuthTag()])
}

describe('system Chrome cookies', () => {
  it('matches the exact host and parent domains only', () => {
    expect(cookieMatchesHost('.huawei.com', 'w3.huawei.com')).toBe(true)
    expect(cookieMatchesHost('w3.huawei.com', 'w3.huawei.com')).toBe(true)
    expect(cookieMatchesHost('.huawei.com', 'huawei.com')).toBe(true)
    expect(cookieMatchesHost('.huawei.com', 'not-huawei.com')).toBe(false)
    expect(cookieMatchesHost('.w3.huawei.com', 'huawei.com')).toBe(false)
  })

  it('builds a header without expired or duplicate cookies', () => {
    expect(
      cookieHeaderFromRows(
        [
          row({ name: 'a', value: '1' }),
          row({ name: 'b', value: 'old', expiresUnix: NOW - 1 }),
          row({ name: 'a', value: '2', hostKey: 'w3.huawei.com' }),
          row({ name: 'c', value: 'other', hostKey: '.example.com' }),
          row({ name: 'd', value: 'session', expiresUnix: 0 })
        ],
        'w3.huawei.com',
        NOW
      )
    ).toBe('a=2; d=session')
  })

  it('decrypts Windows AES-256-GCM values and reports app-bound v20 rows', () => {
    const key = randomBytes(32)
    expect(
      decryptRow(row({ encryptedValue: windowsEncrypted('ticket=1', key) }), {
        mode: 'aes-256-gcm',
        key
      })
    ).toEqual({ value: 'ticket=1' })
    expect(
      decryptRow(row({ encryptedValue: Buffer.from('v20app-bound') }), {
        mode: 'aes-256-gcm',
        key
      })
    ).toEqual({ appBound: true })
  })
})
