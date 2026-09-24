import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/repo-types'

const { run } = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('./cli', () => ({ runCodeHubCli: run }))
import { createCodeHubService } from './service'

const repo = {
  id: 'repo-1',
  path: '/srv/project',
  gitRemoteIdentity: {
    remoteName: 'upstream',
    remoteUrl: 'https://codehub-g.huawei.com/team/project.git',
    canonicalKey: 'codehub-g.huawei.com/team/project'
  }
} as Repo
const args = { repoId: repo.id, repoPath: repo.path }
const options = vi.fn(() => ({ wslDistro: 'Ubuntu' }))
const service = (entry = repo) =>
  createCodeHubService({
    resolveRepo: async () => entry,
    localGitOptions: options
  })
beforeEach(() => {
  run.mockReset()
  options.mockClear()
  run.mockResolvedValue('[]')
})

describe('CodeHub native repository routing', () => {
  it('uses the registered CodeHub identity without treating an SSH path as local cwd', async () => {
    await service({ ...repo, connectionId: 'ssh-server' }).setIssueState({
      ...args,
      iid: 12,
      state: 'closed',
      stateReason: 'completed'
    })
    expect(options).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledTimes(2)
    for (const [command, execution] of run.mock.calls) {
      expect(command).toEqual(
        expect.arrayContaining(['-p', 'team/project', '-H', 'codehub-g.huawei.com'])
      )
      expect(execution).toEqual({})
    }
  })

  it('preserves the native WSL execution choice for reads and writes', async () => {
    await service().viewTask({ ...args, kind: 'issue', iid: 1 })
    await service().setIssueState({ ...args, iid: 1, state: 'open' })
    for (const [, execution] of run.mock.calls) {
      expect(execution).toEqual({ cwd: repo.path, wslDistro: 'Ubuntu' })
    }
  })

  it('rejects a mismatched path or another provider before any CLI operation', async () => {
    await expect(service().closeMr({ ...args, repoPath: '/other', iid: 1 })).rejects.toThrow('path')
    await expect(
      service({
        ...repo,
        gitRemoteIdentity: {
          remoteName: 'upstream',
          remoteUrl: 'https://github.com/team/project.git',
          canonicalKey: 'github.com/team/project'
        }
      }).closeMr({ ...args, iid: 1 })
    ).rejects.toThrow('not CodeHub')
    expect(run).not.toHaveBeenCalled()
  })

  it('reports truncation and can retrieve an issue beyond the first 30', async () => {
    run.mockImplementation(async (command: string[]) => {
      const limit = Number(command[command.indexOf('--limit') + 1])
      return JSON.stringify(
        Array.from({ length: Math.min(limit, 35) }, (_, i) => ({
          iid: i + 1,
          title: `Issue ${i + 1}`
        }))
      )
    })
    const first = await service().listTasks({ ...args, kind: 'issue', state: 'opened', limit: 30 })
    expect(first.items).toHaveLength(30)
    expect(first.hasMore).toBe(true)
    const next = await service().listTasks({ ...args, kind: 'issue', state: 'opened', limit: 60 })
    expect(next.items.at(-1)?.iid).toBe(35)
    expect(next.hasMore).toBe(false)
  })
})
