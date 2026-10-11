import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runCodeHubCliMock } = vi.hoisted(() => ({
  runCodeHubCliMock: vi.fn()
}))

vi.mock('./cli', () => ({
  runCodeHubCli: runCodeHubCliMock
}))

import { fetchCodeHubRepoFileRaw, viewCodeHubProject } from './repo-reads'

const remote = { host: 'codehub-g.huawei.com', project: 'Org/Group/repo' }

describe('viewCodeHubProject', () => {
  beforeEach(() => {
    runCodeHubCliMock.mockReset()
  })

  it('strips JSON encoding from --jq default branch output', async () => {
    // codehub-cli --jq 输出 JSON 编码字符串（'"master"'）；带引号当 ref 会 404 Commit Not Found。
    runCodeHubCliMock.mockResolvedValue('"master"\n')
    const view = await viewCodeHubProject({ remote })
    expect(view).toEqual({ kind: 'available', defaultBranch: 'master' })
  })

  it('treats empty or null --jq output as unknown default branch', async () => {
    runCodeHubCliMock.mockResolvedValue('')
    await expect(viewCodeHubProject({ remote })).resolves.toEqual({
      kind: 'available',
      defaultBranch: null
    })
    runCodeHubCliMock.mockResolvedValue('null')
    await expect(viewCodeHubProject({ remote })).resolves.toEqual({
      kind: 'available',
      defaultBranch: null
    })
  })

  it('falls back to bare project view when --jq is unavailable', async () => {
    runCodeHubCliMock
      .mockRejectedValueOnce(new Error('unknown flag: --jq'))
      .mockResolvedValueOnce('{}')
    const view = await viewCodeHubProject({ remote })
    expect(view).toEqual({ kind: 'available', defaultBranch: null })
  })

  it('keeps auth and network failures out of the no-repo result', async () => {
    runCodeHubCliMock
      .mockRejectedValueOnce(new Error('HTTP 403: Forbidden'))
      .mockRejectedValueOnce(new Error('HTTP 403: Forbidden'))
    await expect(viewCodeHubProject({ remote })).resolves.toEqual({
      kind: 'failed',
      error: 'HTTP 403: Forbidden'
    })
  })

  it('classifies an explicitly missing project as no-repo', async () => {
    runCodeHubCliMock
      .mockRejectedValueOnce(new Error('HTTP 404: Project Not Found'))
      .mockRejectedValueOnce(new Error('HTTP 404: Project Not Found'))
    await expect(viewCodeHubProject({ remote })).resolves.toEqual({
      kind: 'no-repo',
      error: 'HTTP 404: Project Not Found'
    })
  })
})

describe('fetchCodeHubRepoFileRaw', () => {
  beforeEach(() => {
    runCodeHubCliMock.mockReset()
  })

  it('reads a raw file with -H before the repo subcommand', async () => {
    runCodeHubCliMock.mockResolvedValue('name = "workbench"\n')
    const read = await fetchCodeHubRepoFileRaw({
      remote,
      filePath: '.bw/project.toml',
      ref: 'master'
    })
    expect(read).toEqual({ kind: 'content', content: 'name = "workbench"' })
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      [
        '-H',
        'codehub-g.huawei.com',
        'repo',
        'file',
        'raw',
        '-p',
        'Org/Group/repo',
        '--file-path',
        '.bw/project.toml',
        '--ref',
        'master',
        '--no-cache'
      ],
      undefined
    )
  })

  it('classifies commit-not-found as ref-missing, not absent', async () => {
    // ref 解析不到 commit（如带引号的 '"master"'）是「分支读不到」，不是「仓里没有名片」。
    runCodeHubCliMock.mockRejectedValue(new Error('error: HTTP 404: 404 Commit Not Found (50000)'))
    const read = await fetchCodeHubRepoFileRaw({
      remote,
      filePath: '.bw/project.toml',
      ref: '"master"'
    })
    expect(read).toEqual({ kind: 'ref-missing' })
  })
})
