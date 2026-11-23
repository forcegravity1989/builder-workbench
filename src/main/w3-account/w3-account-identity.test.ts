import { describe, expect, it } from 'vitest'
import {
  normalizeW3DisplayName,
  parseW3AccountResponse,
  W3_NOT_LOGGED_IN_STATUS
} from './w3-account-identity'

const OK = JSON.stringify({
  employeeNumber: '111222',
  uid: 'huawei-uid-1',
  displayName: ['cn=张三', 'en=zhangsan'],
  cn: '张三',
  en: 'zhangsan',
  profile: { secret: 'never-surfaced' },
  ihrManager: 'manager-1'
})

describe('parseW3AccountResponse', () => {
  it('treats 421 as "not logged in" (keep waiting)', () => {
    expect(W3_NOT_LOGGED_IN_STATUS).toBe(421)
    expect(parseW3AccountResponse(421, 'No login user found.')).toEqual({
      state: 'unauthenticated'
    })
  })

  it('treats other 4xx/5xx and network (0) as login-failed', () => {
    expect(parseW3AccountResponse(403, '')).toEqual({ state: 'login-failed' })
    expect(parseW3AccountResponse(500, '')).toEqual({ state: 'login-failed' })
    expect(parseW3AccountResponse(0, '')).toEqual({ state: 'login-failed' })
  })

  it('accepts 200 + employeeNumber/uid and surfaces only display_name + employee_no', () => {
    const result = parseW3AccountResponse(200, OK)
    expect(result.state).toBe('authenticated')
    if (result.state === 'authenticated') {
      expect(result.identity).toEqual({ displayName: '张三', employeeNo: '111222' })
      // Why: only the two whitelisted fields may ever cross to the renderer.
      expect(Object.keys(result.identity ?? {})).toEqual(['displayName', 'employeeNo'])
    }
  })

  it('accepts 200 with uid only, but without displayable profile info', () => {
    // No name/employee number to surface → signed-in without profile info.
    expect(parseW3AccountResponse(200, JSON.stringify({ uid: 'u9' }))).toEqual({
      state: 'authenticated',
      identity: null
    })
  })

  it('rejects 200 without identifying fields as parse-failed', () => {
    expect(parseW3AccountResponse(200, JSON.stringify({ profile: 1 }))).toEqual({
      state: 'parse-failed'
    })
    expect(parseW3AccountResponse(200, '')).toEqual({ state: 'parse-failed' })
    expect(parseW3AccountResponse(200, 'not-json')).toEqual({ state: 'parse-failed' })
    expect(parseW3AccountResponse(200, '["array"]')).toEqual({ state: 'parse-failed' })
  })

  it('rejects oversized bodies as parse-failed', () => {
    expect(parseW3AccountResponse(200, 'x'.repeat(64 * 1024 + 1))).toEqual({
      state: 'parse-failed'
    })
  })
})

describe('normalizeW3DisplayName', () => {
  it('prefers the cn= Chinese name from the displayName array', () => {
    expect(normalizeW3DisplayName({ displayName: ['cn=张三', 'en=zhangsan'] })).toBe('张三')
    expect(normalizeW3DisplayName({ displayName: ['en=zhangsan', 'CN=李四'] })).toBe('李四')
  })

  it('falls back to en= then the flat cn/en fields', () => {
    expect(normalizeW3DisplayName({ displayName: ['en=zhangsan'] })).toBe('zhangsan')
    expect(normalizeW3DisplayName({ cn: '王五', en: 'wangwu' })).toBe('王五')
    expect(normalizeW3DisplayName({ en: 'wangwu' })).toBe('wangwu')
  })

  it('ignores malformed entries and empty input', () => {
    expect(normalizeW3DisplayName({ displayName: ['xx=foo', '', 42] })).toBe('')
    expect(normalizeW3DisplayName({})).toBe('')
  })
})
