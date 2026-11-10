import { describe, expect, it } from 'vitest'

import { isGoogleAuthUrl } from './browser-google-auth-ua'

describe('isGoogleAuthUrl', () => {
  it('matches the Google/YouTube sign-in hosts exactly', () => {
    expect(isGoogleAuthUrl('https://accounts.google.com/')).toBe(true)
    expect(isGoogleAuthUrl('https://accounts.google.com/v3/signin/identifier')).toBe(true)
    expect(isGoogleAuthUrl('https://accounts.youtube.com/signin')).toBe(true)
    expect(isGoogleAuthUrl('https://ACCOUNTS.GOOGLE.COM/')).toBe(true)
  })

  it('does not match post-auth app subdomains or lookalikes', () => {
    expect(isGoogleAuthUrl('https://myaccount.google.com/')).toBe(false)
    expect(isGoogleAuthUrl('https://mail.google.com/')).toBe(false)
    expect(isGoogleAuthUrl('https://accounts.google.com.evil.test/')).toBe(false)
    expect(isGoogleAuthUrl('https://google.com/')).toBe(false)
    expect(isGoogleAuthUrl('not a url')).toBe(false)
  })
})
