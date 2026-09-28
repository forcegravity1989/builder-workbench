import { describe, expect, it } from 'vitest'
import type { MetricRange } from '../../../shared/workbench/metrics'
import type { Repo } from '../../../shared/repo-types'
import { bucketCommitCounts, sdlcProviderOf } from './overview-sdlc'

type RepoPick = Pick<Repo, 'upstream' | 'repoIcon' | 'gitRemoteIdentity'>

const weekRange: MetricRange = {
  kind: 'range',
  since: '2026-09-14',
  until: '2026-09-28',
  granularity: 'week',
  timezone: 'UTC'
}
const dayRange: MetricRange = {
  kind: 'range',
  since: '2026-09-24',
  until: '2026-09-26',
  granularity: 'day',
  timezone: 'UTC'
}
const at = (iso: string) => ({ timestamp: Date.parse(iso) })

describe('sdlcProviderOf', () => {
  it('CodeHub 远端识别为 codehub，GitHub upstream 识别为 github，其余为空', () => {
    const codehub: RepoPick = {
      gitRemoteIdentity: {
        remoteUrl: 'git@codehub.example.com:group/proj.git',
        canonicalKey: 'codehub.example.com/group/proj',
        remoteName: 'origin'
      }
    }
    const github: RepoPick = { upstream: { owner: 'octo', repo: 'proj' } }
    const other: RepoPick = {
      gitRemoteIdentity: {
        remoteUrl: 'https://gitlab.com/group/proj.git',
        canonicalKey: 'gitlab.com/group/proj',
        remoteName: 'origin'
      }
    }
    expect(sdlcProviderOf(codehub)).toBe('codehub')
    expect(sdlcProviderOf(github)).toBe('github')
    expect(sdlcProviderOf(other)).toBeNull()
    expect(sdlcProviderOf(null)).toBeNull()
  })

  it('github.com 主机不落入 codehub，走 github 身份', () => {
    const githubRemote: RepoPick = {
      gitRemoteIdentity: {
        remoteUrl: 'https://github.com/octo/proj.git',
        canonicalKey: 'github.com/octo/proj',
        remoteName: 'origin'
      }
    }
    expect(sdlcProviderOf(githubRemote)).toBe('github')
  })
})

describe('bucketCommitCounts', () => {
  it('完整历史：每个桶按提交真实时间计数，无提交的桶是真实 0', () => {
    const result = bucketCommitCounts(
      [at('2026-09-15T10:00:00Z'), at('2026-09-21T09:00:00Z'), at('2026-09-22T18:00:00Z')],
      weekRange,
      'UTC',
      false
    )
    expect(result.counts).toEqual([1, 2])
    expect(result.truncated).toBe(false)
  })

  it('窗口内无任何提交时全为真实 0（历史完整），不补造也不留空', () => {
    expect(bucketCommitCounts([], weekRange, 'UTC', false).counts).toEqual([0, 0])
  })

  it('截断历史：所有桶留空，拓扑顺序不能证明较新桶已完整', () => {
    const result = bucketCommitCounts(
      [at('2026-09-16T10:00:00Z'), at('2026-09-22T10:00:00Z'), at('2026-09-23T10:00:00Z')],
      weekRange,
      'UTC',
      true
    )
    expect(result.counts).toEqual([null, null])
    expect(result.truncated).toBe(true)
  })

  it('日粒度按项目时区的午夜落桶，窗口左含右不含', () => {
    const result = bucketCommitCounts(
      [
        at('2026-09-23T15:59:59Z'),
        at('2026-09-23T16:00:00Z'),
        at('2026-09-24T15:59:59Z'),
        at('2026-09-24T16:00:00Z'),
        at('2026-09-25T16:00:00Z')
      ],
      { ...dayRange, timezone: 'Asia/Shanghai' },
      'Asia/Shanghai',
      false
    )
    expect(result.counts).toEqual([2, 1])
  })
})

it('missing timestamps and truncated empty results cannot become zero', () => {
  expect(bucketCommitCounts([{}], dayRange, 'UTC', false).counts).toEqual([null, null])
  expect(bucketCommitCounts([], dayRange, 'UTC', true).counts).toEqual([null, null])
})
