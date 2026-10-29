import { expect, it, vi, type Mock } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import type { RuntimeEnvironmentCallRequest } from '../../runtime/runtime-compatibility-test-fixture'
import { createTestStore } from './store-test-helpers'
import { setRuntimeEnvironmentConnectionGenerationForTests } from './runtime-status'

export function registerRuntimeCatalogRetiredConnectionTests(
  runtimeEnvironmentCall: Mock,
  remoteRepo: Repo
): void {
  it.each(['active', 'all'] as const)(
    'drops %s runtime catalog from a retired connection',
    async (mode) => {
      setRuntimeEnvironmentConnectionGenerationForTests('env-1', 10)
      let resolveRepoList!: (response: unknown) => void
      const repoListResponse = new Promise((resolve) => {
        resolveRepoList = resolve
      })
      const previousCall = runtimeEnvironmentCall.getMockImplementation()!
      runtimeEnvironmentCall.mockImplementation((args: RuntimeEnvironmentCallRequest) =>
        args.method === 'repo.list' ? repoListResponse : previousCall(args)
      )
      const store = createTestStore()
      store.setState({ settings: { activeRuntimeEnvironmentId: 'env-1' } as never })
      store
        .getState()
        .setRuntimeEnvironments([{ id: 'env-1', createdAt: 1, pairingRevision: 1 } as never])
      const snapshot = (sequence: number, verification: 'verified' | 'unavailable') =>
        ({
          environmentId: 'env-1',
          pairingRevision: 1,
          sequence,
          checkedAt: sequence,
          transport: 'ready',
          verification,
          status: { runtimeId: 'runtime-remote' }
        }) as never
      store.getState().applyRuntimeHostStatusSnapshot(snapshot(1, 'verified'))
      const load =
        mode === 'active' ? store.getState().fetchRepos() : store.getState().fetchReposForAllHosts()
      await vi.waitFor(() =>
        expect(
          runtimeEnvironmentCall.mock.calls.some(([args]) => args.method === 'repo.list')
        ).toBe(true)
      )
      store.getState().applyRuntimeHostStatusSnapshot(snapshot(2, 'unavailable'))
      store.getState().applyRuntimeHostStatusSnapshot(snapshot(3, 'verified'))
      resolveRepoList({
        id: 'rpc-repo-list',
        ok: true,
        result: { repos: [remoteRepo] },
        _meta: { runtimeId: 'runtime-remote' }
      })
      await load
      expect(store.getState().runtimeRepoCatalogIdsByHost['runtime:env-1']).toBeUndefined()
      expect(store.getState().repos.some((repo) => repo.id === remoteRepo.id)).toBe(false)
    }
  )
}
