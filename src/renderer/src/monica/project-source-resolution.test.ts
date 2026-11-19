import { expect, it } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import { projectHostSetupProjectionFromRepos } from '../../../shared/project-host-setup-projection'
import { resolveProjectSource } from './project-source-resolution'
import type { Worktree } from '../../../shared/worktree/types'
import {
  versionCatalogSources,
  versionCatalogSourceKey,
  versionCatalogSshTargetId,
  versionCatalogWorktrees,
  versionCatalogFingerprint
} from './version-catalog-source'
import {
  collectVersionCatalogWorkspaces,
  mergeVersionCatalog
} from '../../../shared/monica/version-catalog'
import { mergeProjectVersions, type CatalogSource } from './project-version-catalog-merge'
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

it('orders drafts across same-repo workspaces without replacing an unavailable material source', () => {
  const source = (registration: Repo, versions: [string, number][]): CatalogSource => {
    const worktrees = versions.map(
      ([version, createdAt]) =>
        ({
          id: version,
          repoId: registration.id,
          hostId: registration.executionHostId,
          createdAt,
          workbenchVersionBinding: { schema: 1, version, workflow: 'plan' }
        }) as Worktree
    )
    const entries = mergeVersionCatalog({
      committed: { records: [], problems: [] },
      goalsByVersion: new Map(
        versions.map(([version]) => [version, [{ goalId: 'g1', title: registration.id }]])
      ),
      drafts: versions.map(([version]) => ({
        version,
        cycleId: registration.id,
        revision: registration.id
      })),
      workspaces: collectVersionCatalogWorkspaces(worktrees, [registration.id])
    })
    return {
      repo: registration,
      state: {
        scope: null,
        home: null,
        worktrees,
        repoIds: [registration.id],
        planTrees: [],
        catalog: { entries, problems: [] },
        loading: false,
        error: null,
        materialReady: true,
        materialError: null,
        planOrderPending: false,
        reload: () => {}
      }
    }
  }
  const local = source(repo('local', 'local'), [['v1.0', 30]])
  const peer = source(repo('peer', 'runtime:peer'), [
    ['v1.0', 10],
    ['v1.1', 20]
  ])
  const selectSource = (candidates: Repo[]) => candidates[0]
  const [peerOnly, shared] = mergeProjectVersions([local, peer], local, undefined, selectSource)
  expect([peerOnly.entry.version, shared.entry.version]).toEqual(['v1.1', 'v1.0'])
  expect(shared.entry.workspaces.map((tree) => tree.hostId)).toEqual(['local', 'runtime:peer'])
  expect(shared.entry.goals.map((goal) => goal.title)).toEqual(['local'])
  expect(shared.goalWorktrees).toEqual(local.state.worktrees)
  expect(peerOnly.source).toBe(peer)

  const unavailable = { ...local, state: { ...local.state, materialReady: false } }
  const preferredPeer = { version: 'v1.1', repoId: 'peer', hostId: 'runtime:peer' as const }
  const peerVersion = (preference?: Parameters<typeof mergeProjectVersions>[2]) =>
    mergeProjectVersions([unavailable, peer], unavailable, preference, selectSource).find(
      (row) => row.entry.version === 'v1.1'
    )
  expect(peerVersion()).toMatchObject({ source: null, entry: { state: 'working', goals: [] } })
  expect(peerVersion(preferredPeer)?.source).toBe(peer)
  expect(peerVersion({ ...preferredPeer, repoId: 'removed' })?.source).toBeNull()

  peer.state.catalog!.entries[0].planEnteredAt = 25
  const adopted = mergeProjectVersions([local, peer], local, undefined, selectSource).find(
    (row) => row.entry.version === 'v1.0'
  )!
  expect(adopted.entry).toMatchObject({ version: 'v1.0', planEnteredAt: 25 })
  expect(adopted.source).toBe(local)

  {
    const mergedRepo = repo('merged', 'local')
    const unmergedRepo = repo('unmerged', 'runtime:peer')
    const mergedEntry = mergeVersionCatalog({
      committed: {
        records: [
          {
            version: 'v1.0',
            cycleId: 'merged-cycle',
            sourceCommit: 'a'.repeat(40),
            revision: 'merged-revision',
            workflow: 'plan',
            committedAt: '2026-11-18T12:00:00Z'
          }
        ],
        problems: []
      },
      drafts: [{ version: 'v1.0', cycleId: 'merged-cycle', revision: 'draft-revision' }],
      workspaces: collectVersionCatalogWorkspaces(
        [
          {
            id: 'merged-plan',
            repoId: mergedRepo.id,
            hostId: mergedRepo.executionHostId,
            createdAt: 1,
            workbenchVersionBinding: { schema: 1, version: 'v1.0', workflow: 'plan' }
          } as Worktree
        ],
        [mergedRepo.id]
      )
    })[0]
    const unmergedEntry = mergeVersionCatalog({
      committed: { records: [], problems: [] },
      workspaces: collectVersionCatalogWorkspaces(
        [
          {
            id: 'unmerged-plan',
            repoId: unmergedRepo.id,
            hostId: unmergedRepo.executionHostId,
            createdAt: 999,
            workbenchVersionBinding: { schema: 1, version: 'v1.1', workflow: 'plan' }
          } as Worktree
        ],
        [unmergedRepo.id]
      )
    })[0]
    const source = (registration: Repo, entry: typeof mergedEntry): CatalogSource => ({
      repo: registration,
      state: {
        scope: null,
        home: null,
        worktrees: [],
        repoIds: [registration.id],
        planTrees: [],
        catalog: { entries: [entry], problems: [] },
        loading: false,
        error: null,
        materialReady: true,
        materialError: null,
        planOrderPending: false,
        reload: () => {}
      }
    })
    const ordered = mergeProjectVersions(
      [source(mergedRepo, mergedEntry), source(unmergedRepo, unmergedEntry)],
      null,
      undefined,
      (candidates) => candidates[0]
    )
    expect(ordered.map(({ entry }) => entry.version)).toEqual(['v1.1', 'v1.0'])
    expect(ordered[1].entry).toMatchObject({
      mergeStatus: 'merged',
      draft: { revision: 'draft-revision' }
    })

    const unreadableRepo = repo('unreadable', 'runtime:other')
    const unreadableEntry = {
      ...unmergedEntry,
      version: 'v1.2',
      mergeStatus: 'unknown' as const,
      problems: [{ workflow: 'plan' as const, code: 'history-unavailable', message: 'unreadable' }]
    }
    const withUnreadable = mergeProjectVersions(
      [source(unmergedRepo, unmergedEntry), source(unreadableRepo, unreadableEntry)],
      null,
      undefined,
      (candidates) => candidates[0]
    )
    expect(withUnreadable.find(({ entry }) => entry.version === 'v1.2')?.entry.mergeStatus).toBe(
      'unknown'
    )
  }
})

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

  const pairedSsh: Repo = {
    ...peer,
    pairedRegistration: { hostId: 'ssh:nested%20builder' }
  }
  expect(versionCatalogSshTargetId(pairedSsh)).toBe('nested builder')
  expect(versionCatalogSshTargetId({ ...pairedSsh, connectionId: 'stale-legacy' })).toBe(
    'nested builder'
  )
  expect(versionCatalogSshTargetId({ ...peer, connectionId: ' legacy-builder ' })).toBe(
    'legacy-builder'
  )
  expect(versionCatalogSshTargetId(peer)).toBeNull()
  expect(
    versionCatalogSshTargetId({
      ...pairedSsh,
      pairedRegistration: { hostId: 'local' },
      connectionId: 'stale-legacy'
    })
  ).toBeNull()
  expect(versionCatalogSshTargetId({ ...pairedSsh, executionHostId: 'ssh:direct%20builder' })).toBe(
    'direct builder'
  )

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
  const previousEntries = mergeVersionCatalog({
    committed: {
      records: [],
      problems: [
        {
          version: 'v1.1',
          workflow: 'plan',
          sourceCommit: 'a'.repeat(40),
          committedAt: '2026-11-17T10:00:00Z',
          code: 'history-unavailable',
          message: 'Cannot read the adopted plan'
        }
      ]
    },
    drafts
  })
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
    retainHistory: true
  })
  expect(retained.map((entry) => entry.version).sort()).toEqual(['v1.0', 'v1.1'])
  expect(retained.find((entry) => entry.version === 'v1.1')?.planEnteredAt).toBeNull()
})
