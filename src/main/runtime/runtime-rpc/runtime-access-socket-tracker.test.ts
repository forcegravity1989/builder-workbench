import { describe, expect, it } from 'vitest'
import { RuntimeAccessSocketTracker } from './runtime-access-socket-tracker'

describe('RuntimeAccessSocketTracker', () => {
  it('reports one open and one close per member however many sockets they use', () => {
    const tracker = new RuntimeAccessSocketTracker()
    expect(tracker.open('andy', 'c1')).toBe(true)
    expect(tracker.open('andy', 'c2')).toBe(false)
    expect(tracker.open('andy', 'c3')).toBe(false)
    expect(tracker.close('andy', 'c2')).toBe(false)
    expect(tracker.close('andy', 'c1')).toBe(false)
    expect(tracker.close('andy', 'c3')).toBe(true)
    // A later reconnect is a new connection.
    expect(tracker.open('andy', 'c4')).toBe(true)
  })

  it('tracks members of one team link independently and ignores unknown sockets', () => {
    const tracker = new RuntimeAccessSocketTracker()
    tracker.open('andy', 'c1')
    tracker.open('bella', 'c2')
    expect(tracker.close('andy', 'c1')).toBe(true)
    expect(tracker.close('andy', 'c1')).toBe(false)
    expect(tracker.close('carol', 'c9')).toBe(false)
    expect(tracker.close('bella', 'c2')).toBe(true)
  })
})
