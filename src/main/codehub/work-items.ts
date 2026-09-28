import type { CodeHubRemote } from '../../shared/codehub'
import type { CodeHubTaskItem } from '../../shared/codehub-tasks'
import { runCodeHubCli, type CodeHubExecOptions } from './cli'

export type { CodeHubTaskItem }

function loginOf(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value
  }
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  for (const key of ['username', 'user_name', 'login', 'name']) {
    const login = record[key]
    if (typeof login === 'string' && login.trim()) {
      return login
    }
  }
  return null
}

function namesOf(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const name = loginOf(entry)
      return name ? [name] : []
    })
  }
  const one = loginOf(value)
  return one ? [one] : []
}

function itemUrl(
  remote: CodeHubRemote,
  record: Record<string, unknown>,
  iid: number,
  kind: 'issues' | 'merge_requests'
): string {
  for (const key of ['web_url', 'html_url', 'url']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  const project = remote.project
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `https://${remote.host}/${project}/-/${kind}/${iid}`
}

function mapRow(
  remote: CodeHubRemote,
  value: unknown,
  type: 'issue' | 'mr'
): CodeHubTaskItem | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  const iid = Number(record.iid ?? record.number)
  if (!Number.isFinite(iid)) {
    return null
  }
  const raw = String(record.state ?? 'opened').toLowerCase()
  const state = raw === 'merged' ? 'merged' : raw === 'closed' ? 'closed' : 'opened'
  return {
    type,
    iid,
    title: String(record.title ?? ''),
    state,
    url: itemUrl(remote, record, iid, type === 'issue' ? 'issues' : 'merge_requests'),
    author: loginOf(record.author),
    assignees: namesOf(record.assignees ?? record.assignee),
    reviewers: namesOf(record.reviewers ?? record.approval_reviewers),
    updatedAt: String(record.updated_at ?? record.updatedAt ?? record.created_at ?? ''),
    ...(type === 'mr'
      ? {
          mergedAt:
            typeof (record.merged_at ?? record.mergedAt) === 'string'
              ? String(record.merged_at ?? record.mergedAt)
              : null
        }
      : {})
  }
}

function parseJsonList(stdout: string): unknown[] {
  const text = stdout.trim()
  if (!text || text === 'null') {
    return []
  }
  const parsed = JSON.parse(text) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('codehub-cli list did not return a JSON array')
  }
  return parsed
}

export async function listCodeHubTasks(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  kind: 'issue' | 'mr'
  state: 'opened' | 'closed' | 'merged' | 'all'
  limit?: number
  scope?: 'created_by_me' | 'assigned_to_me' | 'need_my_review'
  search?: string
  author?: string
  assignee?: string
}): Promise<CodeHubTaskItem[]> {
  const limit = args.limit && args.limit > 0 ? Math.floor(args.limit) : 30
  const flags = [
    args.kind,
    'list',
    '-p',
    args.remote.project,
    '-H',
    args.remote.host.replace(/:\d+$/, ''),
    '-f',
    'json',
    '--order-by',
    'updated_at',
    '--sort',
    'desc',
    '--limit',
    String(limit)
  ]
  if (args.state !== 'all') {
    flags.push('--state', args.state)
  }
  if (args.scope && !(args.kind === 'issue' && args.scope === 'need_my_review')) {
    flags.push('--scope', args.scope)
  }
  if (args.kind === 'mr' && args.search?.trim()) {
    flags.push('--search', args.search.trim())
  }
  if (args.kind === 'mr' && args.author?.trim()) {
    flags.push('--author', args.author.trim())
  }
  if (args.kind === 'mr' && args.assignee?.trim()) {
    flags.push('--assignee', args.assignee.trim())
  }
  const stdout = await runCodeHubCli(flags, args.execOptions)
  return parseJsonList(stdout)
    .map((row) => mapRow(args.remote, row, args.kind))
    .filter((item): item is CodeHubTaskItem => item !== null)
}
