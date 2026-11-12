import { describe, expect, it } from 'vitest'
import { decideTrunkUpdate, trunkRefusalSentence } from './trunk-sync'

const cycle = {
  isTrunkCheckout: false,
  branch: 'bw/week-plan',
  baselineBranch: 'main',
  dirty: false
}
const trunk = { isTrunkCheckout: true, branch: 'main', baselineBranch: 'main', dirty: false }

describe('trunk update decision', () => {
  it('guards the main checkout: on-baseline, clean and without local commits', () => {
    expect(decideTrunkUpdate({ ...trunk, behind: 3, ahead: 0 })).toEqual({
      action: 'fast-forward',
      behind: 3
    })
    expect(decideTrunkUpdate({ ...trunk, behind: 0, ahead: 0 })).toEqual({ action: 'current' })
    expect(decideTrunkUpdate({ ...trunk, branch: 'hotfix', behind: 1, ahead: 0 })).toEqual({
      action: 'refuse',
      reason: 'branch-mismatch'
    })
    expect(decideTrunkUpdate({ ...trunk, dirty: true, behind: 1, ahead: 0 })).toEqual({
      action: 'refuse',
      reason: 'dirty-trunk'
    })
    expect(decideTrunkUpdate({ ...trunk, behind: 0, ahead: 2 })).toEqual({
      action: 'refuse',
      reason: 'ahead-trunk'
    })
  })

  it('lets a cycle tree merge the trunk regardless of its own draft commits', () => {
    // New trunk commits become a merge — no fast-forward-only divergence stop.
    expect(decideTrunkUpdate({ ...cycle, behind: 2, ahead: 0 })).toEqual({
      action: 'merge',
      behind: 2
    })
    // A pure draft state is the tree's normal working condition — silent.
    expect(decideTrunkUpdate({ ...cycle, behind: 0, ahead: 4 })).toEqual({ action: 'current' })
    // Local draft commits plus a moved trunk is exactly what merging is for.
    expect(decideTrunkUpdate({ ...cycle, behind: 2, ahead: 4 })).toEqual({
      action: 'merge',
      behind: 2
    })
    // Dirty drafts do not block a merge either (they are the tree's job).
    expect(decideTrunkUpdate({ ...cycle, dirty: true, behind: 3, ahead: 1 })).toEqual({
      action: 'merge',
      behind: 3
    })
  })

  it('phrases a main-checkout refusal as one cause plus the one next step', () => {
    const mismatch = trunkRefusalSentence('branch-mismatch', {
      branch: 'hotfix',
      baselineBranch: 'main',
      behind: 0,
      ahead: 0
    })
    expect(mismatch).toContain('主检出当前在 hotfix 分支，与基线 main 不一致')
    // The session works where the blocker is: the tree's own branch.
    expect(mismatch).toContain('请让会话模型处理 hotfix 分支的代码更新。')
    expect(
      trunkRefusalSentence('ahead-trunk', {
        branch: 'main',
        baselineBranch: 'main',
        behind: 1,
        ahead: 2
      })
    ).toBe('代码未更新（主检出有 2 个未合入基线的本地提交）。请让会话模型处理 main 分支的代码更新。')
  })
})
