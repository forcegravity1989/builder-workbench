import { describe, expect, it } from 'vitest'
import { generateAutomationWebhookToken, isAutomationWebhookTokenMatch } from './webhook-token'

describe('automation webhook token', () => {
  it('matches only the exact token and rejects absent or malformed presentations', () => {
    const token = generateAutomationWebhookToken()
    // 24 random bytes, base64url: opaque, URL-safe, no padding.
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(generateAutomationWebhookToken()).not.toBe(token)
    expect(isAutomationWebhookTokenMatch(token, token)).toBe(true)
    expect(isAutomationWebhookTokenMatch(token, 'not-the-token')).toBe(false)
    // Same-length wrong presentation must fail byte comparison, not length short-circuit.
    const flipped = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')
    expect(isAutomationWebhookTokenMatch(token, flipped)).toBe(false)
    expect(isAutomationWebhookTokenMatch(token, undefined)).toBe(false)
    expect(isAutomationWebhookTokenMatch(undefined, token)).toBe(false)
    expect(isAutomationWebhookTokenMatch(null, token)).toBe(false)
  })
})
