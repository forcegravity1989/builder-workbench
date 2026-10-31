import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runCodeHubCliMock } = vi.hoisted(() => ({
  runCodeHubCliMock: vi.fn()
}))

vi.mock('./cli', () => ({
  runCodeHubCli: runCodeHubCliMock
}))

import { readCodeHubMrChecks, readCodeHubMrChanges } from './mr-reads'
import { readCodeHubBranchReview } from './mr-branch-review'
import { openCodeHubMrForBranch } from './mr-creation'

const remote = { host: 'codehub-g.huawei.com', project: 'Org/Group/repo' }
const headOid = 'f'.repeat(40)
const branchArgs = {
  remote,
  execOptions: { cwd: 'C:\\repo', wslDistro: 'Ubuntu' },
  sourceBranch: 'bw/project',
  targetBranch: 'master',
  currentHeadOid: headOid
}
function mr(iid: number, state = 'merged') {
  const project = {
    http_url_to_repo: `https://git.example.test/${remote.project}.git`,
    web_url: `https://${remote.host}/${remote.project}`
  }
  return {
    iid,
    state,
    source_branch: branchArgs.sourceBranch,
    target_branch: branchArgs.targetBranch,
    source_project: project,
    target_project: project,
    web_url: `https://${remote.host}/${remote.project}/merge_requests/${iid}`
  }
}
const commits = Array.from({ length: 100 }, (_, index) => ({
  id: (index + 1).toString(16).padStart(40, '0')
}))

describe('codehub mr reads', () => {
  beforeEach(() => {
    runCodeHubCliMock.mockReset()
    runCodeHubCliMock.mockResolvedValue('[]')
  })

  it('reads gate checks and changed files through native jq projections', async () => {
    runCodeHubCliMock.mockResolvedValue(
      JSON.stringify([
        { name: 'default/Data-Security-Check', state: 'success', link: 'https://check/1' }
      ])
    )
    const checks = await readCodeHubMrChecks({ remote, execOptions: { cwd: '/repo' }, iid: 47 })
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      [
        'mr',
        'gate',
        '47',
        '-p',
        'Org/Group/repo',
        '-H',
        'codehub-g.huawei.com',
        '-f',
        'json',
        '--jq',
        '.checks'
      ],
      { cwd: '/repo' }
    )
    expect(checks).toEqual([
      {
        name: 'default/Data-Security-Check',
        status: 'completed',
        conclusion: 'success',
        url: 'https://check/1'
      }
    ])
    runCodeHubCliMock.mockResolvedValue('null')
    expect(await readCodeHubMrChecks({ remote, iid: 65 })).toEqual([])
    runCodeHubCliMock.mockResolvedValue(
      JSON.stringify([
        { file_path: 'a.txt', new_path: 'a.txt', added_lines: 1, diff: '@@ -0,0 +1 @@\n+a\n' }
      ])
    )
    const files = await readCodeHubMrChanges({ remote, execOptions: { cwd: 'C:\\repo' }, iid: 47 })
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      [
        'mr',
        'changes',
        '47',
        '-p',
        remote.project,
        '-H',
        remote.host,
        '-f',
        'json',
        '--jq',
        '.changes'
      ],
      { cwd: 'C:\\repo' }
    )
    expect(files).toEqual([
      {
        path: 'a.txt',
        oldPath: undefined,
        status: 'modified',
        additions: 1,
        deletions: 0,
        isBinary: false,
        patch: '@@ -0,0 +1 @@\n+a\n'
      }
    ])
  })

  it('reads paginated same-repository branch reviews and proves merged commit membership', async () => {
    const excluded = Array.from({ length: 100 }, (_, index) => ({
      ...mr(index + 1),
      source_branch: 'other'
    }))
    excluded[0] = { ...mr(1), target_branch: 'other' }
    excluded[1] = {
      ...mr(2),
      source_project: {
        ...mr(2).source_project,
        web_url: `https://${remote.host}/Other/fork`
      }
    }
    excluded[2] = {
      ...mr(3),
      source_project: {
        http_url_to_repo: `https://${remote.host}/Other/fork.git`,
        web_url: `https://${remote.host}/Other/fork`
      }
    }
    runCodeHubCliMock.mockImplementation(async (args: string[]) => {
      const offset = args[args.indexOf('--offset') + 1]
      if (args[1] === 'list') {
        if (args[args.indexOf('--state') + 1] === 'opened') {
          return 'null'
        }
        return JSON.stringify(
          offset === '0'
            ? excluded
            : [
                {
                  ...mr(137),
                  source_project: { ...mr(137).source_project, web_url: null },
                  target_project: { ...mr(137).target_project, web_url: null }
                }
              ]
        )
      }
      if (args[1] === 'view') {
        return JSON.stringify({ ...mr(137), sha: 'a'.repeat(40) })
      }
      if (args[1] === 'commits') {
        return JSON.stringify(offset === '0' ? commits : [{ id: headOid }])
      }
      throw new Error('unexpected command')
    })
    expect(await readCodeHubBranchReview(branchArgs)).toEqual({
      number: 137,
      state: 'merged',
      url: mr(137).web_url,
      confirmedContainedHeadOid: headOid
    })
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      [
        'mr',
        'list',
        '-p',
        remote.project,
        '-H',
        remote.host,
        '-f',
        'json',
        '--source-branch',
        'bw/project',
        '--target-branch',
        'master',
        '--state',
        'merged',
        '--limit',
        '100',
        '--offset',
        '100'
      ],
      branchArgs.execOptions
    )
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      [
        'mr',
        'commits',
        '137',
        '-p',
        remote.project,
        '-H',
        remote.host,
        '-f',
        'json',
        '--limit',
        '100',
        '--offset',
        '100'
      ],
      branchArgs.execOptions
    )
    runCodeHubCliMock.mockReset()
    runCodeHubCliMock
      .mockResolvedValueOnce(JSON.stringify([mr(7, 'opened')]))
      .mockResolvedValueOnce(JSON.stringify(mr(7, 'opened')))
    expect(await openCodeHubMrForBranch(branchArgs)).toBe(7)
    expect(runCodeHubCliMock.mock.calls.every(([args]) => args[1] !== 'commits')).toBe(true)
  })

  it('excludes reused-branch commits and propagates unverifiable provider responses', async () => {
    runCodeHubCliMock.mockImplementation(async (args: string[]) => {
      if (args[1] === 'list') {
        return JSON.stringify(args.includes('merged') ? [mr(7), mr(8)] : [])
      }
      if (args[1] === 'view') {
        return JSON.stringify({ ...mr(Number(args[2])), sha: headOid })
      }
      if (args[1] === 'commits') {
        return JSON.stringify([{ id: commits[0].id }])
      }
      throw new Error('unexpected command')
    })
    expect(await readCodeHubBranchReview(branchArgs)).toBeNull()

    for (const firstPage of ['null', JSON.stringify(commits)]) {
      runCodeHubCliMock.mockReset()
      runCodeHubCliMock
        .mockResolvedValueOnce(JSON.stringify([mr(7)]))
        .mockResolvedValueOnce(JSON.stringify(mr(7)))
        .mockResolvedValueOnce(firstPage)
        .mockResolvedValueOnce('null')
      expect(await readCodeHubBranchReview({ ...branchArgs, states: ['merged'] })).toBeNull()
    }
    for (const invalid of [
      '',
      '{}',
      JSON.stringify(Array.from({ length: 101 }, (_, n) => mr(n + 1)))
    ]) {
      runCodeHubCliMock.mockReset()
      runCodeHubCliMock.mockResolvedValueOnce(invalid)
      await expect(readCodeHubBranchReview(branchArgs)).rejects.toThrow('列表')
    }

    for (const row of [
      { ...mr(7), web_url: null },
      { ...mr(7), web_url: '' },
      { ...mr(7), web_url: 7 },
      { ...mr(7), web_url: `https://${remote.host}/Other/repo/-/merge_requests/7` },
      { ...mr(7), source_project: null },
      { ...mr(7), source_project: { http_url_to_repo: mr(7).source_project.http_url_to_repo } }
    ]) {
      runCodeHubCliMock.mockReset()
      runCodeHubCliMock.mockResolvedValueOnce('[]').mockResolvedValueOnce(JSON.stringify([row]))
      await expect(readCodeHubBranchReview(branchArgs)).rejects.toThrow()
    }
    for (const detail of [
      { ...mr(7), web_url: null },
      { ...mr(7), source_project: null },
      { ...mr(7), state: 'unknown' },
      { ...mr(7), iid: 8 },
      { ...mr(7), target_branch: 'other' }
    ]) {
      runCodeHubCliMock.mockReset()
      runCodeHubCliMock
        .mockResolvedValueOnce('[]')
        .mockResolvedValueOnce(JSON.stringify([mr(7)]))
        .mockResolvedValueOnce(JSON.stringify(detail))
      await expect(readCodeHubBranchReview(branchArgs)).rejects.toThrow()
    }
    for (const invalid of ['', '{}', JSON.stringify([{ short_id: headOid.slice(0, 8) }])]) {
      runCodeHubCliMock.mockReset()
      runCodeHubCliMock
        .mockResolvedValueOnce('[]')
        .mockResolvedValueOnce(JSON.stringify([mr(7)]))
        .mockResolvedValueOnce(JSON.stringify(mr(7)))
        .mockResolvedValueOnce(invalid)
      await expect(readCodeHubBranchReview(branchArgs)).rejects.toThrow('提交列表')
    }
    runCodeHubCliMock.mockReset()
    runCodeHubCliMock
      .mockResolvedValueOnce('[]')
      .mockResolvedValueOnce(JSON.stringify([mr(7)]))
      .mockResolvedValueOnce(JSON.stringify(mr(7)))
      .mockResolvedValueOnce(JSON.stringify(commits))
      .mockResolvedValueOnce(JSON.stringify(commits))
    await expect(readCodeHubBranchReview(branchArgs)).rejects.toThrow('分页不可核对')

    runCodeHubCliMock.mockReset()
    runCodeHubCliMock
      .mockResolvedValueOnce('[]')
      .mockResolvedValueOnce(JSON.stringify([mr(7)]))
      .mockResolvedValueOnce(JSON.stringify(mr(7)))
      .mockRejectedValueOnce(new Error('read failed'))
    await expect(readCodeHubBranchReview(branchArgs)).rejects.toThrow('read failed')
  })
})
