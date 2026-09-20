import { describe, expect, it } from 'vitest'
import { isTerminalLeafId } from '../../../shared/stable-pane-id'
import { singlePaneLayoutSnapshot } from '@/store/slices/terminal-helpers'
import type { Tab } from '../../../shared/tab-types'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import {
  findWeekPlanStructuredTab,
  findWeekPlanTerminalTab,
  findWeekPlanTerminalTabInProject,
  isWeekPlanStructuredTab,
  isWeekPlanTerminalTab,
  resolveWeekPlanHomeWorktreeId,
  resolveWeekPlanPaneKey,
  seedWeekPlanLayoutIfNeeded,
  WEEK_PLAN_SESSION_LABEL,
  weekPlanProjectKey,
  weekPlanProjectWorktreeIds
} from './plan-week-plan-session'

const LEAF_ID = '11111111-1111-4111-8111-111111111111'

function terminalTab(partial: Partial<TerminalTab> & Pick<TerminalTab, 'id'>): TerminalTab {
  return {
    ptyId: null,
    worktreeId: 'wt-1',
    title: 'Terminal 1',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 0,
    ...partial
  }
}

function structuredTab(partial: Partial<Tab> & Pick<Tab, 'id'>): Tab {
  return {
    entityId: 'session-1',
    groupId: 'g-1',
    worktreeId: 'wt-1',
    contentType: 'agent-session',
    label: 'Claude',
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 0,
    agentSessionAgent: 'claude',
    ...partial
  }
}

describe('week-plan session identity', () => {
  it('matches Claude tabs stamped with the week-plan label', () => {
    expect(
      isWeekPlanTerminalTab(
        terminalTab({ id: 't1', launchAgent: 'claude', quickCommandLabel: WEEK_PLAN_SESSION_LABEL })
      )
    ).toBe(true)
    expect(
      isWeekPlanTerminalTab(
        terminalTab({ id: 't2', launchAgent: 'claude', customTitle: WEEK_PLAN_SESSION_LABEL })
      )
    ).toBe(true)
    expect(isWeekPlanTerminalTab(terminalTab({ id: 't3', launchAgent: 'claude' }))).toBe(false)
    expect(
      isWeekPlanTerminalTab(terminalTab({ id: 't5', customTitle: WEEK_PLAN_SESSION_LABEL }))
    ).toBe(true)
    expect(
      isWeekPlanTerminalTab(
        terminalTab({ id: 't4', launchAgent: 'codex', quickCommandLabel: WEEK_PLAN_SESSION_LABEL })
      )
    ).toBe(false)
  })

  it('finds the stamped tab among siblings', () => {
    const hit = terminalTab({
      id: 'plan',
      launchAgent: 'claude',
      quickCommandLabel: WEEK_PLAN_SESSION_LABEL
    })
    expect(
      findWeekPlanTerminalTab([terminalTab({ id: 'shell' }), hit, terminalTab({ id: 'other' })])?.id
    ).toBe('plan')
    expect(findWeekPlanTerminalTab([terminalTab({ id: 'shell' })])).toBeUndefined()
  })

  it('matches structured Claude sessions by the same label', () => {
    expect(
      isWeekPlanStructuredTab(
        structuredTab({ id: 's1', quickCommandLabel: WEEK_PLAN_SESSION_LABEL })
      )
    ).toBe(true)
    expect(
      isWeekPlanStructuredTab(structuredTab({ id: 's2', customLabel: WEEK_PLAN_SESSION_LABEL }))
    ).toBe(true)
    expect(findWeekPlanStructuredTab([structuredTab({ id: 's3' })])?.id).toBeUndefined()
    expect(
      findWeekPlanStructuredTab([structuredTab({ id: 's4', customLabel: WEEK_PLAN_SESSION_LABEL })])
        ?.id
    ).toBe('s4')
  })
})

describe('week-plan pane key', () => {
  it('reads the layout leaf', () => {
    expect(resolveWeekPlanPaneKey('tab-1', singlePaneLayoutSnapshot(LEAF_ID))).toBe(
      `tab-1:${LEAF_ID}`
    )
    expect(resolveWeekPlanPaneKey('tab-1', undefined)).toBeNull()
  })

  it('seeds a single-pane layout only when the tab has no leaf', () => {
    const existing = seedWeekPlanLayoutIfNeeded('tab-1', singlePaneLayoutSnapshot(LEAF_ID))
    expect(existing.snapshot).toBeNull()
    expect(existing.paneKey).toBe(`tab-1:${LEAF_ID}`)

    const seeded = seedWeekPlanLayoutIfNeeded('tab-2', undefined)
    expect(seeded.snapshot).not.toBeNull()
    expect(isTerminalLeafId(seeded.paneKey.slice('tab-2:'.length))).toBe(true)
    expect(seeded.paneKey.startsWith('tab-2:')).toBe(true)
  })
})

describe('week-plan project session', () => {
  it('reuses the stamped tab from another worktree in the same project', () => {
    const plan = terminalTab({
      id: 'plan',
      worktreeId: 'wt-docs',
      launchAgent: 'claude',
      customTitle: WEEK_PLAN_SESSION_LABEL
    })
    expect(
      findWeekPlanTerminalTabInProject({
        activeWorktreeId: 'wt-main',
        tabsByWorktree: {
          'wt-main': [terminalTab({ id: 'shell', worktreeId: 'wt-main' })],
          'wt-docs': [plan]
        },
        projectWorktreeIds: ['wt-main', 'wt-docs']
      })
    ).toEqual({ worktreeId: 'wt-docs', tab: plan })
  })

  it('does not follow the selected session when the dedicated tab lives elsewhere', () => {
    const selected = terminalTab({
      id: 'selected',
      worktreeId: 'wt-session',
      launchAgent: 'claude',
      customTitle: WEEK_PLAN_SESSION_LABEL
    })
    const plan = terminalTab({
      id: 'plan',
      worktreeId: 'wt-plan',
      launchAgent: 'claude',
      customTitle: WEEK_PLAN_SESSION_LABEL
    })
    const worktrees = [
      worktreeRef({ id: 'wt-main', displayName: 'docs', isMainWorktree: true }),
      worktreeRef({ id: 'wt-session', displayName: 'other-session' }),
      worktreeRef({
        id: 'wt-plan',
        displayName: WEEK_PLAN_SESSION_LABEL,
        branch: WEEK_PLAN_SESSION_LABEL
      })
    ]
    expect(
      findWeekPlanTerminalTabInProject({
        activeWorktreeId: 'wt-session',
        tabsByWorktree: {
          'wt-session': [selected],
          'wt-plan': [plan]
        },
        projectWorktreeIds: ['wt-main', 'wt-session', 'wt-plan'],
        worktrees
      })?.tab.id
    ).toBe('plan')
    expect(
      resolveWeekPlanHomeWorktreeId({
        activeWorktreeId: 'wt-session',
        projectWorktreeIds: ['wt-main', 'wt-session', 'wt-plan'],
        worktrees
      })
    ).toBe('wt-plan')
  })

  it('keys the dedicated session by repo, then stored labeled tab id', () => {
    expect(weekPlanProjectKey({ repoId: 'repo-1' }, 'wt-1')).toBe('repo-1')
    expect(
      weekPlanProjectWorktreeIds('wt-1', [
        { id: 'wt-1', repoId: 'repo-1' },
        { id: 'wt-2', repoId: 'repo-1' },
        { id: 'wt-other', repoId: 'repo-2' }
      ])
    ).toEqual(['wt-1', 'wt-2'])
    const leftover = terminalTab({
      id: 'stored',
      worktreeId: 'wt-1',
      launchAgent: 'claude',
      customTitle: WEEK_PLAN_SESSION_LABEL
    })
    expect(
      findWeekPlanTerminalTabInProject({
        activeWorktreeId: 'wt-1',
        tabsByWorktree: { 'wt-1': [leftover] },
        projectWorktreeIds: ['wt-1'],
        storedTabId: 'stored'
      })?.tab.id
    ).toBe('stored')
    expect(
      findWeekPlanTerminalTabInProject({
        activeWorktreeId: 'wt-1',
        tabsByWorktree: {
          'wt-1': [terminalTab({ id: 'stored', worktreeId: 'wt-1', launchAgent: 'claude' })]
        },
        projectWorktreeIds: ['wt-1'],
        storedTabId: 'stored'
      })
    ).toBeUndefined()
  })
})

function worktreeRef(
  partial: Partial<{
    id: string
    repoId: string
    displayName: string
    branch: string
    isMainWorktree: boolean
  }> & { id: string }
) {
  return {
    id: partial.id,
    repoId: partial.repoId ?? 'repo-1',
    displayName: partial.displayName ?? partial.id,
    branch: partial.branch ?? 'main',
    isMainWorktree: partial.isMainWorktree ?? false
  }
}
