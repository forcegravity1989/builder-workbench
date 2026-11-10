import { describe, expect, it } from 'vitest'
import {
  isGoogleSourceBoundCookie,
  isNonTransplantableCookieDomain
} from './policy/cookie-import-exclusions'
import { normalizeCookieDomain } from './policy/cookie-domain'

describe('isGoogleSourceBoundCookie', () => {
  it('matches the allowlisted names only on google.com and its subdomains', () => {
    expect(isGoogleSourceBoundCookie('SIDCC', '.google.com')).toBe(true)
    expect(isGoogleSourceBoundCookie('AEC', 'accounts.google.com')).toBe(true)
    expect(isGoogleSourceBoundCookie('__Secure-STRP', '.accounts.google.com')).toBe(true)
    expect(isGoogleSourceBoundCookie('SIDCC', '.notgoogle.com')).toBe(false)
    expect(isGoogleSourceBoundCookie('SIDCC', '.google.com.evil.example')).toBe(false)
    expect(isGoogleSourceBoundCookie('SID', '.google.com')).toBe(false)
  })

  it('normalizes leading dots, case, and international domains consistently', () => {
    expect(normalizeCookieDomain('..Accounts.Google.Com')).toBe('accounts.google.com')
    expect(normalizeCookieDomain('münich.example')).toBe('xn--mnich-kva.example')
    expect(normalizeCookieDomain('')).toBeNull()
  })

  it('rejects URL syntax that could normalize an invalid cookie scope to another domain', () => {
    expect(normalizeCookieDomain('example.com/path')).toBeNull()
    expect(normalizeCookieDomain('user@example.com')).toBeNull()
    expect(normalizeCookieDomain('example.com:443')).toBeNull()
    expect(normalizeCookieDomain('%65xample.com')).toBeNull()
    expect(isGoogleSourceBoundCookie('SIDCC', 'user@google.com')).toBe(false)
  })
})

describe('isNonTransplantableCookieDomain', () => {
  it('covers the whole google.com registrable family', () => {
    expect(isNonTransplantableCookieDomain('google.com')).toBe(true)
    expect(isNonTransplantableCookieDomain('.google.com')).toBe(true)
    expect(isNonTransplantableCookieDomain('accounts.google.com')).toBe(true)
    expect(isNonTransplantableCookieDomain('MAIL.Google.Com')).toBe(true)
  })

  it('does not match lookalikes or unrelated sites', () => {
    expect(isNonTransplantableCookieDomain('withgoogle.com')).toBe(false)
    expect(isNonTransplantableCookieDomain('google.com.evil.example')).toBe(false)
    expect(isNonTransplantableCookieDomain('notgoogle.com')).toBe(false)
    expect(isNonTransplantableCookieDomain('linear.app')).toBe(false)
    expect(isNonTransplantableCookieDomain('')).toBe(false)
  })

  // Why: youtube.com re-issues its cookies from a transplanted session, so excluding it would
  // drop imports users asked for. Locking it in keeps a future "just add it too" edit honest.
  it('deliberately leaves youtube.com transplantable', () => {
    expect(isNonTransplantableCookieDomain('.youtube.com')).toBe(false)
    expect(isNonTransplantableCookieDomain('accounts.youtube.com')).toBe(false)
  })
})
