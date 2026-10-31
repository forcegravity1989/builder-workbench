import type { GitHubIssueCloseReason } from './issue-mutation-types'
import type { GitRemoteIdentity } from './git-remote-identity'

export type CodeHubRemote = {
  host: string
  project: string
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '')
}

/** A CodeHub hostname is `codehub`, `codehub-*`, or `*.codehub.*`, never a substring match. */
export function isCodeHubHost(host: string | null | undefined): boolean {
  const normalized = normalizeHost(host ?? '').replace(/:\d+$/, '')
  if (!normalized) {
    return false
  }
  const labels = normalized.split('.').filter(Boolean)
  if (labels.includes('github')) {
    return false
  }
  return labels.some((label) => label === 'codehub' || label.startsWith('codehub-'))
}

function extractHost(value: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    try {
      return new URL(value).hostname
    } catch {
      return null
    }
  }
  const scp = /^([^@\s]+@)?([^:\s]+):(.+)$/.exec(value)
  if (scp?.[2]) {
    return scp[2]
  }
  const slash = value.indexOf('/')
  if (slash > 0) {
    return value.slice(0, slash)
  }
  return null
}

export function isCodeHubUrl(value: string | null | undefined): boolean {
  const trimmed = value?.trim()
  if (!trimmed || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return false
  }
  return isCodeHubHost(extractHost(trimmed))
}

export function isCodeHubGitRemote(
  identity: Pick<GitRemoteIdentity, 'remoteUrl' | 'canonicalKey'> | null | undefined
): boolean {
  return isCodeHubUrl(identity?.remoteUrl) || isCodeHubUrl(identity?.canonicalKey)
}

function projectFromPath(path: string): string | null {
  let decoded = path
  try {
    decoded = decodeURIComponent(path)
  } catch {
    decoded = path
  }
  const project = decoded
    .replace(/\.git$/i, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
  const parts = project.split('/').filter(Boolean)
  if (parts.length < 2) {
    return null
  }
  return parts.join('/')
}

function remoteFromHostAndPath(host: string, path: string): CodeHubRemote | null {
  if (!isCodeHubHost(host)) {
    return null
  }
  const project = projectFromPath(path)
  if (!project) {
    return null
  }
  return { host: normalizeHost(host), project }
}

/** Git remote URL or `host/group/.../repo` key. Issue and MR web URLs are not remotes. */
export function parseCodeHubRemote(value: string | null | undefined): CodeHubRemote | null {
  const trimmed = value?.trim()
  if (!trimmed || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return null
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      const protocol = url.protocol.toLowerCase()
      if (!['http:', 'https:', 'ssh:', 'git:', 'git+ssh:'].includes(protocol)) {
        return null
      }
      const host = protocol === 'http:' || protocol === 'https:' ? url.host : url.hostname
      return remoteFromHostAndPath(host, url.pathname)
    } catch {
      return null
    }
  }

  const scp = /^([^@\s]+@)?([^:\s]+):(.+)$/.exec(trimmed)
  if (scp?.[2] && scp[3]) {
    return remoteFromHostAndPath(scp[2], scp[3])
  }

  const slash = trimmed.indexOf('/')
  if (slash <= 0) {
    return null
  }
  return remoteFromHostAndPath(trimmed.slice(0, slash), trimmed.slice(slash + 1))
}

/** One comment per task-page close button. Reopen does not write a comment. */
export function codeHubIssueCloseComment(
  stateReason: GitHubIssueCloseReason | null | undefined,
  duplicateOf: number | string | null | undefined
): string {
  if (stateReason === 'not_planned') {
    return '关闭原因: not planned'
  }
  if (stateReason === 'duplicate') {
    const raw = duplicateOf === undefined || duplicateOf === null ? '' : String(duplicateOf).trim()
    if (!raw) {
      return '关闭原因: duplicate'
    }
    return `关闭原因: duplicate of ${raw.startsWith('#') ? raw : `#${raw}`}`
  }
  return '关闭原因: completed'
}
/** Canonical MR link from an already resolved repository and positive provider iid. */
export function codeHubMergeRequestUrl(
  remote: CodeHubRemote,
  number: number,
  recorded?: string
): string {
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error('CodeHub MR 编号无效')
  }
  const fallback = `https://${remote.host}/${remote.project.split('/').filter(Boolean).map(encodeURIComponent).join('/')}/-/merge_requests/${number}`
  return recorded?.trim() || fallback
}
