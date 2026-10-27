import { beforeEach, expect, it, vi } from 'vitest'

const { exec, resolveExecution, resolveSource } = vi.hoisted(() => ({
  exec: vi.fn(),
  resolveExecution: vi.fn(),
  resolveSource: vi.fn()
}))
vi.mock('../../gh-utils', () => ({ ghExecFileAsync: exec, acquire: vi.fn(), release: vi.fn() }))
vi.mock('../../github-api-repository', () => ({
  resolveGitHubRepoExecution: resolveExecution,
  resolveIssueGitHubApiRepositorySource: resolveSource
}))
import { getAuthenticatedViewer, getRepoAuthenticatedViewer } from './authenticated-viewer'

beforeEach(() => {
  vi.clearAllMocks()
  exec.mockResolvedValue({ stdout: JSON.stringify({ login: 'repo-user', email: null }) })
  resolveSource.mockResolvedValue({
    source: { owner: 'team', repo: 'project', host: 'ghe.example' }
  })
  resolveExecution.mockImplementation(async (_path, source) => ({
    ownerRepo: await source(),
    ghOptions: { cwd: '/registered/repo', wslDistro: 'Ubuntu', env: { GH_HOST: 'ghe.example' } }
  }))
})

it('uses repo-selected host and execution options without changing the default viewer', async () => {
  expect(
    await getRepoAuthenticatedViewer('/registered/repo', 'origin', null, { wslDistro: 'Ubuntu' })
  ).toEqual({ login: 'repo-user', email: null })
  expect(resolveSource).toHaveBeenCalledWith('/registered/repo', 'origin', null, {
    wslDistro: 'Ubuntu'
  })
  expect(exec).toHaveBeenLastCalledWith(['api', 'user', '--jq', '{login: .login, email: .email}'], {
    cwd: '/registered/repo',
    wslDistro: 'Ubuntu',
    env: { GH_HOST: 'ghe.example' },
    encoding: 'utf-8'
  })
  await getAuthenticatedViewer()
  expect(exec).toHaveBeenLastCalledWith(expect.any(Array), { encoding: 'utf-8' })
  resolveExecution.mockResolvedValue({ ownerRepo: null, ghOptions: {} })
  exec.mockClear()
  expect(await getRepoAuthenticatedViewer('/registered/repo')).toBeNull()
  expect(exec).not.toHaveBeenCalled()
  resolveExecution.mockResolvedValue({
    ownerRepo: { owner: 'team', repo: 'project' },
    ghOptions: {}
  })
  exec.mockRejectedValue(new Error('not authenticated'))
  expect(await getRepoAuthenticatedViewer('/registered/repo')).toBeNull()
})
