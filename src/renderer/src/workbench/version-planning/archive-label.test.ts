import { expect, it } from 'vitest'
import type { ArchiveStatus } from '../../../../shared/workbench/version-archive'
import { archiveStatusLabel } from './archive-label'

const revision = `sha256:${'a'.repeat(64)}`
const reference = {
  provider: 'github',
  repository: 'github.com/team/project',
  number: 9,
  materialRevision: revision
}
type Openish = Extract<ArchiveStatus, { kind: 'open' | 'merged' | 'closed' }>
function open(overrides: Partial<Openish> = {}): Openish {
  return {
    kind: 'open',
    reference,
    url: 'https://github.com/team/project/pull/9',
    checkedAt: '2026-09-25T00:00:00Z',
    checks: 'pending',
    review: 'pending',
    mergeCommit: null,
    proof: { kind: 'unknown', reason: '评审尚未合入' },
    ...overrides
  }
}

it('keeps pending/unknown/not-created states honest', () => {
  expect(archiveStatusLabel({ kind: 'unknown', reason: '读不到' }, false, false)).toBe(
    '状态未知：读不到'
  )
  expect(archiveStatusLabel({ kind: 'not-created', checkedAt: 'x' }, false, false)).toBe(
    '尚未创建归档 PR'
  )
  expect(archiveStatusLabel(open(), false, true)).toBe('正在读取归档状态…')
  expect(archiveStatusLabel(open(), false, false)).toBe('归档 PR 待评审')
})

it('surfaces bad provider states instead of flattening them into waiting-for-review', () => {
  expect(archiveStatusLabel(open({ review: 'changes-requested' }), false, false)).toBe(
    '归档 PR 评审请求修改'
  )
  expect(archiveStatusLabel(open({ checks: 'failed' }), false, false)).toBe('归档 PR 检查失败')
  expect(
    archiveStatusLabel(open({ checks: 'failed', review: 'changes-requested' }), false, false)
  ).toBe('归档 PR 评审请求修改、检查失败')
  expect(archiveStatusLabel(open({ kind: 'closed' }), false, false)).toBe('归档 PR 已关闭')
})

it('keeps merged-but-unproven material visible as 待核 and proven archive as merged', () => {
  const merged = { ...open(), kind: 'merged' as const, mergeCommit: 'b'.repeat(40) }
  expect(archiveStatusLabel(merged, false, false)).toBe('已合入，当前材料待核')
  expect(
    archiveStatusLabel({ ...merged, proof: { kind: 'verified', value: {} as never } }, false, false)
  ).toBe('有待归档变化')
  expect(
    archiveStatusLabel({ ...merged, proof: { kind: 'verified', value: {} as never } }, true, false)
  ).toBe('当前修订已合入')
})
