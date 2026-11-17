import type { Repo } from '../../../shared/repo-types'
import { stripCredentialsFromMessage } from '../../../shared/git-remote-error'

/** Turn a git remote URL into a browser URL when possible. */
export function remoteUrlToWebHref(remoteUrl: string): string | null {
  const cleaned = stripCredentialsFromMessage(remoteUrl)
    .trim()
    .replace(/\.git$/i, '')
  if (!cleaned) {
    return null
  }
  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned
  }
  const scp = /^git@([^:]+):(.+)$/i.exec(cleaned)
  if (scp) {
    return `https://${scp[1]}/${scp[2]}`
  }
  const ssh = /^ssh:\/\/(?:git@)?([^/]+)\/(.+)$/i.exec(cleaned)
  if (ssh) {
    return `https://${ssh[1]}/${ssh[2]}`
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
