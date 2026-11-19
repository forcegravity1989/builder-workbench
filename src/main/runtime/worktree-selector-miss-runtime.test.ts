import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetTracerForTests, setActiveSink, type TracerSink } from '../observability/tracer'
import { listWorktreesStrict } from '../git/worktree'
import { OrcaRuntimeService } from './orca-runtime'
import { makeStore } from './runtime-rpc-worktree-store-fixtures'

vi.mock('../git/worktree', () => ({
  listWorktrees: vi.fn().mockResolvedValue([]),
  listWorktreesStrict: vi.fn().mockResolvedValue([])
}))

type CapturedSink = TracerSink & { records: Record<string, unknown>[] }

let sink: CapturedSink

function missingWorktreePath(): string {
  return join(tmpdir(), `bw-selector-miss-${randomUUID()}`)
}

function missRecords(): Record<string, unknown>[] {
  return sink.records
    .filter((record) => record.name === 'runtime.worktree-selector-miss')
    .map((record) => (record as { attributes: Record<string, unknown> }).attributes)
}

function missAttributes(): Record<string, unknown> | null {
  return missRecords().at(-1) ?? null
}

function worktree(path: string, branch: string) {
  return { path, head: 'abc', branch, isBare: false, isMainWorktree: false }
}

beforeEach(() => {
  vi.mocked(listWorktreesStrict).mockResolvedValue([])
  sink = {
    records: [],
    push(record) {
      this.records.push(record as Record<string, unknown>)
    },
    flush() {
      /* no-op */
    },
    close() {
      /* no-op */
    }
  }
  setActiveSink(sink)
})

afterEach(() => {
  _resetTracerForTests()
})

describe('showManagedWorktree selector misses', () => {
  it('records the selector and repo facts when an explicit worktree id does not resolve', async () => {
    const runtime = new OrcaRuntimeService(makeStore() as never)
    const missingId = `repo-1::${missingWorktreePath()}`

    await expect(runtime.showManagedWorktree(`id:${missingId}`)).rejects.toThrow(
      'selector_not_found'
    )
    await expect(runtime.showManagedTerminalWorkspace(`id:${missingId}`)).rejects.toThrow(
      'selector_not_found'
    )

    const [fleet, terminal] = missRecords()
    expect([fleet['selector.stage'], terminal['selector.stage']]).toEqual([
      'fleet',
      'terminal-workspace'
    ])
    expect(terminal['selector.kind']).toBe('id')
    expect(terminal['selector.worktree_id']).toBe(missingId)
    expect(terminal['repo.known']).toBe(true)
    expect(terminal['repo.host']).toBe('local')
    expect(terminal['meta.present']).toBe(false)
    expect(terminal['path.exists_local']).toBe(false)
    expect(terminal['repo.meta_count']).toBe(1)
    // Why false: a cold runtime must not report a snapshot its own failed scan just created.
    expect(fleet['cache.fresh_at_request']).toBe(false)
  })

  it('reports a remote host when the repo row only carries executionHostId', async () => {
    const base = makeStore()
    const store = {
      ...base,
      getRepos: () => [
        { ...base.getRepos()[0], executionHostId: 'ssh:build-01' as const, connectionId: null }
      ]
    }
    const runtime = new OrcaRuntimeService(store as never)

    await expect(
      runtime.showManagedWorktree(`id:repo-1::${missingWorktreePath()}`)
    ).rejects.toThrow('selector_not_found')

    const attributes = missAttributes()!
    expect(attributes['repo.host']).toBe('remote')
    // Why null: a remote worktree's path says nothing about this process's filesystem.
    expect(attributes['path.exists_local']).toBeNull()
  })

  it('does not record a miss when the selector resolves, is ambiguous, or is rejected by contract', async () => {
    vi.mocked(listWorktreesStrict).mockResolvedValueOnce([
      worktree('/tmp/worktree-a', 'dup'),
      worktree('/tmp/worktree-b', 'dup')
    ])
    const runtime = new OrcaRuntimeService(makeStore() as never)

    await runtime.showManagedWorktree('id:repo-1::/tmp/worktree-a')
    await expect(runtime.showManagedWorktree('branch:dup')).rejects.toThrow('selector_ambiguous')
    await expect(runtime.showManagedWorktree('global-floating-terminal')).rejects.toThrow(
      'selector_not_found'
    )
    await expect(runtime.showManagedTerminalWorkspace('active')).rejects.toThrow(
      'selector_not_found'
    )

    expect(missAttributes()).toBeNull()
  })
})
