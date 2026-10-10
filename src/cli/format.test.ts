import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeRpcFailureError } from './runtime-client'
import {
  formatCliError,
  formatAutomationShow,
  formatTerminalList,
  formatTerminalRead,
  formatWorktreeList,
  reportCliError
} from './format'
import type { RuntimeWorktreeRecord } from '../shared/runtime-types'
import type { Automation } from '../shared/automations-types'

afterEach(() => {
  vi.restoreAllMocks()
})

function worktree(overrides: Partial<RuntimeWorktreeRecord> = {}): RuntimeWorktreeRecord {
  const base: RuntimeWorktreeRecord = {
    id: 'repo::/tmp/repo/child',
    repoId: 'repo',
    path: '/tmp/repo/child',
    head: 'abc123',
    branch: 'feature/child',
    isBare: false,
    isMainWorktree: false,
    parentWorktreeId: null,
    childWorktreeIds: [],
    lineage: null,
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    git: {
      path: '/tmp/repo/child',
      head: 'abc123',
      branch: 'feature/child',
      isBare: false,
      isMainWorktree: false
    },
    displayName: '',
    comment: ''
  }
  return { ...base, ...overrides }
}

describe('formatCliError', () => {
  it('prints structured runtime recovery steps', () => {
    const error = new RuntimeRpcFailureError({
      id: 'req_1',
      ok: false,
      error: {
        code: 'repo_not_found',
        message: 'repo not found: web',
        data: {
          nextSteps: [
            'Run `orca repo list --json` and retry with the exact repo selector.',
            'Do not retry the same `orca repo show --repo <name>` command unchanged.'
          ]
        }
      },
      _meta: { runtimeId: 'runtime-1' }
    })

    const output = formatCliError(error)

    expect(output).toContain('repo not found: web')
    expect(output).toContain('Next step: Run `orca repo list --json`')
    expect(output).toContain('--repo <name>')
  })

  it('prints runtime next steps for structured lineage errors', () => {
    const error = new RuntimeRpcFailureError({
      id: 'req_1',
      ok: false,
      error: {
        code: 'LINEAGE_PARENT_NOT_FOUND',
        message: 'Parent selector was not found.',
        data: {
          nextSteps: [
            'Pass a valid --parent-worktree selector such as folder:<id>, worktree:<worktreeId>, id:<repo-id>::<path>, branch:<branch>, issue:<number>, path:<absolute-path>, or active/current.',
            'Retry with --no-parent to create without lineage.',
            123
          ]
        }
      },
      _meta: { runtimeId: 'runtime-1' }
    })

    expect(formatCliError(error)).toBe(
      [
        'Parent selector was not found.',
        'Next step: Pass a valid --parent-worktree selector such as folder:<id>, worktree:<worktreeId>, id:<repo-id>::<path>, branch:<branch>, issue:<number>, path:<absolute-path>, or active/current.',
        'Next step: Retry with --no-parent to create without lineage.'
      ].join('\n')
    )
  })

  it('preserves orchestration migration recovery in human and JSON errors', () => {
    const error = new RuntimeRpcFailureError({
      id: 'req_migration',
      ok: false,
      error: {
        code: 'orchestration_migration_required',
        message: 'No effects were applied.',
        data: {
          effectsApplied: false,
          nextCommandArgs: ['skills', 'get', 'orchestration', '--full'],
          nextSteps: ['Using this same Orca CLI executable, run: skills get orchestration --full']
        }
      },
      _meta: { runtimeId: 'runtime-1' }
    })

    expect(formatCliError(error)).toContain(
      'Next step: Using this same Orca CLI executable, run: skills get orchestration --full'
    )
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    reportCliError(error, true)
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      error: {
        code: 'orchestration_migration_required',
        data: {
          effectsApplied: false,
          nextCommandArgs: ['skills', 'get', 'orchestration', '--full']
        }
      }
    })
  })
})

describe('formatWorktreeList', () => {
  it('includes parent and child workspace relationships in text output', () => {
    const output = formatWorktreeList({
      worktrees: [
        worktree({
          id: 'repo::/tmp/repo/parent',
          path: '/tmp/repo/parent',
          branch: 'feature/parent',
          childWorktreeIds: ['repo::/tmp/repo/child']
        }),
        worktree({
          parentWorktreeId: 'repo::/tmp/repo/parent'
        })
      ],
      totalCount: 2,
      truncated: false
    })

    expect(output).toContain('parentWorktreeId: null')
    expect(output).toContain('childWorktreeIds: repo::/tmp/repo/child')
    expect(output).toContain('parentWorktreeId: repo::/tmp/repo/parent')
    expect(output).toContain('childWorktreeIds: []')
  })
})

describe('formatAutomationShow', () => {
  function automation(overrides: Partial<Automation> = {}): Automation {
    return {
      id: 'auto-1',
      name: 'Nightly',
      prompt: 'Run checks',
      precheck: null,
      agentId: 'codex',
      projectId: 'repo-legacy',
      executionTargetType: 'local',
      executionTargetId: 'local',
      schedulerOwner: 'local_host_service',
      workspaceMode: 'new_per_run',
      workspaceId: null,
      baseBranch: null,
      reuseSession: false,
      timezone: 'UTC',
      rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
      dtstart: 0,
      enabled: true,
      nextRunAt: 0,
      missedRunPolicy: 'run_once_within_grace',
      missedRunGraceMinutes: 720,
      createdAt: 0,
      updatedAt: 0,
      ...overrides
    }
  }

  it('shows explicit run context before the legacy repo id', () => {
    const output = formatAutomationShow({
      automation: automation({
        runContext: {
          kind: 'workspace-run',
          projectId: 'github:stablyai/orca',
          hostId: 'runtime:gpu',
          projectHostSetupId: 'setup-gpu',
          repoId: 'repo-gpu',
          path: '/srv/orca'
        }
      })
    })

    expect(output).toContain('runProjectId: github:stablyai/orca')
    expect(output).toContain('runHostId: runtime:gpu')
    expect(output).toContain('projectHostSetupId: setup-gpu')
    expect(output).toContain('runRepoId: repo-gpu')
    expect(output).toContain('runPath: /srv/orca')
    expect(output).toContain('legacyRepoId: repo-legacy')
    expect(output).not.toContain('projectId: repo-legacy')
  })
})

describe('formatTerminalList', () => {
  it('prints visual split groups and nested terminal panes', () => {
    const output = formatTerminalList({
      terminals: [
        {
          handle: 'term_left',
          ptyId: 'pty-left',
          worktreeId: 'wt-1',
          worktreePath: '/repo',
          branch: 'main',
          tabId: 'tab-left',
          leafId: 'leaf-left',
          title: 'Left',
          connected: true,
          writable: true,
          lastOutputAt: null,
          preview: ''
        },
        {
          handle: 'term_top',
          ptyId: 'pty-top',
          worktreeId: 'wt-1',
          worktreePath: '/repo',
          branch: 'main',
          tabId: 'tab-right',
          leafId: 'leaf-top',
          title: 'Right top',
          connected: true,
          writable: true,
          lastOutputAt: null,
          preview: ''
        },
        {
          handle: 'term_bottom',
          ptyId: 'pty-bottom',
          worktreeId: 'wt-1',
          worktreePath: '/repo',
          branch: 'main',
          tabId: 'tab-right',
          leafId: 'leaf-bottom',
          title: 'Right bottom',
          connected: true,
          writable: true,
          lastOutputAt: null,
          preview: ''
        }
      ],
      totalCount: 3,
      truncated: false,
      visualLayouts: [
        {
          worktreeId: 'wt-1',
          worktreePath: '/repo',
          root: {
            type: 'split',
            direction: 'horizontal',
            first: {
              type: 'group',
              groupId: 'group-left',
              activeTabId: 'tab-left',
              tabs: [
                {
                  tabId: 'tab-left',
                  title: 'Left',
                  activeLeafId: 'leaf-left',
                  panes: {
                    type: 'terminal',
                    handle: 'term_left',
                    tabId: 'tab-left',
                    leafId: 'leaf-left',
                    title: 'Left',
                    connected: true,
                    active: true
                  }
                }
              ]
            },
            second: {
              type: 'group',
              groupId: 'group-right',
              activeTabId: 'tab-right',
              tabs: [
                {
                  tabId: 'tab-right',
                  title: 'Right',
                  activeLeafId: 'leaf-bottom',
                  panes: {
                    type: 'pane-split',
                    direction: 'vertical',
                    first: {
                      type: 'terminal',
                      handle: 'term_top',
                      tabId: 'tab-right',
                      leafId: 'leaf-top',
                      title: 'Right top',
                      connected: true,
                      active: false
                    },
                    second: {
                      type: 'terminal',
                      handle: 'term_bottom',
                      tabId: 'tab-right',
                      leafId: 'leaf-bottom',
                      title: 'Right bottom',
                      connected: true,
                      active: true
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    } as never)

    expect(output).toContain('visual layout:')
    expect(output).toContain('/repo')
    expect(output).toContain('split horizontal')
    expect(output).toContain('group group-left')
    expect(output).toContain('tab tab-left  Left')
    expect(output).toContain('* term_left  Left  tab=tab-left leaf=leaf-left')
    expect(output).toContain('group group-right')
    expect(output).toContain('pane split vertical')
    expect(output).toContain('  term_top  Right top  tab=tab-right leaf=leaf-top')
    expect(output).toContain('* term_bottom  Right bottom  tab=tab-right leaf=leaf-bottom')
  })
})

describe('formatTerminalRead', () => {
  it('warns limited cursor reads to continue with the next cursor', () => {
    const output = formatTerminalRead({
      terminal: {
        handle: 'term_1',
        status: 'running',
        tail: ['line 1'],
        truncated: false,
        limited: true,
        oldestCursor: '0',
        nextCursor: '50',
        latestCursor: '150',
        returnedLineCount: 1
      }
    })

    expect(output).toContain('cursor: 50')
    expect(output).toContain('oldest cursor: 0')
    expect(output).toContain('latest cursor: 150')
    expect(output).toContain('warning: output limited; continue with --cursor 50')
  })

  it('warns limited tail previews to page retained output from the oldest cursor', () => {
    const output = formatTerminalRead({
      terminal: {
        handle: 'term_1',
        status: 'running',
        tail: ['line 100'],
        truncated: false,
        limited: true,
        oldestCursor: '0',
        nextCursor: '150',
        latestCursor: '150',
        returnedLineCount: 1
      }
    })

    expect(output).toContain('cursor: 150')
    expect(output).toContain('oldest cursor: 0')
    expect(output).toContain('latest cursor: 150')
    expect(output).toContain(
      'warning: output limited; page retained output with --cursor 0 --limit <count>'
    )
  })

  it('uses a generic limited warning when only partial output is retained', () => {
    const output = formatTerminalRead({
      terminal: {
        handle: 'term_1',
        status: 'running',
        tail: [],
        truncated: false,
        limited: true,
        oldestCursor: '150',
        nextCursor: '150',
        latestCursor: '150',
        returnedLineCount: 0
      }
    })

    expect(output).toContain('cursor: 150')
    expect(output).toContain('oldest cursor: 150')
    expect(output).toContain('latest cursor: 150')
    expect(output).toContain('warning: output limited')
    expect(output).not.toContain('page retained output')
  })

  it('keeps older runtime read responses readable', () => {
    const output = formatTerminalRead({
      terminal: {
        handle: 'term_1',
        status: 'running',
        tail: ['old server output'],
        truncated: true,
        nextCursor: '12'
      }
    })

    expect(output).toContain('cursor: 12')
    expect(output).toContain('warning: older output is no longer retained')
    expect(output).toContain('old server output')
    expect(output).not.toContain('undefined')
  })
})
