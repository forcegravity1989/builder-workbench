import { describe, expect, it } from 'vitest'
import {
  getW3AccountConfig,
  isAllowedW3ShortcutUrl,
  type W3AccountConfig,
  W3_DEFAULT_ACCOUNT_API_PATH,
  W3_DEFAULT_LOGIN_TIMEOUT_MS,
  W3_DEFAULT_LOGIN_URL
} from './w3-account-config'

// Keep the surrounding env clean so the feature never accidentally activates.
const {
  ORCA_W3_LOGIN_URL: _loginUrl,
  ORCA_W3_ACCOUNT_API_URL: _accountApiUrl,
  ORCA_W3_LOCALE: _locale,
  ORCA_W3_LOGIN_TIMEOUT_MS: _timeoutMs,
  ...rest
} = process.env

function read(env: Record<string, string> = {}) {
  return getW3AccountConfig({ ...rest, ...env } as NodeJS.ProcessEnv)
}

function readConfigured(env: Record<string, string> = {}): W3AccountConfig {
  const result = read(env)
  expect(result.configured).toBe(true)
  return result.configured ? result : ({} as W3AccountConfig)
}

describe('getW3AccountConfig', () => {
  it('defaults to the W3 portal login page and the zh account API', () => {
    expect(read()).toEqual({
      configured: true,
      loginUrl: 'https://w3.huawei.com/next/indexa.html',
      accountApiUrl:
        'https://w3.huawei.com/next/service/rest/my/w3account/v1/account/zh?profile=1&version=1&usergroup=1',
      loginTimeoutMs: 120_000,
      loginOrigin: 'https://w3.huawei.com',
      accountApiOrigin: 'https://w3.huawei.com',
      shortcutUrl: 'https://w3.huawei.com/next/index_zh.html',
      shortcutHost: 'w3.huawei.com'
    })
  })

  it('defaults the shortcut to the W3 home and honours ORCA_W3_SHORTCUT_URL', () => {
    expect(readConfigured().shortcutUrl).toBe('https://w3.huawei.com/next/index_zh.html')
    const custom = readConfigured({ ORCA_W3_SHORTCUT_URL: 'https://intra.example/home' })
    expect(custom.shortcutUrl).toBe('https://intra.example/home')
    expect(custom.shortcutHost).toBe('intra.example')
    // Malformed override falls back to the trusted default.
    expect(readConfigured({ ORCA_W3_SHORTCUT_URL: 'ftp://x' }).shortcutHost).toBe('w3.huawei.com')
  })

  it('only allows w3.huawei.com or the configured shortcut host', () => {
    const config = readConfigured()
    expect(isAllowedW3ShortcutUrl('https://w3.huawei.com/next/index_zh.html', config)).toBe(true)
    expect(isAllowedW3ShortcutUrl('https://evil.example/x', config)).toBe(false)
    expect(isAllowedW3ShortcutUrl('file:///etc/passwd', config)).toBe(false)
    const custom = readConfigured({ ORCA_W3_SHORTCUT_URL: 'https://intra.example/home' })
    expect(isAllowedW3ShortcutUrl('https://intra.example/home', custom)).toBe(true)
    expect(isAllowedW3ShortcutUrl('https://other.example/x', custom)).toBe(false)
  })

  it('lets ORCA_W3_LOGIN_URL override the login page', () => {
    expect(readConfigured({ ORCA_W3_LOGIN_URL: 'https://w3.example/portal' }).loginUrl).toBe(
      'https://w3.example/portal'
    )
  })

  it('splices ORCA_W3_LOCALE into the default account API', () => {
    const en = readConfigured({ ORCA_W3_LOCALE: 'en' })
    expect(en.accountApiUrl).toContain('/account/en?profile=1&version=1&usergroup=1')
    // Unknown locale falls back to zh.
    expect(readConfigured({ ORCA_W3_LOCALE: 'fr' }).accountApiUrl).toContain('/account/zh?')
  })

  it('lets ORCA_W3_ACCOUNT_API_URL override the account endpoint', () => {
    expect(
      readConfigured({ ORCA_W3_ACCOUNT_API_URL: 'https://w3.example/api/account' }).accountApiUrl
    ).toBe('https://w3.example/api/account')
  })

  it('rejects non-http(s) or hostless login URLs as unconfigured', () => {
    expect(read({ ORCA_W3_LOGIN_URL: 'ftp://w3.huawei.com/x' })).toEqual({
      configured: false,
      reason: 'invalid'
    })
    expect(read({ ORCA_W3_LOGIN_URL: 'not a url' })).toEqual({
      configured: false,
      reason: 'invalid'
    })
    // Why: a userinfo component would make the URL untrusted/opaque.
    expect(read({ ORCA_W3_LOGIN_URL: 'https://user:pw@w3.huawei.com/x' })).toEqual({
      configured: false,
      reason: 'invalid'
    })
  })

  it('rejects an invalid ORCA_W3_ACCOUNT_API_URL as unconfigured', () => {
    expect(read({ ORCA_W3_ACCOUNT_API_URL: 'file:///etc/passwd' })).toEqual({
      configured: false,
      reason: 'invalid'
    })
  })

  it('bounds ORCA_W3_LOGIN_TIMEOUT_MS to 5s..10min, defaulting when invalid', () => {
    expect(readConfigured({ ORCA_W3_LOGIN_TIMEOUT_MS: '30000' }).loginTimeoutMs).toBe(30_000)
    expect(readConfigured({ ORCA_W3_LOGIN_TIMEOUT_MS: 'abc' }).loginTimeoutMs).toBe(120_000)
    expect(readConfigured({ ORCA_W3_LOGIN_TIMEOUT_MS: '1' }).loginTimeoutMs).toBe(120_000)
    expect(readConfigured({ ORCA_W3_LOGIN_TIMEOUT_MS: '999999999' }).loginTimeoutMs).toBe(120_000)
  })

  it('defaults the total login wait to 120s', () => {
    expect(W3_DEFAULT_LOGIN_TIMEOUT_MS).toBe(120_000)
    expect(W3_DEFAULT_LOGIN_URL).toBe('https://w3.huawei.com/next/indexa.html')
    expect(W3_DEFAULT_ACCOUNT_API_PATH).toContain('/w3account/v1/account/{locale}')
  })
})
