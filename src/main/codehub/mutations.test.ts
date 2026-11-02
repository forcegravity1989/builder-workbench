import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runCodeHubCliMock } = vi.hoisted(() => ({
  runCodeHubCliMock: vi.fn()
}))

vi.mock('./cli', () => ({
  runCodeHubCli: runCodeHubCliMock
}))

import {
  assignCodeHubIssue,
  closeCodeHubMr,
  createCodeHubIssue,
  listCodeHubPipelines,
  mergeCodeHubMr,
  setCodeHubReviewers,
  updateCodeHubIssueLabels,
  updateCodeHubIssueTitle,
  viewCodeHubTask
} from './mutations'

const remote = { host: 'codehub-g.huawei.com', project: 'Org/Group/repo' }

describe('codehub mutations', () => {
  beforeEach(() => {
    runCodeHubCliMock.mockReset()
    runCodeHubCliMock.mockResolvedValue('{}')
  })

  it('creates an issue with codehub-cli, including an optional assignee', async () => {
    runCodeHubCliMock.mockResolvedValue(
      JSON.stringify({ iid: 4, title: 'Login', web_url: 'https://example/4' })
    )
    const created = await createCodeHubIssue({
      remote,
      execOptions: { cwd: '/repo' },
      title: 'Login',
      description: 'SSO',
      assignee: 'ada'
    })
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      [
        'issue',
        'create',
        '--title',
        'Login',
        '-p',
        'Org/Group/repo',
        '-H',
        'codehub-g.huawei.com',
        '-f',
        'json',
        '--description',
        'SSO',
        '--assignee',
        'ada'
      ],
      { cwd: '/repo' }
    )
    expect(created.iid).toBe(4)
  })

  it('updates an issue title and closes a merge request', async () => {
    await updateCodeHubIssueTitle({
      remote,
      execOptions: { cwd: '/repo' },
      iid: 4,
      title: 'Login again'
    })
    // Labels are replace-semantics; the draft set is trimmed and
    // de-duplicated into one CSV. An empty set clears via a single space —
    // the CLI treats `--labels ''` as flag-not-set and errors.
    await updateCodeHubIssueLabels({
      remote,
      execOptions: { cwd: '/repo' },
      iid: 4,
      labels: [' weekly ', 'p1', 'p1', '']
    })
    await updateCodeHubIssueLabels({
      remote,
      execOptions: { cwd: '/repo' },
      iid: 4,
      labels: []
    })
    await closeCodeHubMr({ remote, execOptions: { cwd: '/repo' }, iid: 8 })
    expect(runCodeHubCliMock.mock.calls[0][0]).toEqual([
      'issue',
      'update',
      '4',
      '--title',
      'Login again',
      '-p',
      'Org/Group/repo',
      '-H',
      'codehub-g.huawei.com'
    ])
    expect(runCodeHubCliMock.mock.calls[1][0]).toEqual([
      'issue',
      'update',
      '4',
      '--labels',
      'weekly,p1',
      '-p',
      'Org/Group/repo',
      '-H',
      'codehub-g.huawei.com'
    ])
    expect(runCodeHubCliMock.mock.calls[2][0]).toEqual([
      'issue',
      'update',
      '4',
      '--labels',
      ' ',
      '-p',
      'Org/Group/repo',
      '-H',
      'codehub-g.huawei.com'
    ])
    expect(runCodeHubCliMock.mock.calls[3][0]).toEqual([
      'mr',
      'close',
      '8',
      '-p',
      'Org/Group/repo',
      '-H',
      'codehub-g.huawei.com'
    ])
  })

  it('assigns, sets reviewers, and merges without gh', async () => {
    await assignCodeHubIssue({ remote, execOptions: { cwd: '/repo' }, iid: 4, assignee: 'ada' })
    await setCodeHubReviewers({
      remote,
      execOptions: { cwd: '/repo' },
      iid: 8,
      reviewers: ['ada', 'bob']
    })
    await mergeCodeHubMr({ remote, execOptions: { cwd: '/repo' }, iid: 8, auto: true })
    expect(runCodeHubCliMock.mock.calls.map((call) => call[0][0])).toEqual(['issue', 'mr', 'mr'])
    expect(runCodeHubCliMock.mock.calls[1][0]).toContain('--reviewers')
    expect(runCodeHubCliMock.mock.calls[2][0]).toEqual(
      expect.arrayContaining(['merge', '--yes', '--auto'])
    )
  })

  it('views an issue through codehub-cli', async () => {
    runCodeHubCliMock.mockResolvedValue(
      JSON.stringify({
        title: 'Login',
        description: 'SSO',
        state: 'closed',
        closed_at: '2026-10-01T10:00:00Z',
        merge_requests_count: 0,
        linked_merge_requests: [
          { iid: 8, web_url: 'https://codehub-g.huawei.com/Org/Group/repo/merge_requests/8' }
        ],
        web_url: 'https://example/4',
        author: { username: 'ada' },
        assignees: [{ username: 'bob' }]
      })
    )
    const detail = await viewCodeHubTask({
      remote,
      execOptions: { cwd: '/repo' },
      kind: 'issue',
      iid: 4
    })
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      ['issue', 'view', '4', '-p', 'Org/Group/repo', '-H', 'codehub-g.huawei.com', '-f', 'json'],
      { cwd: '/repo' }
    )
    expect(detail).toEqual({
      iid: 4,
      title: 'Login',
      description: 'SSO',
      state: 'closed',
      closedAt: '2026-10-01T10:00:00Z',
      linkedMergeRequests: [
        { iid: 8, url: 'https://codehub-g.huawei.com/Org/Group/repo/merge_requests/8' }
      ],
      url: 'https://example/4',
      author: 'ada',
      assignees: ['bob'],
      reviewers: [],
      labels: [],
      sourceBranch: null,
      targetBranch: null
    })
    for (const linked of [
      [{ iid: 8, web_url: 'https://codehub-g.huawei.com/Org/other/-/merge_requests/8' }],
      [{ iid: 8, web_url: 'https://codehub-g.huawei.com/Org/Group/repo/-/merge_requests/9' }],
      [{ iid: 0, web_url: 'https://codehub-g.huawei.com/Org/Group/repo/-/merge_requests/0' }],
      [{ iid: 8 }],
      [null]
    ]) {
      runCodeHubCliMock.mockResolvedValue(JSON.stringify({ linked_merge_requests: linked }))
      await expect(viewCodeHubTask({ remote, kind: 'issue', iid: 4 })).rejects.toThrow('CodeHub')
    }
    runCodeHubCliMock.mockResolvedValue(
      JSON.stringify({ linked_merge_requests: [], merge_requests_count: 1 })
    )
    await expect(viewCodeHubTask({ remote, kind: 'issue', iid: 4 })).resolves.toMatchObject({
      linkedMergeRequests: []
    })
    runCodeHubCliMock.mockResolvedValue(
      JSON.stringify({ linked_merge_requests: [], merge_requests_count: 0 })
    )
    await expect(viewCodeHubTask({ remote, kind: 'issue', iid: 4 })).resolves.toMatchObject({
      linkedMergeRequests: []
    })

    const cloneRemote = { ...remote, host: 'git.codehub.example.test' }
    const linked = [8, 9].map((iid) => ({
      iid,
      web_url: `https://${remote.host}/${remote.project}/merge_requests/${iid}`
    }))
    const project = {
      path_with_namespace: remote.project,
      http_url_to_repo: `https://${cloneRemote.host}/${remote.project}.git`,
      web_url: `https://${remote.host}/${remote.project}`
    }
    runCodeHubCliMock.mockImplementation(async (args: string[]) =>
      JSON.stringify(
        args[0] === 'project' ? project : { linked_merge_requests: linked, merge_requests_count: 0 }
      )
    )
    await expect(
      viewCodeHubTask({ remote: cloneRemote, kind: 'issue', iid: 4 })
    ).resolves.toMatchObject({
      linkedMergeRequests: linked.map((mr) => ({ iid: mr.iid, url: mr.web_url }))
    })
    for (const invalidProject of [
      { ...project, http_url_to_repo: `https://other.codehub.example.test/${remote.project}.git` },
      { ...project, path_with_namespace: 'Other/repo' },
      { ...project, web_url: `https://other.codehub.example.test/${remote.project}` }
    ]) {
      runCodeHubCliMock.mockImplementation(async (args: string[]) =>
        JSON.stringify(args[0] === 'project' ? invalidProject : { linked_merge_requests: linked })
      )
      await expect(viewCodeHubTask({ remote: cloneRemote, kind: 'issue', iid: 4 })).rejects.toThrow(
        '来源'
      )
    }
  })

  it('reads a nested issue body and merge request branches', async () => {
    runCodeHubCliMock.mockResolvedValue(
      JSON.stringify({
        merge_request: {
          content: 'Actual body',
          labels: [{ name: 'bug' }],
          source_branch: 'feat/task-style',
          target_branch: 'main'
        }
      })
    )
    const detail = await viewCodeHubTask({ remote, kind: 'mr', iid: 3 })
    expect(detail.description).toBe('Actual body')
    expect(detail.labels).toEqual(['bug'])
    expect(detail.sourceBranch).toBe('feat/task-style')
    expect(detail.targetBranch).toBe('main')
    expect(detail.state).toBe('unknown')
    runCodeHubCliMock.mockResolvedValue(JSON.stringify({ iid: 4, state: 'merged' }))
    await expect(viewCodeHubTask({ remote, kind: 'mr', iid: 3 })).rejects.toThrow(
      '编号与请求不一致'
    )
    runCodeHubCliMock.mockResolvedValue(
      JSON.stringify({
        iid: 3,
        state: 'merged',
        web_url: 'https://codehub-g.huawei.com/Org/other/-/merge_requests/3'
      })
    )
    await expect(viewCodeHubTask({ remote, kind: 'mr', iid: 3 })).rejects.toThrow(
      '链接与请求来源不一致'
    )
    runCodeHubCliMock.mockResolvedValue(
      JSON.stringify({
        iid: 3,
        state: 'merged',
        web_url: 'https://codehub-g.huawei.com/Org/Group/repo/-/merge_requests/3'
      })
    )
    await expect(viewCodeHubTask({ remote, kind: 'mr', iid: 3 })).resolves.toMatchObject({
      iid: 3,
      state: 'merged'
    })
  })

  it('lists merge request pipelines', async () => {
    runCodeHubCliMock.mockResolvedValue(JSON.stringify([{ id: 9, status: 'success', sha: 'abc' }]))
    const pipelines = await listCodeHubPipelines({ remote, execOptions: { cwd: '/repo' }, iid: 8 })
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      ['mr', 'pipeline', '8', '-p', 'Org/Group/repo', '-H', 'codehub-g.huawei.com', '-f', 'json'],
      { cwd: '/repo' }
    )
    expect(pipelines).toEqual([{ id: '9', status: 'success', url: null, ref: 'abc' }])
  })
})
