import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runCodeHubCliMock } = vi.hoisted(() => ({
  runCodeHubCliMock: vi.fn()
}))

vi.mock('./cli', () => ({
  runCodeHubCli: runCodeHubCliMock
}))

import { listCodeHubTasks } from './work-items'

const remote = { host: 'codehub-g.huawei.com', project: 'Org/Group/repo' }

describe('listCodeHubTasks', () => {
  beforeEach(() => {
    runCodeHubCliMock.mockReset()
  })

  it('lists issues through codehub-cli with the full project path', async () => {
    runCodeHubCliMock.mockResolvedValue(
      JSON.stringify([
        {
          iid: 7,
          title: 'Fix login',
          state: 'opened',
          web_url: 'https://codehub-g.huawei.com/Org/Group/repo/-/issues/7',
          author: { username: 'ada' },
          updated_at: '2026-09-24T00:00:00Z'
        }
      ])
    )

    const items = await listCodeHubTasks({
      remote,
      execOptions: { cwd: '/repo' },
      kind: 'issue',
      state: 'opened'
    })

    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      [
        'issue',
        'list',
        '-p',
        'Org/Group/repo',
        '-H',
        'codehub-g.huawei.com',
        '-f',
        'json',
        '--order-by',
        'updated_at',
        '--sort',
        'desc',
        '--limit',
        '30',
        '--state',
        'opened'
      ],
      { cwd: '/repo' }
    )
    expect(items).toEqual([
      {
        type: 'issue',
        iid: 7,
        title: 'Fix login',
        state: 'opened',
        url: 'https://codehub-g.huawei.com/Org/Group/repo/-/issues/7',
        author: 'ada',
        assignees: [],
        reviewers: [],
        updatedAt: '2026-09-24T00:00:00Z'
      }
    ])
  })
})
