// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
const { listTasks } = vi.hoisted(() => ({ listTasks: vi.fn() }))
vi.mock('@/lib/codehub-api', () => ({ codehubApi: { listTasks } }))
import { useTaskPageCodeHubLoading } from './use-task-page-codehub-loading'

it('loads beyond the initial 30 and resets the window when the repository changes', async () => {
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
    codehubPreset: 'all',
    codehubQuery: 'Issue 35',
    codehubAuthor: '',
    codehubAssignee: '',
    codehubRefreshNonce: 0,
    setCodehubItems: setItems,
    setCodehubLoading: vi.fn(),
    setCodehubError: vi.fn()
  } as unknown as Parameters<typeof useTaskPageCodeHubLoading>[0]
  const { result, rerender } = renderHook(({ input }) => useTaskPageCodeHubLoading(input), {
    initialProps: { input: model }
  })
  await waitFor(() => expect(result.current.codehubHasMore).toBe(true))
  expect(setItems.mock.lastCall?.[0]).toHaveLength(30)
  act(() => result.current.loadMoreCodehub())
  await waitFor(() => expect(result.current.codehubHasMore).toBe(false))
  expect(setItems.mock.lastCall?.[0].at(-1)?.iid).toBe(35)
  rerender({ input: { ...model, selectedRepos: [{ ...model.selectedRepos[0], id: 'r2' }] } })
  await waitFor(() =>
    expect(listTasks.mock.lastCall?.[0]).toMatchObject({ repoId: 'r2', limit: 30 })
  )
})
