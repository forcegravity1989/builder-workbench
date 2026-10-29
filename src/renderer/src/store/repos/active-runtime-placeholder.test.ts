import { describe, expect, it, vi } from 'vitest'
import type { AppState } from '../types'
import { reconcileMissingActiveRuntimeSession } from './active-runtime-placeholder'
import { visibleRuntimeSessionRepos } from './runtime-session-placeholder-visibility'

describe('active restored runtime session reconciliation', () => {
  it('filters only host-confirmed missing placeholders from shared repo projection', () => {
    const repos = [
      { id: 'ghost', executionHostId: 'runtime:one', runtimeSessionPlaceholder: true },
      { id: 'real', executionHostId: 'runtime:one' },
      { id: 'offline', executionHostId: 'runtime:two', runtimeSessionPlaceholder: true }
    ] as never
    const visible = visibleRuntimeSessionRepos(
      repos,
      { 'runtime:one': [], 'runtime:two': [] },
      new Map([
        ['one', { status: { runtimeId: 'one' } as never, checkedAt: 1 }],
        ['two', { status: null, checkedAt: 1 }]
      ])
    )
    expect(visible.map((repo) => repo.id)).toEqual(['real', 'offline'])
  })
  it.each(['catalog-first', 'hydration-first'] as const)(
    'routes missing placeholder to wall: %s',
    (order) => {
      const setActiveWorktree = vi.fn()
      const setActiveRepo = vi.fn()
      const openWall = vi.fn()
      const state = {
        activeWorktreeId: null,
        activeWorkspaceExecutionHostId: null,
        restoredRuntimeHostIdByWorkspaceSessionKey: {},
        worktreesByRepo: {},
        runtimeRepoCatalogIdsByHost: {},
        runtimeStatusByEnvironmentId: new Map([['one', { status: { runtimeId: 'one' } }]]),
        tabsByWorktree: { 'repo::/path': [{ id: 'saved' }] },
        setActiveWorktree,
        setActiveRepo
      } as unknown as AppState
      const catalog = () => {
        state.runtimeRepoCatalogIdsByHost = { 'runtime:one': [] }
      }
      const hydrate = () => {
        state.activeWorktreeId = 'repo::/path'
        state.activeWorkspaceExecutionHostId = 'runtime:one'
        state.worktreesByRepo = {
          repo: [
            {
              id: 'repo::/path',
              repoId: 'repo',
              hostId: 'runtime:one',
              runtimeSessionPlaceholder: true
            } as never
          ]
        }
      }
      const [first, second] = order === 'catalog-first' ? [catalog, hydrate] : [hydrate, catalog]
      first()
      reconcileMissingActiveRuntimeSession(state, openWall)
      expect(openWall).not.toHaveBeenCalled()
      second()
      reconcileMissingActiveRuntimeSession(state, openWall)
      expect(setActiveWorktree).toHaveBeenCalledWith(null)
      expect(setActiveRepo).toHaveBeenCalledWith(null)
      expect(openWall).toHaveBeenCalledOnce()
      expect(state.tabsByWorktree['repo::/path']).toEqual([{ id: 'saved' }])
    }
  )

  it('preserves real, offline, catalog-unknown and other-host sessions', () => {
    const worktree = {
      id: 'repo::/path',
      repoId: 'repo',
      hostId: 'runtime:one',
      runtimeSessionPlaceholder: true
    }
    const state = {
      activeWorktreeId: worktree.id,
      activeWorkspaceExecutionHostId: 'runtime:one',
      restoredRuntimeHostIdByWorkspaceSessionKey: {},
      worktreesByRepo: { repo: [worktree] },
      runtimeRepoCatalogIdsByHost: { 'runtime:one': [] },
      runtimeStatusByEnvironmentId: new Map([['one', { status: null }]]),
      setActiveWorktree: vi.fn(),
      setActiveRepo: vi.fn()
    } as unknown as AppState
    const openWall = vi.fn()
    reconcileMissingActiveRuntimeSession(state, openWall)
    state.runtimeStatusByEnvironmentId.set('one', {
      status: { runtimeId: 'one' } as never,
      checkedAt: 1
    })
    state.runtimeRepoCatalogIdsByHost = {}
    reconcileMissingActiveRuntimeSession(state, openWall)
    state.runtimeRepoCatalogIdsByHost = { 'runtime:one': [] }
    state.activeWorkspaceExecutionHostId = 'runtime:other'
    reconcileMissingActiveRuntimeSession(state, openWall)
    state.activeWorkspaceExecutionHostId = 'runtime:one'
    delete (worktree as { runtimeSessionPlaceholder?: boolean }).runtimeSessionPlaceholder
    reconcileMissingActiveRuntimeSession(state, openWall)
    expect(openWall).not.toHaveBeenCalled()
    expect(state.setActiveWorktree).not.toHaveBeenCalled()
  })

  it('clears a missing active repo without clearing a different real worktree', () => {
    const state = {
      activeRepoId: 'repo',
      activeWorktreeId: 'real::/path',
      activeWorkspaceExecutionHostId: 'local',
      restoredRuntimeHostIdByWorkspaceSessionKey: {},
      repos: [{ id: 'repo', executionHostId: 'runtime:one', runtimeSessionPlaceholder: true }],
      worktreesByRepo: {
        repo: [
          {
            id: 'repo::/path',
            repoId: 'repo',
            hostId: 'runtime:one',
            runtimeSessionPlaceholder: true
          }
        ]
      },
      runtimeRepoCatalogIdsByHost: { 'runtime:one': [] },
      runtimeStatusByEnvironmentId: new Map([['one', { status: { runtimeId: 'one' } }]]),
      setActiveWorktree: vi.fn(),
      setActiveRepo: vi.fn()
    } as unknown as AppState
    const openWall = vi.fn()
    reconcileMissingActiveRuntimeSession(state, openWall)
    expect(state.setActiveWorktree).not.toHaveBeenCalled()
    expect(state.setActiveRepo).toHaveBeenCalledWith(null)
    expect(openWall).toHaveBeenCalledOnce()
  })

  it('routes to wall when a catalog removes the selected synthetic repo before notification', () => {
    const current = {
      activeRepoId: null,
      activeWorktreeId: null,
      activeWorkspaceExecutionHostId: null,
      restoredRuntimeHostIdByWorkspaceSessionKey: {},
      repos: [],
      worktreesByRepo: {},
      runtimeRepoCatalogIdsByHost: { 'runtime:one': [] },
      runtimeStatusByEnvironmentId: new Map([['one', { status: { runtimeId: 'one' } }]]),
      setActiveWorktree: vi.fn(),
      setActiveRepo: vi.fn()
    } as unknown as AppState
    const previous = {
      ...current,
      activeRepoId: 'repo',
      runtimeRepoCatalogIdsByHost: {},
      repos: [{ id: 'repo', executionHostId: 'runtime:one', runtimeSessionPlaceholder: true }]
    } as unknown as AppState
    const openWall = vi.fn()
    reconcileMissingActiveRuntimeSession(current, openWall, previous)
    expect(current.setActiveWorktree).not.toHaveBeenCalled()
    expect(openWall).toHaveBeenCalledOnce()
  })
})
