import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import {
  countLiveAgentSessions,
  deriveCommitmentProgress,
  deriveSessionReading,
  issueStateKey,
  type WallTaskState
} from './wall-card-readings'

const NOW = 1_800_000_000_000

function entry(state: AgentStatusEntry['state'], overrides: Partial<AgentStatusEntry> = {}) {
  return {
    state,
    updatedAt: NOW - 1_000,
    ...overrides
  } as AgentStatusEntry
}

function states(
  rows: [repository: string, number: number, state: 'OPEN' | 'CLOSED'][]
): Map<string, WallTaskState> {
  return new Map(
    rows.map(([repository, number, state]) => [issueStateKey(repository, number), { state }])
  )
}

const REPO = 'github.com/forcegravity1989/builder-workbench'
const CODEHUB_REPO = 'codehub-g.huawei.com/Org/Group/repo'

describe('deriveCommitmentProgress', () => {
  it('关闭即完成：closed 全部计入完成，开放计入开放（关闭原因不参与计数）', () => {
    const tasks = [
      { provider: 'github', repository: REPO, number: 1 },
      { provider: 'github', repository: REPO, number: 2 },
      { provider: 'github', repository: REPO, number: 3 },
      { provider: 'github', repository: REPO, number: 4 },
      { provider: 'github', repository: REPO, number: 5 }
    ]
    const progress = deriveCommitmentProgress(
      tasks,
      states([
        [REPO, 1, 'CLOSED'],
        [REPO, 2, 'CLOSED'],
        [REPO, 3, 'CLOSED'],
        [REPO, 4, 'OPEN'],
        [REPO, 5, 'OPEN']
      ])
    )
    expect(progress).toEqual({ completed: 3, open: 2 })
  })

  it('任一任务状态读不到 → null（整行 Unknown，不拼半真数字）', () => {
    const tasks = [
      { provider: 'github', repository: REPO, number: 1 },
      { provider: 'github', repository: REPO, number: 2 }
    ]
    expect(deriveCommitmentProgress(tasks, states([[REPO, 1, 'OPEN']]))).toBeNull()
  })

  it('provider 中立：GitHub 与 CodeHub 任务按状态回执一同计数', () => {
    const tasks = [
      { provider: 'github', repository: REPO, number: 1 },
      { provider: 'codehub', repository: CODEHUB_REPO, number: 7 }
    ]
    const progress = deriveCommitmentProgress(
      tasks,
      states([
        [REPO, 1, 'OPEN'],
        [CODEHUB_REPO, 7, 'CLOSED']
      ])
    )
    expect(progress).toEqual({ completed: 1, open: 1 })
  })
})

describe('countLiveAgentSessions', () => {
  it('只计 fresh 且非 done、归属项目工作树的会话条目；无 worktreeId 的经 tab 归属兜底', () => {
    const count = countLiveAgentSessions(
      {
        'tab-a:0': entry('working', { worktreeId: 'wt-1' }),
        'tab-a:1': entry('blocked', { worktreeId: 'wt-1' }),
        'tab-b:0': entry('done', { worktreeId: 'wt-1' }),
        'tab-c:0': entry('working', { worktreeId: 'wt-other' }),
        'tab-d:0': entry('working', { updatedAt: NOW - 60 * 60 * 1000, worktreeId: 'wt-1' })
      },
      {},
      new Set(['wt-1']),
      NOW
    )
    expect(count).toBe(2)
    const viaTab = countLiveAgentSessions(
      { 'tab-x:0': entry('working', { paneKey: 'tab-x:0' }) },
      { 'wt-9': [{ id: 'tab-x' }] },
      new Set(['wt-9']),
      NOW
    )
    expect(viaTab).toBe(1)
  })
})

describe('deriveSessionReading', () => {
  it('runtime 主机不全部在线 → unknown（离线 ≠ 0）；可用时给真实计数，0 是事实不是缺数', () => {
    expect(deriveSessionReading(false, 3)).toBe('unknown')
    expect(deriveSessionReading(true, 0)).toBe(0)
    expect(deriveSessionReading(true, 2)).toBe(2)
  })
})
