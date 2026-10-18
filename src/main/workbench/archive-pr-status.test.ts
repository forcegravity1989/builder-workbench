import { describe, expect, it } from 'vitest'
import {
  codeHubArchiveUrl,
  codeHubRepositoryMatches,
  mapCodeHubArchiveState
} from './archive-pr-status'

const remote = { host: 'codehub.example.com', project: 'team/workbench' }

describe('CodeHub archive PR status protocol', () => {
  it('reads provider states, validates identity, and resolves the review URL', () => {
    expect(mapCodeHubArchiveState({ state: 'merged' })).toBe('merged')
    expect(mapCodeHubArchiveState({ state: 'opened' })).toBe('open')
    expect(mapCodeHubArchiveState({ state: 'closed' })).toBe('closed')
    expect(mapCodeHubArchiveState({ state: 'locked' })).toBeNull()
    expect(codeHubRepositoryMatches('team/workbench', remote)).toBe(true)
    expect(codeHubRepositoryMatches('codehub.example.com/team/workbench.git', remote)).toBe(true)
    expect(codeHubRepositoryMatches('https://codehub.example.com/team/workbench', remote)).toBe(
      true
    )
    expect(codeHubRepositoryMatches('other.example.com/team/workbench', remote)).toBe(false)
    expect(codeHubArchiveUrl(remote, 17)).toBe(
      'https://codehub.example.com/team/workbench/-/merge_requests/17'
    )
    expect(codeHubArchiveUrl(remote, 17, 'https://review.example/mr/17')).toBe(
      'https://review.example/mr/17'
    )
  })
})
