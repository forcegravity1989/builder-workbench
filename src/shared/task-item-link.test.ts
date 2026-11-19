import { describe, expect, it } from 'vitest'
import type { Repo } from './repo-types'
import { findTaskItemLinkRepo, parseTaskItemLink, taskItemLinkIdentityKey } from './task-item-link'

function registeredRepo(id: string, remoteUrl: string, overrides: Partial<Repo> = {}): Repo {
  return {
    id,
    path: `/projects/${id}`,
    displayName: id,
    badgeColor: '',
    addedAt: 0,
    gitRemoteIdentity: {
      canonicalKey: remoteUrl.replace('https://', '').replace(/\.git$/, ''),
      remoteName: 'origin',
      remoteUrl
    },
    ...overrides
  }
}

// 完整服务端身份是导航协议；编号不能依赖当前项目或通过 Issue／PR 猜测。
describe('parseTaskItemLink', () => {
  it('保留 GitHub 类型、仓库和编号，不把评论锚点作为另一个任务', () => {
    expect(parseTaskItemLink('https://github.com/owner/project/pull/652#issuecomment-123')).toEqual(
      {
        provider: 'github',
        host: 'github.com',
        repository: 'owner/project',
        kind: 'pr',
        number: 652
      }
    )
    expect(parseTaskItemLink('https://github.com/owner/project/issues/651?x=1')?.kind).toBe('issue')
  })

  it('解析 CodeHub 多层项目及两类任务的原生路径', () => {
    expect(
      parseTaskItemLink('https://codehub.example.com/group/sub/project/-/merge_requests/3#note-1')
    ).toEqual({
      provider: 'codehub',
      host: 'codehub.example.com',
      repository: 'group/sub/project',
      kind: 'mr',
      number: 3
    })
    expect(parseTaskItemLink('https://codehub-open.example.com/group/project/issues/4')?.kind).toBe(
      'issue'
    )
  })

  it('拒绝非 HTTP、带认证信息及普通网页', () => {
    for (const url of [
      'file:///owner/project/issues/1',
      'javascript:alert(1)',
      'https://user:secret@github.com/owner/project/issues/1',
      'https://github.com/owner/project',
      'https://example.com/owner/project/issues/1',
      'https://github.com.evil.example/owner/project/pull/1'
    ]) {
      expect(parseTaskItemLink(url)).toBeNull()
    }
  })

  it('拒绝零、负数和超出安全整数的编号', () => {
    for (const provider of ['github.com', 'codehub.example.com']) {
      for (const number of ['0', '-1', '9007199254740992']) {
        expect(parseTaskItemLink(`https://${provider}/owner/project/issues/${number}`)).toBeNull()
      }
    }
  })

  it('解码仓库片段但拒绝编码分隔符、空白及无效编码', () => {
    expect(parseTaskItemLink('https://github.com/%6fwner/project/issues/1')?.repository).toBe(
      'owner/project'
    )
    for (const path of [
      'owner%2Fother/project',
      'owner%5Cother/project',
      'owner%20other/project',
      'owner%ZZ/project'
    ]) {
      expect(parseTaskItemLink(`https://github.com/${path}/issues/1`)).toBeNull()
    }
  })

  it('只将明确登记的 GitHub Enterprise 主机识别为任务平台', () => {
    const enterprise = registeredRepo(
      'enterprise',
      'https://github.example.com:8443/owner/project.git'
    )
    expect(
      parseTaskItemLink('https://github.example.com:8443/owner/other/pull/8', [enterprise])
        ?.provider
    ).toBe('github')
    expect(
      parseTaskItemLink('https://github.example.com/owner/project/pull/8', [enterprise])
    ).toBeNull()
  })

  it('按完整仓库匹配，优先本机副本且不误用同名项目', () => {
    const remote = registeredRepo('remote', 'https://github.com/owner/project.git', {
      executionHostId: 'runtime:remote'
    })
    const local = registeredRepo('local', 'https://github.com/owner/project.git')
    const other = registeredRepo('other', 'https://github.com/other/project.git')
    const link = parseTaskItemLink('https://github.com/owner/project/issues/1')!
    expect(findTaskItemLinkRepo(link, [other, remote, local])).toBe(local)
    expect(findTaskItemLinkRepo(link, [other, remote])).toBe(remote)
    expect(findTaskItemLinkRepo(link, [other])).toBeNull()
  })

  it('显式链接可匹配已登记 fork 的 origin 和 upstream', () => {
    const repo = registeredRepo('fork', 'https://github.com/upstream/project.git', {
      gitRemoteIdentity: {
        canonicalKey: 'github.com/upstream/project',
        remoteName: 'upstream',
        remoteUrl: 'https://github.com/upstream/project.git',
        originUrl: 'https://github.com/fork/project.git'
      },
      issueSourcePreference: 'upstream'
    })
    expect(
      findTaskItemLinkRepo(parseTaskItemLink('https://github.com/fork/project/pull/1')!, [repo])
    ).toBe(repo)
    expect(
      findTaskItemLinkRepo(parseTaskItemLink('https://github.com/upstream/project/issues/1')!, [
        repo
      ])
    ).toBe(repo)
  })

  it('CodeHub 不跨主机、项目或 provider 匹配', () => {
    const repo = registeredRepo('codehub', 'https://codehub.example.com/group/project.git')
    expect(
      findTaskItemLinkRepo(
        parseTaskItemLink('https://codehub.example.com/group/project/-/issues/1')!,
        [repo]
      )
    ).toBe(repo)
    expect(
      findTaskItemLinkRepo(
        parseTaskItemLink('https://codehub-open.example.com/group/project/-/issues/1')!,
        [repo]
      )
    ).toBeNull()
    expect(
      findTaskItemLinkRepo(
        parseTaskItemLink('https://codehub.example.com/other/project/-/issues/1')!,
        [repo]
      )
    ).toBeNull()
    expect(parseTaskItemLink('https://codehub.example.com/group/project/pull/1', [repo])).toBeNull()
  })

  it('规范化主机大小写但保留不同 API 端口', () => {
    const link = parseTaskItemLink('https://CODEHUB.EXAMPLE.COM:8443/group/project/-/issues/7')!
    expect(link.host).toBe('codehub.example.com:8443')
    expect(taskItemLinkIdentityKey(link)).toBe('codehub.example.com:8443/group/project')
    expect(taskItemLinkIdentityKey({ ...link, host: 'codehub.example.com' })).not.toBe(
      taskItemLinkIdentityKey(link)
    )
  })
})
