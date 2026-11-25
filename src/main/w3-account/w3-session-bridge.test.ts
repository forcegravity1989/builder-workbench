import { expect, it } from 'vitest'
import { mapBridgeCookiesForPartition } from './w3-session-bridge'

it('transplants only Huawei cookies with exact host scope and bounded session expiry', () => {
  const base = { name: 'sso', value: 'private', domain: '.huawei.com', path: '/', expires: -1, secure: true, httpOnly: true, sameSite: 'None' }
  const now = 1_700_000_000_000
  const details = mapBridgeCookiesForPartition([
    base,
    { ...base, name: 'host', domain: 'w3.huawei.com', expires: 1_800_000_000 },
    { ...base, domain: 'not-huawei.com' }
  ], now)
  expect(details).toEqual([
    { url: 'https://huawei.com/', name: 'sso', value: 'private', domain: '.huawei.com', path: '/', secure: true, httpOnly: true, expirationDate: now / 1000 + 7 * 24 * 60 * 60, sameSite: 'no_restriction' },
    { url: 'https://w3.huawei.com/', name: 'host', value: 'private', path: '/', secure: true, httpOnly: true, expirationDate: 1_800_000_000, sameSite: 'no_restriction' }
  ])
})
