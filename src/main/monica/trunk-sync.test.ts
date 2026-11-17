import { describe, expect, it } from 'vitest'
import { decideTrunkUpdate, trunkRefusalSentence } from './trunk-sync'

const trunk = { branch: 'main', baselineBranch: 'main', dirty: false }

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

  it('phrases a main-checkout refusal as one cause plus the one next step', () => {
    const mismatch = trunkRefusalSentence('branch-mismatch', {
      branch: 'hotfix',
      baselineBranch: 'main',
      ahead: 0
    })
    expect(mismatch).toContain('主检出当前在 hotfix 分支，与基线 main 不一致')
    // The session works where the blocker is: the tree's own branch.
    expect(mismatch).toContain('请让会话模型处理 hotfix 分支的代码更新。')
    expect(
      trunkRefusalSentence('ahead-trunk', {
        branch: 'main',
        baselineBranch: 'main',
        ahead: 2
      })
    ).toBe(
      '代码未更新（主检出有 2 个未合入基线的本地提交）。请让会话模型处理 main 分支的代码更新。'
    )
  })
})
