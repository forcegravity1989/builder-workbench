import { describe, expect, it } from 'vitest'
import {
  decideTrunkUpdate,
  isMainCheckoutPath,
  trunkRefusalSentence
} from './trunk-sync'

const cycle = { isTrunkCheckout: false, branch: null, baselineBranch: 'main', dirty: false }
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

  it('lets a cycle tree carry drafts and refuses only divergence', () => {
    expect(decideTrunkUpdate({ ...cycle, behind: 2, ahead: 0 })).toEqual({
      action: 'fast-forward',
      behind: 2
    })
    // A pure draft state is the tree's normal working condition — silent.
    expect(decideTrunkUpdate({ ...cycle, behind: 0, ahead: 4 })).toEqual({ action: 'current' })
    expect(decideTrunkUpdate({ ...cycle, dirty: true, behind: 2, ahead: 0 })).toEqual({
      action: 'fast-forward',
      behind: 2
    })
    expect(decideTrunkUpdate({ ...cycle, behind: 2, ahead: 4 })).toEqual({
      action: 'refuse',
      reason: 'diverged'
    })
  })

  it('phrases refusals as one cause plus the one next step', () => {
    expect(
      trunkRefusalSentence('diverged', {
        branch: 'bw/week-plan',
        baselineBranch: 'main',
        behind: 2,
        ahead: 4
      })
    ).toBe('代码未更新（工作树有 4 个未合入提交、主干新增 2 个，已分叉）。请让会话模型处理 main 分支的代码更新。')
    expect(
      trunkRefusalSentence('branch-mismatch', {
        branch: 'hotfix',
        baselineBranch: 'main',
        behind: 0,
        ahead: 0
      })
    ).toContain('主检出当前在 hotfix 分支，与基线 main 不一致')
    expect(isMainCheckoutPath('C:\\repo\\', 'c:\\REPO')).toBe(true)
    expect(isMainCheckoutPath('/srv/repo/.bw/worktrees/plan', '/srv/repo')).toBe(false)
  })
})
