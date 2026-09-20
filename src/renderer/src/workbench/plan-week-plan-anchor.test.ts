// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import {
  parseWeekPlanSessionAnchor,
  readWeekPlanSessionAnchor,
  WEEK_PLAN_SESSION_ANCHOR_STORAGE_KEY,
  writeWeekPlanSessionAnchor
} from './plan-week-plan-anchor'

describe('week-plan session anchor', () => {
  afterEach(() => {
    window.localStorage.removeItem(WEEK_PLAN_SESSION_ANCHOR_STORAGE_KEY)
  })

  it('rejects incomplete records', () => {
    expect(parseWeekPlanSessionAnchor(null)).toBeNull()
    expect(parseWeekPlanSessionAnchor({ tabId: 't1' })).toBeNull()
    expect(
      parseWeekPlanSessionAnchor({
        tabId: 't1',
        worktreeId: 'wt-1',
        sessionId: 'sess-1',
        transcriptPath: '/tmp/t.jsonl'
      })
    ).toEqual({
      tabId: 't1',
      worktreeId: 'wt-1',
      sessionId: 'sess-1',
      transcriptPath: '/tmp/t.jsonl'
    })
  })

  it('persists one dedicated session per project', () => {
    writeWeekPlanSessionAnchor('repo-1', {
      tabId: 't1',
      worktreeId: 'wt-1',
      sessionId: 'sess-1'
    })
    writeWeekPlanSessionAnchor('repo-2', { tabId: 't2', worktreeId: 'wt-2' })
    expect(readWeekPlanSessionAnchor('repo-1')).toEqual({
      tabId: 't1',
      worktreeId: 'wt-1',
      sessionId: 'sess-1'
    })
    expect(readWeekPlanSessionAnchor('repo-2')?.tabId).toBe('t2')
  })
})
