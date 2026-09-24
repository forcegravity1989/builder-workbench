import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runCodeHubCliMock } = vi.hoisted(() => ({
  runCodeHubCliMock: vi.fn()
}))

vi.mock('./cli', () => ({
  runCodeHubCli: runCodeHubCliMock
}))

import { applyCodeHubIssueState } from './issue-state'

describe('applyCodeHubIssueState', () => {
  beforeEach(() => {
    runCodeHubCliMock.mockReset()
    runCodeHubCliMock.mockResolvedValue(undefined)
  })

  it('writes one close comment and then closes, without a close reason flag', async () => {
    await applyCodeHubIssueState({
      host: 'codehub-g.huawei.com',
      project: 'Org/Group/repo',
      issueNumber: 12,
      state: 'closed',
      stateReason: 'not_planned'
    })

    expect(runCodeHubCliMock).toHaveBeenNthCalledWith(1, [
      'issue',
      'comment',
      'create',
      '12',
      '-p',
      'Org/Group/repo',
      '-H',
      'codehub-g.huawei.com',
      '--body',
      '关闭原因: not planned'
    ])
    expect(runCodeHubCliMock).toHaveBeenNthCalledWith(2, [
      'issue',
      'close',
      '12',
      '-p',
      'Org/Group/repo',
      '-H',
      'codehub-g.huawei.com'
    ])
  })

  it('does not close when the comment fails', async () => {
    runCodeHubCliMock.mockRejectedValueOnce(new Error('comment failed'))

    await expect(
      applyCodeHubIssueState({
        host: 'codehub-g.huawei.com',
        project: 'Org/repo',
        issueNumber: 3,
        state: 'closed',
        stateReason: 'duplicate',
        duplicateOf: 9
      })
    ).rejects.toThrow('comment failed')
    expect(runCodeHubCliMock).toHaveBeenCalledTimes(1)
  })

  it('reopens without a comment', async () => {
    await applyCodeHubIssueState({
      host: 'open.codehub.huawei.com',
      project: 'Org/repo',
      issueNumber: 4,
      state: 'open'
    })

    expect(runCodeHubCliMock).toHaveBeenCalledTimes(1)
    expect(runCodeHubCliMock).toHaveBeenCalledWith([
      'issue',
      'reopen',
      '4',
      '-p',
      'Org/repo',
      '-H',
      'open.codehub.huawei.com'
    ])
  })
})
