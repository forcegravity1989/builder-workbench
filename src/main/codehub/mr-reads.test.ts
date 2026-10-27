import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runCodeHubCliMock } = vi.hoisted(() => ({
  runCodeHubCliMock: vi.fn()
}))

vi.mock('./cli', () => ({
  runCodeHubCli: runCodeHubCliMock
}))

import { readCodeHubMrChecks, readCodeHubMrChanges } from './mr-reads'

const remote = { host: 'codehub-g.huawei.com', project: 'Org/Group/repo' }

describe('codehub mr reads', () => {
  beforeEach(() => {
    runCodeHubCliMock.mockReset()
    runCodeHubCliMock.mockResolvedValue('[]')
  })

  it('reads gate checks through mr gate with a jq projection', async () => {
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
  })

  it('treats a null checks projection as an empty list', async () => {
    runCodeHubCliMock.mockResolvedValue('null')
    const checks = await readCodeHubMrChecks({ remote, execOptions: { cwd: '/repo' }, iid: 65 })
    expect(checks).toEqual([])
  })

  it('reads changed files through mr changes with a jq projection', async () => {
    runCodeHubCliMock.mockResolvedValue(
      JSON.stringify([
        { file_path: 'a.txt', new_path: 'a.txt', added_lines: 1, diff: '@@ -0,0 +1 @@\n+a\n' }
      ])
    )
    const files = await readCodeHubMrChanges({ remote, execOptions: { cwd: '/repo' }, iid: 47 })
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      [
        'mr',
        'changes',
        '47',
        '-p',
        'Org/Group/repo',
        '-H',
        'codehub-g.huawei.com',
        '-f',
        'json',
        '--jq',
        '.changes'
      ],
      { cwd: '/repo' }
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
})
