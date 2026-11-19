import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetTracerForTests, setActiveSink, type TracerSink } from '../observability/tracer'
import {
  isNonMissSelector,
  isSelectorNotFound,
  recordWorktreeSelectorMiss,
  worktreeIdFromSelector,
  worktreeSelectorKind
} from './worktree-selector-miss'

type CapturedSink = TracerSink & { records: Record<string, unknown>[] }

let sink: CapturedSink

beforeEach(() => {
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

describe('selector classification', () => {
  it('derives a worktree id only from selectors that name one', () => {
    expect(worktreeSelectorKind('id:repo-1::/wt')).toBe('id')
    expect(worktreeSelectorKind('branch:main')).toBe('branch')
    expect(worktreeSelectorKind('active')).toBe('bare')
    expect(worktreeIdFromSelector('id:repo-1::/wt')).toBe('repo-1::/wt')
    expect(worktreeIdFromSelector('worktree:repo-1::/wt')).toBe('repo-1::/wt')
    // Why: the terminal target accepts both spellings; the prefix must go before the key is read.
    expect(worktreeIdFromSelector('id:worktree:repo-1::/wt')).toBe('repo-1::/wt')
    // Why null: splitting these would fabricate a repo id and report a known repo as unknown.
    expect(worktreeIdFromSelector('branch:feature::x')).toBeNull()
    expect(worktreeIdFromSelector('folder:0b5c1f3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b')).toBeNull()
    expect(worktreeIdFromSelector('active')).toBeNull()
    expect(isSelectorNotFound(new Error('selector_not_found'))).toBe(true)
    expect(isSelectorNotFound(new Error('selector_ambiguous'))).toBe(false)
    expect(isNonMissSelector('active')).toBe(true)
    expect(isNonMissSelector('global-floating-terminal')).toBe(true)
    expect(isNonMissSelector('id:repo-1::/wt')).toBe(false)
  })
})

describe('recordWorktreeSelectorMiss', () => {
  it('records a Failure span and keeps unknown facts distinguishable from absent ones', () => {
    recordWorktreeSelectorMiss(
      {
        stage: 'resolver',
        caller: 'showManagedWorktree',
        selector: 'id:repo-1::/wt/acceptance-v0.8',
        requiredHostId: null,
        worktreeId: 'repo-1::/wt/acceptance-v0.8',
        repoKnown: true,
        repoHost: 'local',
        metaPresent: true,
        pathExistsLocal: false,
        cacheFreshAtRequest: true,
        resolvedWorktreeCount: 27,
        repoResolvedWorktreeCount: 23,
        repoMetaCount: 32
      },
      new Error('selector_not_found')
    )
    recordWorktreeSelectorMiss(
      {
        stage: 'host-scoped',
        caller: null,
        selector: 'id:repo-1::/wt',
        requiredHostId: 'ssh:build-01',
        worktreeId: 'repo-1::/wt',
        repoKnown: false,
        repoHost: null,
        metaPresent: null,
        pathExistsLocal: null,
        cacheFreshAtRequest: false,
        resolvedWorktreeCount: null,
        repoResolvedWorktreeCount: null,
        repoMetaCount: null
      },
      new Error('selector_not_found')
    )

    expect(sink.records).toHaveLength(2)
    const [record, unknown] = sink.records as {
      name: string
      attributes: Record<string, unknown>
      exit: { _tag: string; cause: string }
    }[]
    expect(record.name).toBe('runtime.worktree-selector-miss')
    expect(record.exit._tag).toBe('Failure')
    expect(record.exit.cause).toContain('selector_not_found')
    expect(record.attributes['selector.kind']).toBe('id')
    expect(record.attributes['selector.stage']).toBe('resolver')
    expect(record.attributes['selector.caller']).toBe('showManagedWorktree')
    expect(record.attributes['selector.stripped_value']).toBe('repo-1::/wt/acceptance-v0.8')
    expect(record.attributes['repo.host']).toBe('local')
    expect(record.attributes['path.exists_local']).toBe(false)
    expect(record.attributes['cache.fresh_at_request']).toBe(true)
    expect(record.attributes['repo.resolved_worktree_count']).toBe(23)
    expect(record.attributes['repo.meta_count']).toBe(32)

    expect(unknown.attributes['selector.required_host_id']).toBe('ssh:build-01')
    expect(unknown.attributes['selector.caller']).toBeNull()
    expect(unknown.attributes['repo.known']).toBe(false)
    expect(unknown.attributes['meta.present']).toBeNull()
    expect(unknown.attributes['resolved.worktree_count']).toBeNull()
  })
})
