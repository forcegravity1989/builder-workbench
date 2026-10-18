import { describe, expect, it } from 'vitest'
import {
  codeHubArchiveUrl,
  codeHubRepositoryMatches,
  mapCodeHubArchiveState
} from './archive-pr-status'

const remote = { host: 'codehub.example.com', project: 'team/workbench' }

describe('CodeHub archive PR status protocol', () => {
  it('maps the provider states without treating an unknown state as open', () => {
    expect(mapCodeHubArchiveState({ state: 'merged' })).toBe('merged')
    expect(mapCodeHubArchiveState({ state: 'opened' })).toBe('open')
    expect(mapCodeHubArchiveState({ state: 'closed' })).toBe('closed')
    expect(mapCodeHubArchiveState({ state: 'locked' })).toBeNull()
  })

  it('accepts the recorded CodeHub project with or without its host', () => {
    expect(codeHubRepositoryMatches('team/workbench', remote)).toBe(true)
    expect(codeHubRepositoryMatches('codehub.example.com/team/workbench.git', remote)).toBe(true)
    expect(codeHubRepositoryMatches('https://codehub.example.com/team/workbench', remote)).toBe(
      true
    )
    expect(codeHubRepositoryMatches('other.example.com/team/workbench', remote)).toBe(false)
  })

  it('uses the provider URL and otherwise builds a merge-request URL', () => {
    expect(codeHubArchiveUrl(remote, 17)).toBe(
      'https://codehub.example.com/team/workbench/-/merge_requests/17'
    )
    expect(codeHubArchiveUrl(remote, 17, 'https://review.example/mr/17')).toBe(
      'https://review.example/mr/17'
    )
  })
})
