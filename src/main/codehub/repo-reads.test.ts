import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runCodeHubCliMock } = vi.hoisted(() => ({
  runCodeHubCliMock: vi.fn()
}))

vi.mock('./cli', () => ({
  runCodeHubCli: runCodeHubCliMock
}))

import { fetchCodeHubRepoFileRaw, listCodeHubProjectLabels, viewCodeHubProject } from './repo-reads'

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
    expect(runCodeHubCliMock).toHaveBeenCalledTimes(1)
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

describe('listCodeHubProjectLabels', () => {
  beforeEach(() => {
    runCodeHubCliMock.mockReset()
  })

  it('lists label names and stops after a short page', async () => {
    // CLI 的 --limit 默认 10;必须显式给页大小并翻页,标签多的项目下拉才不缺项。
    runCodeHubCliMock.mockResolvedValue(
      JSON.stringify([
        { name: 'Bug', color: '#CC0033' },
        { name: '  weekly-2026w44  ' },
        { notName: true }
      ])
    )
    const names = await listCodeHubProjectLabels({ remote })
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      [
        'project',
        'label',
        'list',
        '-p',
        'Org/Group/repo',
        '-H',
        'codehub-g.huawei.com',
        '-f',
        'json',
        '--limit',
        '100',
        '--offset',
        '0'
      ],
      undefined
    )
    expect(runCodeHubCliMock).toHaveBeenCalledTimes(1)
    expect(names).toEqual(['Bug', 'weekly-2026w44'])
  })

  it('keeps paging with --offset until a page comes back short', async () => {
    runCodeHubCliMock
      .mockResolvedValueOnce(
        JSON.stringify(Array.from({ length: 100 }, (_, index) => ({ name: `label-${index}` })))
      )
      .mockResolvedValueOnce(JSON.stringify([{ name: 'tail' }]))
    const names = await listCodeHubProjectLabels({ remote })
    expect(runCodeHubCliMock).toHaveBeenCalledTimes(2)
    expect(runCodeHubCliMock).toHaveBeenLastCalledWith(
      [
        'project',
        'label',
        'list',
        '-p',
        'Org/Group/repo',
        '-H',
        'codehub-g.huawei.com',
        '-f',
        'json',
        '--limit',
        '100',
        '--offset',
        '100'
      ],
      undefined
    )
    expect(names).toHaveLength(101)
    expect(names).toContain('label-0')
    expect(names).toContain('label-99')
    expect(names).toContain('tail')
  })
})
