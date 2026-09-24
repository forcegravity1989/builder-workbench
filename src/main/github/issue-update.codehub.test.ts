import { beforeEach, describe, expect, it, vi } from 'vitest'

const { readCodeHubRemoteForRepoMock, applyCodeHubIssueStateMock, ghExecFileAsyncMock } =
  vi.hoisted(() => ({
    readCodeHubRemoteForRepoMock: vi.fn(),
    applyCodeHubIssueStateMock: vi.fn(),
    ghExecFileAsyncMock: vi.fn()
  }))

vi.mock('../codehub/remote', () => ({
  readCodeHubRemoteForRepo: readCodeHubRemoteForRepoMock
}))

vi.mock('../codehub/issue-state', () => ({
  applyCodeHubIssueState: applyCodeHubIssueStateMock
}))

vi.mock('./gh-utils', async () => {
  const actual = await vi.importActual<typeof import('./gh-utils')>('./gh-utils')
  return {
    ...actual,
    ghExecFileAsync: ghExecFileAsyncMock
  }
})

import { updateIssue } from './issue-update'

describe('updateIssue CodeHub state', () => {
  beforeEach(() => {
    readCodeHubRemoteForRepoMock.mockReset()
    applyCodeHubIssueStateMock.mockReset()
    ghExecFileAsyncMock.mockReset()
    applyCodeHubIssueStateMock.mockResolvedValue(undefined)
    readCodeHubRemoteForRepoMock.mockResolvedValue({
      host: 'codehub-g.huawei.com',
      project: 'Org/Group/repo'
    })
  })

  it('closes through codehub-cli and does not call gh', async () => {
    await expect(
      updateIssue('/repo', 12, { state: 'closed', stateReason: 'completed' })
    ).resolves.toEqual({ ok: true })

    expect(applyCodeHubIssueStateMock).toHaveBeenCalledWith({
      host: 'codehub-g.huawei.com',
      project: 'Org/Group/repo',
      issueNumber: 12,
      state: 'closed',
      stateReason: 'completed',
      duplicateOf: undefined
    })
    expect(ghExecFileAsyncMock).not.toHaveBeenCalled()
  })

  it('returns the comment error and does not fall through to gh', async () => {
    applyCodeHubIssueStateMock.mockRejectedValueOnce(new Error('comment failed'))

    await expect(
      updateIssue('/repo', 12, { state: 'closed', stateReason: 'not_planned' })
    ).resolves.toEqual({ ok: false, error: 'comment failed' })
    expect(ghExecFileAsyncMock).not.toHaveBeenCalled()
  })
})
