import {
  assertCodeHubDetailIdentity,
  parseCodeHubRemote,
  type CodeHubRemote
} from '../../shared/codehub'
import { runCodeHubCli, type CodeHubExecOptions } from './cli'

/** Trust a different web host only when the provider proves the registered clone identity. */
export async function resolveCodeHubWebIdentity(
  remote: CodeHubRemote,
  url: string,
  execOptions?: CodeHubExecOptions
): Promise<CodeHubRemote> {
  const actual = new URL(url)
  if (!['http:', 'https:'].includes(actual.protocol)) {
    throw new Error('CodeHub 返回的链接协议无效')
  }
  if (actual.host === remote.host || actual.host === remote.webHost) {
    return remote
  }
  const record = JSON.parse(
    await runCodeHubCli(
      ['project', 'view', '-p', remote.project, '-H', remote.host, '-f', 'json'],
      execOptions
    )
  ) as Record<string, unknown>
  const web = parseCodeHubRemote(typeof record.web_url === 'string' ? record.web_url : null)
  const sameProject = (project: string) => project.toLowerCase() === remote.project.toLowerCase()
  const cloneMatches = [record.http_url_to_repo, record.ssh_url_to_repo].some((value) => {
    const clone = parseCodeHubRemote(typeof value === 'string' ? value : null)
    return clone?.host === remote.host && sameProject(clone.project)
  })
  if (
    !web ||
    web.host !== actual.host ||
    !sameProject(web.project) ||
    !cloneMatches ||
    typeof record.path_with_namespace !== 'string' ||
    !sameProject(record.path_with_namespace)
  ) {
    throw new Error('CodeHub 项目网页来源与注册克隆来源不一致')
  }
  return { ...remote, webHost: web.host }
}

export async function verifyCodeHubTaskIdentity(
  args: {
    remote: CodeHubRemote
    kind: 'issue' | 'mr'
    iid: number
    execOptions?: CodeHubExecOptions
  },
  iid: unknown,
  url: unknown
): Promise<CodeHubRemote> {
  const remote =
    args.kind === 'mr' && typeof url === 'string' && url.trim()
      ? await resolveCodeHubWebIdentity(args.remote, url, args.execOptions)
      : args.remote
  assertCodeHubDetailIdentity({ ...args, remote }, iid, url)
  return remote
}

export async function resolveCodeHubRepositoryIdentity(
  remote: CodeHubRemote,
  repository: string,
  execOptions?: CodeHubExecOptions
): Promise<CodeHubRemote> {
  const recorded = parseCodeHubRemote(repository)
  if (!recorded) {
    return remote
  }
  return resolveCodeHubWebIdentity(
    remote,
    `https://${recorded.host}/${recorded.project}`,
    execOptions
  )
}
