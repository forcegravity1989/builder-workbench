// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { TaskPageComposerActionsModel } from '../../use-task-page-composer-actions'

const { api } = vi.hoisted(() => ({
  api: {
    createIssue: vi.fn().mockResolvedValue({ iid: 42 }),
    viewTask: vi
      .fn()
      .mockResolvedValue({ title: 'Issue 12', state: 'opened', description: 'Body' }),
    listComments: vi.fn().mockResolvedValue([{ id: 'c1', author: 'Ada', body: 'Review comment' }]),
    deleteComment: vi.fn().mockResolvedValue(undefined)
  }
}))
vi.mock('@/lib/codehub-api', () => ({ codehubApi: api }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/workbench/is-workbench-shell', () => ({ isWorkbenchShell: () => true }))
vi.mock('@/components/task-project-source-combobox', () => ({ default: () => null }))
import { TaskPageCodeHubFilters } from './Filters'
import { TaskPageCodeHubDetail } from './Detail'

afterEach(cleanup)

const repo = {
  id: 'r1',
  path: '/repo',
  displayName: 'Project',
  gitRemoteIdentity: { remoteUrl: 'https://codehub.example.com/team/project.git' }
}

it('keeps filter transitions and issue creation connected after extracting the controls', async () => {
  const setState = vi.fn()
  const setPreset = vi.fn()
  const refresh = vi.fn()
  const model = {
    codehubView: 'mrs',
    codehubState: 'merged',
    codehubPreset: 'review',
    codehubQuery: '',
    codehubAuthor: '',
    codehubAssignee: '',
    codehubLoading: false,
    setCodehubView: vi.fn(),
    setCodehubState: setState,
    setCodehubPreset: setPreset,
    setCodehubAuthor: vi.fn(),
    setCodehubAssignee: vi.fn(),
    setCodehubRefreshNonce: refresh,
    selectedRepos: [repo],
    taskPickerRepos: [repo],
    taskPickerGroups: [],
    repoSelection: new Set(['r1'])
  } as unknown as TaskPageComposerActionsModel
  const view = render(
    <TooltipProvider>
      <TaskPageCodeHubFilters model={model} />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Issues', exact: true }))
  expect(setState).toHaveBeenCalledWith('opened')
  expect(setPreset).toHaveBeenCalledWith('open')
  view.rerender(
    <TooltipProvider>
      <TaskPageCodeHubFilters model={{ ...model, codehubView: 'issues', codehubState: 'opened' }} />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Create issue', exact: true }))
  fireEvent.change(screen.getByPlaceholderText('New issue title'), {
    target: { value: 'New work' }
  })
  fireEvent.submit(screen.getByPlaceholderText('New issue title').closest('form')!)
  await waitFor(() => expect(refresh).toHaveBeenCalled())
  expect(api.createIssue).toHaveBeenCalledWith({
    repoId: 'r1',
    repoPath: '/repo',
    title: 'New work',
    description: undefined,
    assignee: undefined
  })
})

it('loads the detail and removes a deleted comment from the displayed conversation', async () => {
  const model = {
    codehubDetailItem: {
      type: 'issue',
      iid: 12,
      title: 'Issue 12',
      state: 'opened',
      repoId: 'r1',
      repoPath: '/repo',
      assignees: [],
      url: 'https://codehub.example.com/team/project/issues/12'
    },
    setCodehubDetailItem: vi.fn(),
    handleUseCodeHubItem: vi.fn(),
    setCodehubRefreshNonce: vi.fn()
  } as unknown as TaskPageComposerActionsModel
  render(<TaskPageCodeHubDetail model={model} />)
  await screen.findByText('Review comment')
  fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }))
  await waitFor(() => expect(screen.queryByText('Review comment')).toBeNull())
  expect(api.deleteComment).toHaveBeenCalledWith({
    repoId: 'r1',
    repoPath: '/repo',
    kind: 'issue',
    iid: 12,
    commentId: 'c1'
  })
})
