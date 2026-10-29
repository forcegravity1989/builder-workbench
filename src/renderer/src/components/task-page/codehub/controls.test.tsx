// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { TaskPageComposerActionsModel } from '../../use-task-page-composer-actions'

const { api } = vi.hoisted(() => {
  // 详情页删除评论后会重读列表（不再本地过滤），mock 按同样语义维护状态。
  let comments = [{ id: 'c1', author: 'Ada', body: 'Review comment' }]
  return {
    api: {
      createIssue: vi.fn().mockResolvedValue({ iid: 42 }),
      viewTask: vi
        .fn()
        .mockResolvedValue({ title: 'Issue 12', state: 'opened', description: 'Body' }),
      listComments: vi.fn().mockImplementation(() => Promise.resolve(comments)),
      deleteComment: vi.fn().mockImplementation(() => {
        comments = []
        return Promise.resolve(undefined)
      }),
      mrChecks: vi.fn().mockResolvedValue([]),
      mrChanges: vi.fn().mockResolvedValue([])
    }
  }
})
vi.mock('@/lib/codehub-api', () => ({ codehubApi: api }))
// i18n 实例被详情页签的深层依赖(localized-catalog)读取,补最小 stub。
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback,
  i18n: { language: 'en' }
}))
vi.mock('@/workbench/is-workbench-shell', () => ({ isWorkbenchShell: () => true }))
vi.mock('@/components/task-project-source-combobox', () => ({ default: () => null }))
// Why: Files 页签会真挂 Monaco diff,本测试只看工具条与复制控件,照
// pr-files-combined-diff-section-index.test.tsx 的先例把 diff 体 mock 掉。
vi.mock('./FilesTab', () => ({ CodeHubFilesTab: () => null }))
// Why: 底部评论框现在挂 tiptap 富文本编辑器,其表格右键菜单依赖
// window.api 预载 IPC;本测试只看筛选/删除/分支控件,照 FilesTab 先例
// 把编辑器 mock 掉。
vi.mock('@/components/github/GitHubMarkdownComposer', () => ({
  GitHubMarkdownComposer: () => null
}))
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
    codehubLabels: [],
    setCodehubLabels: vi.fn(),
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
  fireEvent.click(screen.getByRole('button', { name: 'Issues' }))
  expect(setState).toHaveBeenCalledWith('opened')
  expect(setPreset).toHaveBeenCalledWith('open')
  view.rerender(
    <TooltipProvider>
      <TaskPageCodeHubFilters model={{ ...model, codehubView: 'issues', codehubState: 'opened' }} />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Create issue' }))
  fireEvent.change(screen.getByPlaceholderText('New issue title'), {
    target: { value: 'New work' }
  })
  fireEvent.submit(screen.getByPlaceholderText('New issue title').closest('form')!)
  await waitFor(() => expect(refresh).toHaveBeenCalled())
  expect(api.createIssue).toHaveBeenCalledWith(
    {
      repoId: 'r1',
      repoPath: '/repo',
      title: 'New work',
      description: undefined,
      assignee: undefined
    },
    repo
  )
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
  expect(screen.getByText('Body')).toBeTruthy()
  expect(screen.queryByText('No description')).toBeNull()
  expect(screen.queryByPlaceholderText('Assignee username')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Close as completed' })).toBeNull()
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

it('shows a merge request branch and copy control without the old action form', async () => {
  const model = {
    codehubDetailItem: {
      type: 'mr',
      iid: 8,
      title: 'Merge me',
      state: 'opened',
      repoId: 'r1',
      repoPath: '/repo',
      assignees: [],
      reviewers: [],
      labels: [],
      sourceBranch: 'feat/task-style',
      targetBranch: 'main',
      url: 'https://codehub.example.com/team/project/merge_requests/8',
      updatedAt: ''
    },
    setCodehubDetailItem: vi.fn(),
    handleUseCodeHubItem: vi.fn(),
    setCodehubRefreshNonce: vi.fn()
  } as unknown as TaskPageComposerActionsModel
  render(<TaskPageCodeHubDetail model={model} />)
  expect(await screen.findByText('feat/task-style → main')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Copy GitHub link' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Merge' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Close pull request' })).toBeTruthy()
  expect(screen.getByText('Assignees')).toBeTruthy()
  expect(screen.getByText('Reviewers')).toBeTruthy()
  expect(screen.getByRole('tab', { name: 'Checks' })).toBeTruthy()
  expect(screen.queryByPlaceholderText('Reviewers, comma-separated')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Set reviewers' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Auto-merge' })).toBeNull()
  fireEvent.click(screen.getByRole('tab', { name: 'Checks' }))
  expect(screen.queryByText('Pipelines')).toBeNull()
})
