import { describe, expect, it } from 'vitest'
import { teamReadDenialReason } from './runtime-rpc-team-read-policy'

describe('team-read RPC policy', () => {
  it('denies creating worktrees, sessions, model messages, and shell input', () => {
    for (const method of [
      'worktree.create',
      'agentSession.create',
      'orchestration.send',
      'terminal.send'
    ]) {
      expect(teamReadDenialReason('team-read', method)).toContain('requires full access')
    }
  })

  it('keeps existing read methods available and leaves full grants unchanged', () => {
    expect(teamReadDenialReason('team-read', 'worktree.list')).toBeNull()
    expect(teamReadDenialReason('team-read', 'files.read')).toBeNull()
    expect(teamReadDenialReason('team-read', 'files.search')).toBeNull()
    expect(teamReadDenialReason('team-read', 'workbench.review.receive')).toBeNull()
    expect(teamReadDenialReason('team-read', 'worktree.detectedList')).toBeNull()
    expect(teamReadDenialReason('team-read', 'worktree.lineageList')).toBeNull()
    expect(teamReadDenialReason('team-read', 'git.checkIgnored')).toBeNull()
    expect(teamReadDenialReason('team-read', 'git.conflictOperation')).toBeNull()
    expect(teamReadDenialReason('team-read', 'future.mutate')).toContain('requires full access')
    expect(teamReadDenialReason('full', 'terminal.send')).toBeNull()
    expect(teamReadDenialReason(undefined, 'terminal.send')).toBeNull()
  })
})
