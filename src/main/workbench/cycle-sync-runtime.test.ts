import { describe, expect, it } from 'vitest'
import { trunkPullTarget } from './cycle-sync-runtime'

describe('trunkPullTarget 采用分支拉取来源解析', () => {
  it('远端限定 ref 拆为 remote 与 branch', () => {
    expect(trunkPullTarget('origin/master')).toEqual({
      remoteName: 'origin',
      branchName: 'master'
    })
    expect(trunkPullTarget('upstream/release/1.0')).toEqual({
      remoteName: 'upstream',
      branchName: 'release/1.0'
    })
  })

  it('无远端前缀的 ref 回退 origin', () => {
    expect(trunkPullTarget('main')).toEqual({ remoteName: 'origin', branchName: 'main' })
  })

  it('空 ref 无拉取来源', () => {
    expect(trunkPullTarget('')).toBeNull()
    expect(trunkPullTarget('   ')).toBeNull()
  })
})
