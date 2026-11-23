import { describe, expect, it } from 'vitest'
import { isRoutineReadRuntimeMethod, teamReadDenialReason } from './runtime-rpc-team-read-policy'

describe('team-read RPC policy', () => {
  it('denies creating worktrees, sessions, model messages, and shell input', () => {
    for (const method of [
      'worktree.create',
      'agentSession.create',
      'orchestration.send',
      'terminal.send',
      'browser.mouseClick',
      'browser.keypress',
      'browser.goto',
      'browser.eval',
      'browser.reload'
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
    expect(teamReadDenialReason('team-read', 'terminal.resolvePane')).toBeNull()
    expect(teamReadDenialReason('team-read', 'github.project.viewTable')).toBeNull()
    expect(teamReadDenialReason('team-read', 'codehub.listTasks')).toBeNull()
    expect(teamReadDenialReason('team-read', 'git.checkIgnored')).toBeNull()
    for (const method of [
      'browser.tabList',
      'browser.tabShow',
      'browser.screencast',
      'browser.screencast.unsubscribe'
    ]) {
      expect(teamReadDenialReason('team-read', method)).toBeNull()
    }
    expect(teamReadDenialReason('team-read', 'git.conflictOperation')).toBeNull()
    expect(teamReadDenialReason('team-read', 'future.mutate')).toContain('requires full access')
    expect(teamReadDenialReason('full', 'terminal.send')).toBeNull()
    expect(teamReadDenialReason(undefined, 'terminal.send')).toBeNull()
  })

  it('suppresses successful routine reads but keeps review delivery auditable', () => {
    expect(isRoutineReadRuntimeMethod('project.list')).toBe(true)
    expect(isRoutineReadRuntimeMethod('terminal.resolvePane')).toBe(true)
    expect(isRoutineReadRuntimeMethod('workbench.review.receive')).toBe(false)
    expect(isRoutineReadRuntimeMethod('workbench.prototypeReview.annotations.add')).toBe(false)
    expect(isRoutineReadRuntimeMethod('browser.screencast')).toBe(true)
    expect(isRoutineReadRuntimeMethod('terminal.send')).toBe(false)
  })
})
