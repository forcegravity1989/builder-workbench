import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import { resolveProjectSourcePair, sameProjectRows } from './project-source-resolution'

function repo(partial: Partial<Repo> & Pick<Repo, 'id' | 'path' | 'displayName'>): Repo {
  return {
    badgeColor: '#000',
    addedAt: 0,
    ...partial
  }
}

function identity(canonicalKey: string): Repo['gitRemoteIdentity'] {
  return {
    canonicalKey,
    remoteName: 'origin',
    remoteUrl: `https://${canonicalKey}.git`
  }
}

describe('resolveProjectSourcePair', () => {
  it('按本地优先、缺失降级和远端身份归并解析来源', () => {
    // 本机有同一远端项目时取本机登记行。
    const local = repo({
      id: 'local-app',
      path: '/work/app',
      displayName: 'app',
      addedAt: 2,
      gitRemoteIdentity: identity('github.com/acme/app')
    })
    const remote = repo({
      id: 'remote-app',
      path: '/srv/app',
      displayName: 'app',
      addedAt: 1,
      executionHostId: 'runtime:peer',
      gitRemoteIdentity: identity('github.com/acme/app')
    })
    expect(resolveProjectSourcePair([remote, local], remote.id, 'local-first')).toEqual({
      repoId: 'local-app',
      hostId: 'local'
    })

    // 本机没有该项目时按最早配对的主机降级，时间相同再按登记顺序。
    const later = repo({
      id: 'later-app',
      path: '/srv/app',
      displayName: 'app',
      addedAt: 1,
      executionHostId: 'runtime:later',
      gitRemoteIdentity: identity('github.com/acme/app')
    })
    const earlier = repo({
      id: 'earlier-app',
      path: '/srv/app',
      displayName: 'app',
      addedAt: 9,
      executionHostId: 'runtime:earlier',
      gitRemoteIdentity: identity('github.com/acme/app')
    })
    expect(
      resolveProjectSourcePair([later, earlier], later.id, 'local-first', {
        runtimeEnvironments: [
          { id: 'later', createdAt: 200 },
          { id: 'earlier', createdAt: 100 }
        ]
      })
    ).toEqual({ repoId: 'earlier-app', hostId: 'runtime:earlier' })

    // local-only 在本机没有该项目时返回空，不降级。
    expect(resolveProjectSourcePair([remote], remote.id, 'local-only')).toBeNull()

    // 无远端身份的本地项目只匹配自身，不和其他主机同名路径合并。
    const localFolder = repo({ id: 'local-folder', path: '/work/app', displayName: 'app' })
    const remoteFolder = repo({
      id: 'remote-folder',
      path: '/work/app',
      displayName: 'app',
      executionHostId: 'runtime:peer'
    })
    expect(sameProjectRows([remoteFolder, localFolder], localFolder)).toEqual([localFolder])
    expect(
      resolveProjectSourcePair([remoteFolder, localFolder], localFolder.id, 'local-first')
    ).toEqual({ repoId: 'local-folder', hostId: 'local' })

    // 不同远端项目不会被当成同一项目。
    const other = repo({
      id: 'other',
      path: '/work/other',
      displayName: 'other',
      gitRemoteIdentity: identity('github.com/acme/other')
    })
    expect(resolveProjectSourcePair([other, local], local.id, 'local-first')).toEqual({
      repoId: 'local-app',
      hostId: 'local'
    })
  })
})
