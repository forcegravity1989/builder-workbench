import { describe, expect, it } from 'vitest'
import { resolveSidebarRevealRoute } from './version-tree-reveal-route'

const BOUND = 'local|repo-1::/repo/plan-v1.1'
const PINNED_BOUND = 'local|repo-1::/repo/acceptance-v1.1'
const PLAIN = 'local|repo-1::/repo/feature'

describe('resolveSidebarRevealRoute', () => {
  it('routes an unpinned version-bound tree to the version tree', () => {
    expect(
      resolveSidebarRevealRoute({
        worktreeIdentity: BOUND,
        versionTreeIdentities: new Set([BOUND, PINNED_BOUND]),
        isPinnedVersionBound: false
      })
    ).toBe('version-tree')
  })

  it('keeps pinned version-bound trees on the native Pinned reveal path', () => {
    expect(
      resolveSidebarRevealRoute({
        worktreeIdentity: PINNED_BOUND,
        versionTreeIdentities: new Set([BOUND, PINNED_BOUND]),
        isPinnedVersionBound: true
      })
    ).toBe('native')
  })

  it('keeps non-version worktrees on the native reveal path', () => {
    expect(
      resolveSidebarRevealRoute({
        worktreeIdentity: PLAIN,
        versionTreeIdentities: new Set([BOUND]),
        isPinnedVersionBound: false
      })
    ).toBe('native')
  })

  it('routes native when no version projection is published', () => {
    expect(
      resolveSidebarRevealRoute({
        worktreeIdentity: BOUND,
        versionTreeIdentities: new Set()
      })
    ).toBe('native')
  })
})
