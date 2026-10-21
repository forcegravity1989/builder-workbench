// @vitest-environment happy-dom
import { renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
const { listTasks } = vi.hoisted(() => ({ listTasks: vi.fn() }))
vi.mock('@/lib/codehub-api', () => ({ codehubApi: { listTasks } }))
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
    codehubRefreshNonce: 0,
    setCodehubItems: setItems,
    setCodehubLoading: vi.fn(),
    setCodehubError: vi.fn()
  } as unknown as Parameters<typeof useTaskPageCodeHubLoading>[0]
  renderHook(() => useTaskPageCodeHubLoading(model))
  await waitFor(() => expect(setItems).toHaveBeenCalled())
  expect(listTasks.mock.lastCall?.[0]).toMatchObject({ limit: 250, search: undefined })
  expect(setItems.mock.lastCall?.[0]).toHaveLength(35)
})
