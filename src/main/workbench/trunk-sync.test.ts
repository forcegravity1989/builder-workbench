import { describe, expect, it } from 'vitest'
import { decideTrunkUpdate } from './trunk-sync'

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
})
