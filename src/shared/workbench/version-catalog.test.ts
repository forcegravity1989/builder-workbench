import { describe, expect, it } from 'vitest'
import type { Worktree } from '../worktree/types'
import type { VersionHistoryCatalog } from './version-history'
import type { WorkbenchVersionBinding } from './version-binding'
import {
  collectVersionCatalogWorkspaces,
  mergeVersionCatalog,
  versionCatalogCacheKey,
  type VersionCatalogWorkspace
} from './version-catalog'

/** 环 4 核心算法看护：版本目录合并/悬空治理/缓存分隔（G2 P1b）。 */

const sha = (fill: string) => `sha256:${fill.repeat(64)}`

function makeWorktree(overrides: Partial<Worktree> & { id: string }): Worktree {
  return {
    repoId: 'repo-1',
    path: `/repo/trees/${overrides.id}`,
    head: 'abc123',
    branch: 'refs/heads/bw/task',
    isBare: false,
    isMainWorktree: false,
    displayName: overrides.id,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  } as Worktree
}

const planBinding = (version: string) => ({
  schema: 1 as const,
  version,
  workflow: 'plan' as const
})
const goalBinding = (version: string, goalId: string) => ({
  schema: 1 as const,
  version,
  workflow: 'goal' as const,
  goalId
})

const committed: VersionHistoryCatalog = {
  baselineCommit: 'c'.repeat(40),
  baselineRef: 'main',
  records: [
    {
      version: 'v0.6',
      cycleId: 'cycle-06',
      sourceCommit: 'a'.repeat(40),
      revision: sha('6'),
      workflow: 'plan',
      committedAt: '2026-09-01T00:00:00Z'
    },
    {
      version: 'v0.6',
      cycleId: 'cycle-06',
      sourceCommit: 'a'.repeat(40),
      revision: sha('7'),
      workflow: 'acceptance',
      committedAt: '2026-09-01T00:00:00Z'
    },
    {
      version: 'v0.7',
      cycleId: 'cycle-07',
      sourceCommit: 'b'.repeat(40),
      revision: sha('8'),
      workflow: 'plan',
      committedAt: '2026-10-01T00:00:00Z'
    }
  ],
  problems: [
    {
      version: 'v0.5',
      sourceCommit: '0'.repeat(40),
      workflow: 'plan',
      committedAt: '2026-08-01T00:00:00Z',
      code: 'history-unavailable',
      message: '无法读取固定提交中的材料'
    }
  ]
}

describe('mergeVersionCatalog', () => {
  it('merges committed material with live bindings, keeping material provenance', () => {
    const worktrees = [
      // 本机 owned 计划树 + 配对宿主上的目标树：同版汇总两机实例。
      makeWorktree({
        id: 'repo-1::/repo/trees/v07-plan',
        hostId: 'local',
        instanceId: 'inst-plan',
        workbenchVersionBinding: planBinding('v0.7')
      }),
      makeWorktree({
        id: 'repo-1::/repo/trees/v07-goal',
        hostId: 'ssh:build-box',
        runtimeOwnerEnvironmentId: 'env-9',
        instanceId: 'inst-goal',
        workbenchVersionBinding: goalBinding('v0.7', 'G1')
      }),
      // 未绑定旧树与归档树不入目录。
      makeWorktree({ id: 'repo-1::/repo/trees/legacy' }),
      makeWorktree({
        id: 'repo-1::/repo/trees/archived',
        isArchived: true,
        workbenchVersionBinding: planBinding('v0.7')
      })
    ]
    const entries = mergeVersionCatalog({
      committed,
      drafts: [
        // v0.7 工作副本领先主干：草稿只附加，不覆盖已合入材料。
        { version: 'v0.7', cycleId: 'cycle-07', revision: sha('9') },
        { version: 'v0.8', cycleId: 'cycle-08', revision: sha('a') }
      ],
      goalsByVersion: new Map([['v0.7', [{ goalId: 'G1', title: '打通绑定' }]]]),
      workspaces: collectVersionCatalogWorkspaces(worktrees, ['repo-1'])
    })

    expect(entries.map((entry) => entry.version)).toEqual(['v0.5', 'v0.6', 'v0.7', 'v0.8'])
    const v06 = entries.find((entry) => entry.version === 'v0.6')!
    expect(v06.state).toBe('retired')
    expect(v06.material.plan?.revision).toBe(sha('6'))
    expect(v06.material.acceptance?.revision).toBe(sha('7'))
    const v07 = entries.find((entry) => entry.version === 'v0.7')!
    expect(v07.state).toBe('working')
    expect(v07.material.plan?.revision).toBe(sha('8'))
    expect(v07.draft?.revision).toBe(sha('9'))
    expect(v07.goals).toEqual([{ goalId: 'G1', title: '打通绑定' }])
    expect(
      v07.workspaces.map((workspace: VersionCatalogWorkspace) => [
        workspace.hostId,
        workspace.runtimeOwnerEnvironmentId,
        workspace.binding.workflow
      ])
    ).toEqual([
      ['local', null, 'plan'],
      ['ssh:build-box', 'env-9', 'goal']
    ])
    // 材料存在但读不到：问题如实列出，条目保留。
    const v05 = entries.find((entry) => entry.version === 'v0.5')!
    expect(v05.problems).toEqual([
      { workflow: 'plan', code: 'history-unavailable', message: '无法读取固定提交中的材料' }
    ])
    expect(v05.state).toBe('retired')
  })

  it('keeps cleaned versions listed without dangling bindings after any removal path', () => {
    // 树已从登记消失（任何删除路径的结果）：目录不显示悬空绑定，条目仍入列。
    const entries = mergeVersionCatalog({
      committed,
      goalsByVersion: new Map([['v0.7', [{ goalId: 'G1', title: '打通绑定' }]]]),
      workspaces: collectVersionCatalogWorkspaces([], ['repo-1'])
    })
    const v07 = entries.find((entry) => entry.version === 'v0.7')!
    expect(v07.workspaces).toEqual([])
    expect(v07.state).toBe('retired')
    expect(v07.material.plan?.cycleId).toBe('cycle-07')
    expect(v07.goals).toHaveLength(1)
    // 脏绑定数据（旧写入/外部编辑）同样不产生悬空条目。
    const dirtyBinding = {
      schema: 1,
      version: 'v0.9',
      workflow: 'plan',
      extra: true
    } as unknown as WorkbenchVersionBinding
    const dirty = mergeVersionCatalog({
      committed: { records: [], problems: [] },
      workspaces: collectVersionCatalogWorkspaces(
        [
          makeWorktree({
            id: 'repo-1::/repo/trees/dirty',
            workbenchVersionBinding: dirtyBinding
          })
        ],
        ['repo-1']
      )
    })
    expect(dirty).toEqual([])
  })

  it('keeps v0.7/v0.8 controlled records apart and scopes cache keys', () => {
    // 两组受控记录：v0.7 绑在本机、v0.8 绑在配对宿主；他仓同版本绑定不串入。
    const worktrees = [
      makeWorktree({
        id: 'repo-1::/repo/trees/a',
        hostId: 'local',
        workbenchVersionBinding: planBinding('v0.7')
      }),
      makeWorktree({
        id: 'repo-1::/repo/trees/b',
        hostId: 'ssh:build-box',
        runtimeOwnerEnvironmentId: 'env-9',
        workbenchVersionBinding: planBinding('v0.8')
      }),
      makeWorktree({
        id: 'repo-2::/other/trees/c',
        repoId: 'repo-2',
        workbenchVersionBinding: planBinding('v0.7')
      })
    ]
    const entries = mergeVersionCatalog({
      committed: { records: [], problems: [] },
      goalsByVersion: new Map([
        ['v0.7', [{ goalId: 'G1', title: '七版目标' }]],
        ['v0.8', [{ goalId: 'G2', title: '八版目标' }]]
      ]),
      workspaces: collectVersionCatalogWorkspaces(worktrees, ['repo-1'])
    })
    expect(entries.map((entry) => entry.version)).toEqual(['v0.7', 'v0.8'])
    const v07 = entries[0]
    const v08 = entries[1]
    expect(v07.workspaces.map((workspace) => workspace.worktreeId)).toEqual([
      'repo-1::/repo/trees/a'
    ])
    expect(v08.workspaces.map((workspace) => workspace.worktreeId)).toEqual([
      'repo-1::/repo/trees/b'
    ])
    expect(v07.goals.map((goal) => goal.goalId)).toEqual(['G1'])
    expect(v08.goals.map((goal) => goal.goalId)).toEqual(['G2'])
    // 缓存键按 owner/项目/仓库/版本/修订分隔：任一维不同即不同键，同输入稳定。
    const key = (overrides: Partial<Parameters<typeof versionCatalogCacheKey>[0]> = {}) =>
      versionCatalogCacheKey({
        hostId: 'local',
        runtimeOwnerEnvironmentId: null,
        projectId: 'proj-1',
        repoId: 'repo-1',
        version: 'v0.7',
        revision: sha('8'),
        ...overrides
      })
    expect(key()).toBe(key())
    const distinct = [
      key({ version: 'v0.8' }),
      key({ revision: sha('9') }),
      key({ hostId: 'ssh:build-box' }),
      key({ runtimeOwnerEnvironmentId: 'env-9' }),
      key({ projectId: 'proj-2' }),
      key({ repoId: 'repo-2' })
    ]
    expect(new Set([key(), ...distinct]).size).toBe(distinct.length + 1)
  })
})
