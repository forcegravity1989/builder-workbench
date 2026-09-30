import { describe, expect, it } from 'vitest'
import { CODEHUB_ARCHIVE_UNPROVABLE_REASON } from '../../shared/workbench/version-archive'
import { registeredCodeHubArchiveReason } from './archive-source-gap'

describe('registeredCodeHubArchiveReason', () => {
  it('names CodeHub when the registered remote is CodeHub', () => {
    expect(
      registeredCodeHubArchiveReason({
        remoteUrl: 'https://codehub.internal/group/project.git',
        canonicalKey: 'codehub.internal/group/project'
      })
    ).toBe(CODEHUB_ARCHIVE_UNPROVABLE_REASON)
  })

  it('does not claim a GitHub miss for a CodeHub canonical key alone', () => {
    expect(
      registeredCodeHubArchiveReason({
        remoteUrl: '',
        canonicalKey: 'codehub-y.huawei.com/group/app'
      })
    ).toBe(CODEHUB_ARCHIVE_UNPROVABLE_REASON)
  })

  it('leaves GitHub and missing remotes to the GitHub archive reader', () => {
    expect(
      registeredCodeHubArchiveReason({
        remoteUrl: 'https://github.com/acme/widgets.git',
        canonicalKey: 'github.com/acme/widgets'
      })
    ).toBeNull()
    expect(registeredCodeHubArchiveReason(null)).toBeNull()
    expect(registeredCodeHubArchiveReason(undefined)).toBeNull()
  })
})
