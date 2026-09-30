import { describe, expect, it, vi } from 'vitest'
import { startAcceptanceRound } from './acceptance-round'
import type { VersionTreePlan } from '../../../../shared/workbench/version-history'

const plan = {
  schema_version: 3,
  version: 'v1',
  cycleId: 'plan-cycle',
  summary: { progress: '', risks: '' },
  goals: [],
  tasks: []
}
const revision = `sha256:${'ab'.repeat(32)}`
const source: VersionTreePlan = {
  version: 'v1',
  cycleId: 'plan-cycle',
  sourceCommit: 'a'.repeat(40),
  revision,
  workflow: 'plan'
}

function harness(draft: { dirty: boolean } | null) {
  const readPlan = vi.fn(async () => ({
    document: plan,
    revision,
    planRef: { kind: 'committed' as const, ...source },
    source: {
      kind: 'committed' as const,
      sourceCommit: source.sourceCommit,
      baselineCommit: 'b'.repeat(40),
      baselineRef: 'origin/main'
    }
  }))
  const restore = vi.fn()
  const setError = vi.fn()
  const setBusy = vi.fn()
  const controller = { value: null, restore } as never
  const input = {
    sources: [source],
    planChoice: `${source.sourceCommit}:v1:plan-cycle`,
    contextVersion: 'v1',
    draft: draft as never,
    history: { readPlan } as never,
    scope: { repoId: 'r', worktreeId: 'w', hostId: 'local' },
    controller,
    generation: { current: 0 },
    setBusy,
    setError
  }
  return { input, readPlan, restore, setError }
}

describe('startAcceptanceRound 开轮门控', () => {
  it('未保存修改是唯一开轮门：拒绝并提示先保存或放弃', async () => {
    const { input, readPlan, restore, setError } = harness({ dirty: true })
    await startAcceptanceRound(input)
    expect(readPlan).not.toHaveBeenCalled()
    expect(restore).not.toHaveBeenCalled()
    expect(setError).toHaveBeenCalledWith(expect.stringContaining('未保存修改'))
  })

  it('归档状态不再阻塞开轮：干净草稿直接转换新轮', async () => {
    const { input, restore, setError } = harness({ dirty: false })
    await startAcceptanceRound(input)
    expect(restore).toHaveBeenCalledTimes(1)
    const restored = restore.mock.calls[0][0]
    expect(restored.dirty).toBe(true)
    expect(restored.document.planRef).toMatchObject({ version: 'v1', cycleId: 'plan-cycle' })
    expect(restored.document.cycleId).not.toBe('plan-cycle')
    expect(setError).toHaveBeenCalledWith(null)
  })

  it('所选计划与当前版本不一致时静默不开轮', async () => {
    const { input, restore, setError } = harness(null)
    await startAcceptanceRound({ ...input, contextVersion: 'v2' })
    expect(restore).not.toHaveBeenCalled()
    expect(setError).not.toHaveBeenCalled()
  })
})
