import type { Repo } from '../../../shared/repo-types'
import { isCodeHubHost } from '../../../shared/codehub'
import { stripCredentialsFromMessage } from '../../../shared/git-remote-error'

/**
 * CodeHub 克隆主机与网页主机不一致的站点。绿区用 `codehub-dg-g.huawei.com` 克隆（https 和
 * ssh 都是），但网页在 `codehub-g.huawei.com`。未列出的 CodeHub 主机（如
 * `szv-open.codehub.huawei.com`）克隆主机即网页主机，恒等映射。
 */
const CODEHUB_WEB_HOST_BY_CLONE_HOST: Record<string, string> = {
  'codehub-dg-g.huawei.com': 'codehub-g.huawei.com'
}

/** 去掉主机上的 `:port`，避免 git 的 SSH 端口被带进网页 URL。 */
function stripHostPort(host: string): string {
  return host.replace(/:\d+$/, '')
}

/** 把 CodeHub 克隆主机折成提供网页的主机；未登记的主机原样返回。 */
function codeHubWebHost(cloneHost: string): string {
  const host = stripHostPort(cloneHost).toLowerCase()
  return CODEHUB_WEB_HOST_BY_CLONE_HOST[host] ?? host
}

function trimRemotePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '')
}

/** Turn a git remote URL into a browser URL when possible. */
export function remoteUrlToWebHref(remoteUrl: string): string | null {
  const cleaned = stripCredentialsFromMessage(remoteUrl)
    .trim()
    .replace(/\.git$/i, '')
  if (!cleaned) {
    return null
  }
  if (/^https?:\/\//i.test(cleaned)) {
    // 绿区即使 https 克隆主机也可能不是网页主机，需要折算；其余 https remote 已是可浏览地址，原样返回。
    try {
      const url = new URL(cleaned)
      if (isCodeHubHost(url.hostname)) {
        return `https://${codeHubWebHost(url.hostname)}/${trimRemotePath(url.pathname)}`
      }
    } catch {
      /* fall through to the raw URL */
    }
    return cleaned
  }
  const scp = /^git@([^:]+):(.+)$/i.exec(cleaned)
  if (scp) {
    const host = stripHostPort(scp[1])
    const path = trimRemotePath(scp[2])
    return isCodeHubHost(host)
      ? `https://${codeHubWebHost(host)}/${path}`
      : `https://${host}/${path}`
  }
  const ssh = /^ssh:\/\/(?:git@)?([^/]+)\/(.+)$/i.exec(cleaned)
  if (ssh) {
    const host = stripHostPort(ssh[1])
    const path = trimRemotePath(ssh[2])
    return isCodeHubHost(host)
      ? `https://${codeHubWebHost(host)}/${path}`
      : `https://${host}/${path}`
  }
  return null
}

export function repoLinkLabel(repo: Repo): string {
  const remote = repo.gitRemoteIdentity?.remoteUrl
  if (remote) {
    const href = remoteUrlToWebHref(remote)
    if (href) {
      try {
        const u = new URL(href)
        return u.pathname.replace(/^\//, '') || repo.displayName
      } catch {
        /* fall through */
      }
    }
    const key = repo.gitRemoteIdentity?.canonicalKey
    if (key) {
      return key.includes('/') ? key.slice(key.indexOf('/') + 1) : key
    }
  }
  if (repo.upstream) {
    return `${repo.upstream.owner}/${repo.upstream.repo}`
  }
  return repo.displayName || repo.path
}
