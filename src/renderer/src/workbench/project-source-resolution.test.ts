import { expect, it } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import { projectHostSetupProjectionFromRepos } from '../../../shared/project-host-setup-projection'
import { resolveProjectSource } from './project-source-resolution'

function repo(id: string, hostId: Repo['executionHostId'], owner = 'acme'): Repo {
  const canonicalKey = `github.com/${owner}/app`
  return {
    id,
    path: `/work/${id}`,
    displayName: 'app',
    badgeColor: '#000',
    addedAt: 1,
    executionHostId: hostId,
    upstream: { owner: 'acme', repo: 'app' },
    gitRemoteIdentity: {
      canonicalKey,
      remoteName: 'origin',
      remoteUrl: `https://${canonicalKey}.git`
    }
  }
}

it('uses the same checkout identity, then Orca host preference when no local copy exists', () => {
  const peer = repo('peer', 'runtime:peer')
  const other = repo('other', 'runtime:other')
  const fork = {
    ...repo('fork', 'local', 'contributor'),
    gitRemoteIdentity: {
      canonicalKey: 'github.com/acme/app',
      remoteName: 'upstream',
      remoteUrl: 'https://github.com/acme/app.git',
      originUrl: 'https://github.com/contributor/app.git'
    }
  }
  const local = repo('local', 'local')
  const repos = [peer, other, fork]
  const { projects, setups } = projectHostSetupProjectionFromRepos(repos)
  const state = {
    repos,
    projects: [...projects],
    projectHostSetups: [...setups],
    workspaceHostScope: 'runtime:other' as const,
    runtimeEnvironments: [{ id: 'peer' }, { id: 'other' }]
  }
  expect(resolveProjectSource(state, peer)).toBe(other)
  expect(resolveProjectSource(state, peer, true)).toBeNull()
  expect(resolveProjectSource({ ...state, repos: [...repos, local] }, peer)).toBe(local)
})
