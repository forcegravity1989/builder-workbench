import { describe, expect, it } from 'vitest'
import type { TeamDirectoryMember } from './team-directory'
import { planTeamHostRefresh, type TeamSavedHost } from './team-host-refresh'

const member: TeamDirectoryMember = {
  member_id: 'A001',
  name: '安迪',
  identity_source: 'welink-cli'
}

const published = {
  endpoint: 'ws://10.138.18.233:6768',
  deviceToken: 'token-b',
  publicKeyB64: 'key-b',
  accessMode: 'team-read' as const
}

function saved(overrides: Partial<TeamSavedHost> & Pick<TeamSavedHost, 'id'>): TeamSavedHost {
  return {
    name: '安迪',
    managed: true,
    memberId: null,
    endpoint: 'ws://10.138.209.38:6768',
    deviceToken: 'token-a',
    publicKeys: ['key-a'],
    accessMode: 'team-read',
    ...overrides
  }
}

describe('team host refresh', () => {
  it('replaces a legacy team host whose sync name includes the member ID', () => {
    const plan = planTeamHostRefresh(member, published, [
      saved({ id: 'named', name: '安迪（A001）' })
    ])
    expect(plan).toMatchObject({
      action: 'update',
      environmentId: 'named',
      removeEnvironmentIds: []
    })
  })

  it('replaces a saved member host when the group-space link changes key', () => {
    const plan = planTeamHostRefresh(member, published, [
      saved({ id: 'old', memberId: 'A001' }),
      saved({
        id: 'other',
        name: '许荆晶',
        memberId: 'B002',
        publicKeys: ['key-c'],
        endpoint: 'ws://10.138.18.28:6768'
      })
    ])
    expect(plan).toEqual({
      action: 'update',
      environmentId: 'old',
      removeEnvironmentIds: [],
      memberId: 'A001'
    })
  })

  it('updates the same pairing in place and drops the leftover team copy', () => {
    const plan = planTeamHostRefresh(
      member,
      { ...published, publicKeyB64: 'key-a', deviceToken: 'token-a' },
      [
        saved({ id: 'connected', managed: false, memberId: null }),
        saved({ id: 'duplicate', name: '安迪（A001）', endpoint: 'ws://169.254.239.57:6768' })
      ]
    )
    expect(plan.action).toBe('update')
    expect(plan.environmentId).toBe('connected')
    expect(plan.removeEnvironmentIds).toEqual(['duplicate'])
  })

  it('preserves an unrelated hand-added host even when it has the same name', () => {
    const plan = planTeamHostRefresh(member, published, [
      saved({
        id: 'manual',
        name: '安迪',
        managed: false,
        memberId: null,
        publicKeys: ['key-lab']
      }),
      saved({ id: 'old-team-with-same-name' })
    ])
    expect(plan).toMatchObject({ action: 'add', environmentId: null, removeEnvironmentIds: [] })
  })
})
