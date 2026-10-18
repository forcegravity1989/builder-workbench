import { describe, expect, it, vi } from 'vitest'

const ghExecFileAsync = vi.fn()
vi.mock('./gh-utils', () => ({
  ghExecFileAsync: (...args: unknown[]) => ghExecFileAsync(...args),
  acquire: () => Promise.resolve(),
  release: () => {}
}))

import { buildIssueStatesQuery, getIssueStatesBatch } from './issue-state-batch'

describe('getIssueStatesBatch', () => {
  it('按编号生成别名展开的 GraphQL 查询', () => {
    const query = buildIssueStatesQuery('owner', 'repo', [3, 42])
    expect(query).toContain('repository(owner: "owner", name: "repo")')
    expect(query).toContain('i3: issue(number: 3) { state stateReason }')
    expect(query).toContain('i42: issue(number: 42) { state stateReason }')
  })

  it('owner/repo 含非法字符时拒绝查询（防 GraphQL 注入），不调用 gh', async () => {
    ghExecFileAsync.mockClear()
    const result = await getIssueStatesBatch({
      owner: 'own"er',
      repo: 'repo',
      numbers: [1]
    })
    expect(result.error).toContain('非法字符')
    expect(ghExecFileAsync).not.toHaveBeenCalled()
  })

  it('解析别名回执为条目；缺失编号不进 items（调用方按读不到处理）', async () => {
    ghExecFileAsync.mockClear()
    ghExecFileAsync.mockResolvedValueOnce({
      stdout: JSON.stringify({
        data: {
          repository: {
            i1: { state: 'CLOSED', stateReason: 'COMPLETED' },
            i2: { state: 'OPEN', stateReason: null },
            i3: null
          }
        }
      })
    })
    const result = await getIssueStatesBatch({ owner: 'o', repo: 'r', numbers: [1, 2, 3] })
    expect(result.error).toBeUndefined()
    expect(result.items).toEqual([
      { number: 1, state: 'CLOSED', stateReason: 'COMPLETED' },
      { number: 2, state: 'OPEN', stateReason: null }
    ])
  })
})
