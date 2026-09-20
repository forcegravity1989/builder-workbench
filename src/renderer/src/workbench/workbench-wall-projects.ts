import type { ProjectGroup } from '../../../shared/project-group-types'
import type { Repo } from '../../../shared/repo-types'
import { stripCredentialsFromMessage } from '../../../shared/git-remote-error'

export type WallRepoSlot = {
  repoId: string
  name: string
  path: string
  /** Display label for the remote (owner/repo or host/path). */
  linkLabel: string
  /** https URL when we can derive one; otherwise null (show path only). */
  href: string | null
  remoteUrl: string | null
}

export type WallProject = {
  /** `group:<id>` or `solo:<repoId>` */
  key: string
  groupId: string | null
  name: string
  primaryRepoId: string
  repoIds: string[]
  slots: WallRepoSlot[]
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

export function toWallRepoSlot(repo: Repo): WallRepoSlot {
  const remoteUrl = repo.gitRemoteIdentity?.remoteUrl
    ? stripCredentialsFromMessage(repo.gitRemoteIdentity.remoteUrl)
    : null
  return {
    repoId: repo.id,
    name: repo.displayName || '未命名仓',
    path: repo.path,
    linkLabel: repoLinkLabel(repo),
    href: remoteUrl ? remoteUrlToWebHref(remoteUrl) : null,
    remoteUrl
  }
}

/**
 * Build wall projects: each ProjectGroup with members is one card;
 * ungrouped repos are solo cards.
 */
export function buildWallProjects(
  repos: readonly Repo[],
  groups: readonly ProjectGroup[]
): WallProject[] {
  const groupedIds = new Set<string>()
  const projects: WallProject[] = []

  const orderedGroups = [...groups].sort(
    (a, b) => a.tabOrder - b.tabOrder || a.name.localeCompare(b.name)
  )
  for (const g of orderedGroups) {
    const members = repos
      .filter((r) => r.projectGroupId === g.id)
      .sort((a, b) => (a.projectGroupOrder ?? 0) - (b.projectGroupOrder ?? 0))
    if (members.length === 0) {
      continue
    }
    for (const m of members) {
      groupedIds.add(m.id)
    }
    projects.push({
      key: `group:${g.id}`,
      groupId: g.id,
      name: g.name,
      primaryRepoId: members[0].id,
      repoIds: members.map((m) => m.id),
      slots: members.map(toWallRepoSlot)
    })
  }

  for (const r of repos) {
    if (groupedIds.has(r.id)) {
      continue
    }
    projects.push({
      key: `solo:${r.id}`,
      groupId: null,
      name: r.displayName || '未命名项目',
      primaryRepoId: r.id,
      repoIds: [r.id],
      slots: [toWallRepoSlot(r)]
    })
  }

  return projects
}
