import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import { sdlcProviderOf } from './overview-sdlc'

type RepoPick = Pick<Repo, 'upstream' | 'repoIcon' | 'gitRemoteIdentity'>

describe('sdlcProviderOf', () => {
  it('CodeHub 远端识别为 codehub，GitHub（upstream 或远端）识别为 github，其余为空', () => {
    const codehub: RepoPick = {
      gitRemoteIdentity: {
        remoteUrl: 'git@codehub.example.com:group/proj.git',
        canonicalKey: 'codehub.example.com/group/proj',
        remoteName: 'origin'
      }
    }
    const github: RepoPick = { upstream: { owner: 'octo', repo: 'proj' } }
    const githubRemote: RepoPick = {
      gitRemoteIdentity: {
        remoteUrl: 'https://github.com/octo/proj.git',
        canonicalKey: 'github.com/octo/proj',
        remoteName: 'origin'
      }
    }
    const other: RepoPick = {
      gitRemoteIdentity: {
        remoteUrl: 'https://gitlab.com/group/proj.git',
        canonicalKey: 'gitlab.com/group/proj',
        remoteName: 'origin'
      }
    }
    expect(sdlcProviderOf(codehub)).toBe('codehub')
    expect(sdlcProviderOf(github)).toBe('github')
    // github.com 主机不落入 codehub，走 github 身份。
    expect(sdlcProviderOf(githubRemote)).toBe('github')
    expect(sdlcProviderOf(other)).toBeNull()
    expect(sdlcProviderOf(null)).toBeNull()
  })
})
