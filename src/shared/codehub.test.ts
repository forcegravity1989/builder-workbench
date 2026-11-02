import { describe, expect, it } from 'vitest'
import {
  assertCodeHubDetailIdentity,
  codeHubIssueCloseComment,
  isCodeHubGitRemote,
  isCodeHubHost,
  isCodeHubUrl,
  parseCodeHubRemote
} from './codehub'

describe('codehub host detection', () => {
  it('matches codehub hosts and nested project paths', () => {
    expect(isCodeHubHost('codehub-g.huawei.com')).toBe(true)
    expect(isCodeHubHost('open.codehub.huawei.com')).toBe(true)
    expect(isCodeHubHost('codehub.example.com')).toBe(true)
    expect(isCodeHubHost('github.com')).toBe(false)
    expect(isCodeHubHost('gitlab.com')).toBe(false)
    expect(isCodeHubHost('notcodehub.example.com')).toBe(false)

    expect(parseCodeHubRemote('https://codehub-g.huawei.com/Org/Group/repo.git')).toEqual({
      host: 'codehub-g.huawei.com',
      project: 'Org/Group/repo'
    })
    expect(parseCodeHubRemote('git@codehub-g.huawei.com:Org/Group/repo.git')).toEqual({
      host: 'codehub-g.huawei.com',
      project: 'Org/Group/repo'
    })
    expect(parseCodeHubRemote('codehub-g.huawei.com/org/group/repo')).toEqual({
      host: 'codehub-g.huawei.com',
      project: 'org/group/repo'
    })
    expect(parseCodeHubRemote('https://github.com/acme/widgets.git')).toBeNull()
  })

  it('treats issue and merge request URLs as CodeHub without using them as the project path', () => {
    const issueUrl = 'https://codehub-g.huawei.com/Org/Group/repo/-/issues/12'
    expect(isCodeHubUrl(issueUrl)).toBe(true)
    expect(isCodeHubUrl('https://github.com/acme/widgets/issues/12')).toBe(false)
    expect(
      isCodeHubGitRemote({ remoteUrl: issueUrl, canonicalKey: 'github.com/acme/widgets' })
    ).toBe(true)
    const remote = {
      host: 'git.codehub.example.com',
      webHost: 'codehub.example.com',
      project: 'Org/Group/repo'
    }
    const request = { remote, kind: 'mr' as const, iid: 12 }
    for (const host of [remote.host, remote.webHost]) {
      expect(() =>
        assertCodeHubDetailIdentity(
          request,
          12,
          `https://${host}/${remote.project}/merge_requests/12`
        )
      ).not.toThrow()
    }
    for (const url of [
      'https://other.codehub.example.com/Org/Group/repo/merge_requests/12',
      `https://${remote.webHost}/Other/repo/merge_requests/12`,
      `https://${remote.webHost}/${remote.project}/merge_requests/13`
    ]) {
      expect(() => assertCodeHubDetailIdentity(request, 12, url)).toThrow('来源不一致')
    }
    expect(() =>
      assertCodeHubDetailIdentity(
        request,
        13,
        `https://${remote.webHost}/${remote.project}/merge_requests/12`
      )
    ).toThrow('编号与请求不一致')
  })

  it('maps the three close buttons onto one comment each', () => {
    expect(codeHubIssueCloseComment('completed', null)).toBe('关闭原因: completed')
    expect(codeHubIssueCloseComment(undefined, null)).toBe('关闭原因: completed')
    expect(codeHubIssueCloseComment('not_planned', null)).toBe('关闭原因: not planned')
    expect(codeHubIssueCloseComment('duplicate', 42)).toBe('关闭原因: duplicate of #42')
    expect(codeHubIssueCloseComment('duplicate', '#7')).toBe('关闭原因: duplicate of #7')
  })
})
