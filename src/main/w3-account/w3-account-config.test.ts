import { expect, it } from 'vitest'
import { getW3AccountConfig, isAllowedW3ShortcutUrl } from './w3-account-config'

it('accepts a configured W3 shortcut while refusing untrusted credential targets', () => {
  const config = getW3AccountConfig({ ORCA_W3_SHORTCUT_URL: 'https://intra.example/home' })
  expect(config.configured).toBe(true)
  if (!config.configured) {
    throw new Error('valid configuration refused')
  }
  expect(isAllowedW3ShortcutUrl('https://intra.example/home', config)).toBe(true)
  expect(isAllowedW3ShortcutUrl('https://evil.example/home', config)).toBe(false)
  expect(getW3AccountConfig({ ORCA_W3_ACCOUNT_API_URL: 'file:///etc/passwd' }).configured).toBe(false)
  expect(getW3AccountConfig({ ORCA_W3_LOGIN_URL: 'https://user:pw@w3.huawei.com/' }).configured).toBe(false)
})
