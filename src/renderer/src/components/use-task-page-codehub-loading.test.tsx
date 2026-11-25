// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
const { listTasks, viewer, readReferences, appState } = vi.hoisted(() => ({
  listTasks: vi.fn(),
  viewer: vi.fn(),
  readReferences: vi.fn(),
  appState: { repos: [] as readonly unknown[], activeRepoId: 'r1', projects: [], settings: {} }
}))
vi.mock('@/lib/codehub-api', () => ({
  createTaskPageCodeHubApi: () => ({ listTasks, viewer }),
  getCodeHubRepoSourceContext: () => null
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign((select: (state: typeof appState) => unknown) => select(appState), {
    getState: () => appState
  })
}))
vi.mock('@/workbench/native-task-port', () => ({
  nativeTaskReferenceReader: {
    key: (...args: unknown[]) => JSON.stringify(args),
    cached: () => null,
    read: readReferences
  }
}))
import { useTaskPageCodeHubLoading } from './use-task-page-codehub-loading'

it('fetches one bounded list and keeps issue search on the client', async () => {
  const setItems = vi.fn()
  listTasks.mockImplementation(async ({ limit }: { limit: number }) => ({
    remote: { host: 'codehub.example.com', project: 'team/project' },
    items: Array.from({ length: Math.min(limit, 35) }, (_, i) => ({
      iid: i + 1,
      title: `Issue ${i + 1}`
    })),
    hasMore: limit < 35
  }))
  const model = {
    pageData: {},
    selectedRepos: [
      {
        id: 'r1',
        path: '/repo',
        gitRemoteIdentity: { remoteUrl: 'https://codehub.example.com/team/project.git' }
      }
    ],
    taskSource: 'codehub',
    codehubView: 'issues',
    codehubState: 'opened',
    codehubPreset: 'open',
    codehubQuery: 'Issue 35',
    codehubAuthor: '',
    codehubAssignee: '',
    codehubLabels: [],
    codehubRefreshNonce: 0,
    setCodehubItems: setItems,
    setCodehubLoading: vi.fn(),
    setCodehubError: vi.fn()
  } as unknown as Parameters<typeof useTaskPageCodeHubLoading>[0]
  appState.repos = model.selectedRepos
  const { result, rerender } = renderHook(() => useTaskPageCodeHubLoading(model))
  await waitFor(() => expect(setItems).toHaveBeenCalled())
  expect(listTasks.mock.lastCall?.[0]).toMatchObject({ limit: 250, search: undefined })
  expect(setItems.mock.lastCall?.[0]).toHaveLength(35)
  listTasks.mockResolvedValue({
    remote: { host: 'codehub.example.com', project: 'team/project' },
    items: [],
    hasMore: true
  })
  model.pageData = { workbenchTaskScope: { version: 'v0.1', references: [] } }
  rerender()
  await waitFor(() => expect(result.current.codehubHasMore).toBe(true))
  expect(listTasks.mock.lastCall?.[0]).toMatchObject({ labels: ['bw:plan:v0.1'], limit: 250 })
  model.pageData = {}
  rerender()
  await waitFor(() => expect(listTasks.mock.lastCall?.[0]).toMatchObject({ labels: undefined }))

  const sourceContext = { projectId: 'p1', hostId: 'local', repoId: 'r1' }
  const issue = {
    type: 'issue',
    repoId: 'r1',
    repoPath: '/repo',
    host: 'codehub.example.com',
    project: 'team/project',
    title: 'Scoped issue',
    author: 'alice',
    assignees: ['alice'],
    labels: ['bug']
  }
  readReferences.mockResolvedValue([
    { kind: 'codehub', item: { ...issue, iid: 1, state: 'opened' }, source: sourceContext },
    { kind: 'codehub', item: { ...issue, iid: 2, state: 'closed' }, source: sourceContext },
    {
      kind: 'codehub',
      item: { ...issue, iid: 3, state: 'opened', assignees: ['bob'] },
      source: sourceContext
    }
  ])
  viewer.mockResolvedValue({ username: 'alice' })
  model.scopeRepoId = 'r1'
  model.pageData = {
    workbenchTaskScope: {
      version: 'v0.1',
      goalId: 'G1',
      homeHostId: 'local',
      references: [1, 2, 3].map((number) => ({
        provider: 'codehub',
        repository: 'team/project',
        number
      }))
    }
  }
  model.codehubPreset = 'mine'
  model.codehubAuthor = '@me'
  model.codehubLabels = ['bug']
  rerender()
  await waitFor(() =>
    expect(setItems.mock.lastCall?.[0].map((item: { iid: number }) => item.iid)).toEqual([1])
  )
  expect(setItems.mock.lastCall?.[0][0].sourceContext).toEqual(sourceContext)
  expect(readReferences.mock.lastCall?.[0]).toMatchObject({ repoId: 'r1', hostId: 'local' })
  expect(viewer).toHaveBeenCalledWith({ repoId: 'r1', repoPath: '/repo' })
  expect(result.current.codehubScopeReadyCount).toBe(3)
  model.codehubState = 'all'
  model.codehubAssignee = 'bob'
  model.codehubPreset = 'open'
  rerender()
  await waitFor(() =>
    expect(setItems.mock.lastCall?.[0].map((item: { iid: number }) => item.iid)).toEqual([3])
  )
  model.codehubLabels = ['missing']
  rerender()
  await waitFor(() => expect(setItems.mock.lastCall?.[0]).toEqual([]))
  model.codehubLabels = []
  model.codehubAssignee = ''
  model.codehubAuthor = ''
  model.codehubState = 'closed'
  rerender()
  await waitFor(() =>
    expect(setItems.mock.lastCall?.[0].map((item: { iid: number }) => item.iid)).toEqual([2])
  )
  model.selectedRepos = []
  rerender()
  await waitFor(() => expect(setItems.mock.lastCall?.[0]).toEqual([]))
})
