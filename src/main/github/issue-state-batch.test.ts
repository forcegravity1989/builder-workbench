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
    expect(query).toContain('i3: issue(number: 3) { state }')
    expect(query).toContain('i42: issue(number: 42) { state }')
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

  it('超限与非法分开报因：超上限说上限，不说「列表非法」', async () => {
    ghExecFileAsync.mockClear()
    const result = await getIssueStatesBatch({
      owner: 'o',
      repo: 'r',
      numbers: Array.from({ length: 201 }, (_, index) => index + 1)
    })
    expect(result.error).toContain('超单次读取上限')
    expect(result.error).not.toContain('非法')
    expect(ghExecFileAsync).not.toHaveBeenCalled()
  })

  it('解析别名回执为条目；缺失编号不进 items（调用方按读不到处理）', async () => {
    ghExecFileAsync.mockClear()
    ghExecFileAsync.mockResolvedValueOnce({
      stdout: JSON.stringify({
        data: {
          repository: {
            i1: { state: 'CLOSED' },
            i2: { state: 'OPEN' },
            i3: null
          }
        }
      })
    })
    const result = await getIssueStatesBatch({ owner: 'o', repo: 'r', numbers: [1, 2, 3] })
    expect(result.error).toBeUndefined()
    expect(result.items).toEqual([
      { number: 1, state: 'CLOSED' },
      { number: 2, state: 'OPEN' }
    ])
  })
})
