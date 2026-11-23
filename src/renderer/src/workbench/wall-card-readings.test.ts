import { describe, expect, it } from 'vitest'
import type { CycleTaskRead } from './version-cycle/ports'
import { wallTaskCounts } from './wall-card-readings'

function read(state: string): CycleTaskRead {
  const reference = { provider: 'github' as const, repository: 'github.com/acme/app', number: 1 }
  return {
    kind: 'ready',
    reference,
    task: {
      reference,
      source: { kind: 'task-source', provider: 'github', projectId: 'app', hostId: 'local' },
      iid: 1,
      title: 'Task',
      state,
      url: '',
      readAt: ''
    }
  }
}

describe('wallTaskCounts', () => {
  it('uses native issue states, preserving unknown and empty scopes', () => {
    expect(
      wallTaskCounts([read('CLOSED'), read('merged'), read('open'), read('in_progress')])
    ).toEqual({ closed: 2, total: 4 })
    expect(wallTaskCounts([read('OPEN'), read('unexpected')])).toBeNull()
    expect(
      wallTaskCounts([
        { kind: 'unavailable', reference: read('open').reference, error: 'offline', readAt: '' }
      ])
    ).toBeNull()
    expect(wallTaskCounts([])).toEqual({ closed: 0, total: 0 })
  })
})
