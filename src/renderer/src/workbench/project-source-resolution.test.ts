import { expect, it } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import { projectHostSetupProjectionFromRepos } from '../../../shared/project-host-setup-projection'
import { resolveProjectSource } from './project-source-resolution'
import type { Worktree } from '../../../shared/worktree/types'
import {
  versionCatalogSources,
  versionCatalogSourceKey,
  versionCatalogWorktrees,
  versionCatalogFingerprint
} from './version-catalog-source'
import { mergeVersionCatalog } from '../../../shared/workbench/version-catalog'
import {
  retainUnavailableCatalogSources,
  type CatalogGoalSource
} from './version-catalog-retention'

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

  const sources = versionCatalogSources(repos, other.id, 'runtime:other')
  expect(sources).toEqual([other])
  expect(versionCatalogSources(repos, peer.id)).toEqual([peer, other])
  expect(versionCatalogSources(repos, peer.id, 'local')).toEqual([])
  expect(versionCatalogSourceKey([peer, other])).toBe(versionCatalogSourceKey([other, peer]))
  expect(versionCatalogSourceKey([other])).not.toBe(
    versionCatalogSourceKey([{ ...other, path: '/new' }])
  )

  const tree = (repoId: string, hostId?: Worktree['hostId']) =>
    ({
      id: 'same-tree-id',
      repoId,
      hostId,
      instanceId: 'instance-1',
      branch: 'refs/heads/bw/v1.0/plan',
      head: 'commit-1',
      isMainWorktree: true,
      workbenchVersionBinding: { schema: 1, version: 'v1.0', workflow: 'plan' }
    }) as Worktree
  const remote = tree(other.id, 'runtime:other')
  const hidden = { ...remote, id: 'hidden-plan', isMainWorktree: false }
  const candidates = { [other.id]: [remote, tree(other.id, 'runtime:peer')] }
  const detected = { [other.id]: { worktrees: [hidden] } }
  expect(versionCatalogWorktrees(repos, sources, candidates, detected)).toEqual([remote, hidden])
  const sameIdRepos = [other, { ...other, executionHostId: 'local' as const }]
  expect(
    versionCatalogWorktrees(sameIdRepos, [other], { [other.id]: [tree(other.id)] }, {})
  ).toEqual([])
  expect(
    versionCatalogWorktrees([other], [other], { [other.id]: [tree(other.id)] }, {})
  ).toHaveLength(1)
  const proxied = {
    ...remote,
    hostId: 'ssh:peer-server' as const,
    runtimeOwnerEnvironmentId: 'other'
  }
  expect(versionCatalogWorktrees(repos, sources, { [other.id]: [proxied] }, {})).toEqual([proxied])
  const secondProxy = { ...proxied, runtimeOwnerEnvironmentId: 'peer' }
  const proxyRepos = [other, { ...other, executionHostId: 'runtime:peer' as const }]
  expect(
    versionCatalogWorktrees(
      proxyRepos,
      proxyRepos,
      {
        [other.id]: [proxied, secondProxy]
      },
      {}
    )
  ).toEqual([proxied, secondProxy])

  const fingerprint = versionCatalogFingerprint([remote, hidden])
  expect(versionCatalogFingerprint([hidden, remote])).toBe(fingerprint)
  for (const change of [
    { head: 'commit-2' },
    { branch: 'refs/heads/bw/week-plan' },
    { instanceId: 'instance-2' },
    { runtimeOwnerEnvironmentId: 'peer' },
    { workbenchVersionBinding: null }
  ]) {
    expect(versionCatalogFingerprint([{ ...remote, ...change } as Worktree, hidden])).not.toBe(
      fingerprint
    )
  }
  expect(versionCatalogFingerprint([remote])).not.toBe(fingerprint)

  const drafts = ['v0.9', 'v1.0', 'v1.1'].map((version) => ({
    version,
    cycleId: version,
    revision: version
  }))
  const previousEntries = mergeVersionCatalog({ committed: { records: [], problems: [] }, drafts })
  const previousSources = Object.fromEntries(
    drafts.map((draft) => [draft.version, { kind: 'draft' as const, treeKey: 'legacy', draft }])
  )
  const retained = mergeVersionCatalog({
    committed: { records: [], problems: [] },
    drafts: [drafts[2]]
  })
  const goalSources: Record<string, CatalogGoalSource> = {}
  retainUnavailableCatalogSources({
    entries: retained,
    previousEntries,
    previousSources,
    goalSources,
    availableDraftVersions: new Set(['v1.1']),
    unavailableDrafts: new Map([['legacy', new Set(['v1.0'])]]),
    historyKey: 'history',
    retainHistory: false
  })
  expect(retained.map((entry) => entry.version).sort()).toEqual(['v1.0', 'v1.1'])
})
