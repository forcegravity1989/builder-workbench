import type { CodeHubRemote } from '../../shared/codehub'
import type { CodeHubPipeline, CodeHubTaskDetail } from '../../shared/codehub-tasks'
import { runCodeHubCli, type CodeHubExecOptions } from './cli'

export function projectArgs(remote: CodeHubRemote): string[] {
  return ['-p', remote.project, '-H', remote.host.replace(/:\d+$/, '')]
}

export function parseJson(stdout: string): unknown {
  const text = stdout.trim()
  if (!text) {
    return null
  }
  return JSON.parse(text) as unknown
}

export async function createCodeHubIssue(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  title: string
  description?: string
  assignee?: string
}): Promise<{ iid: number | null; url: string | null; title: string }> {
  const flags = [
    'issue',
    'create',
    '--title',
    args.title,
    ...projectArgs(args.remote),
    '-f',
    'json'
  ]
  const description = args.description?.trim()
  if (description) {
    flags.push('--description', description)
  }
  const assignee = args.assignee?.trim()
  if (assignee) {
    flags.push('--assignee', assignee)
  }
  const parsed = parseJson(await runCodeHubCli(flags, args.execOptions))
  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  const iid = Number(record.iid ?? record.number)
  const url = record.web_url ?? record.html_url ?? record.url
  return {
    iid: Number.isFinite(iid) ? iid : null,
    url: typeof url === 'string' ? url : null,
    title: typeof record.title === 'string' ? record.title : args.title
  }
}

export async function assignCodeHubIssue(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  iid: number
  assignee: string
}): Promise<void> {
  await runCodeHubCli(
    ['issue', 'update', String(args.iid), '--assignee', args.assignee, ...projectArgs(args.remote)],
    args.execOptions
  )
}

export async function updateCodeHubIssueTitle(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  iid: number
  title: string
}): Promise<void> {
  const title = args.title.trim()
  if (!title) {
    throw new Error('Title is required')
  }
  await runCodeHubCli(
    ['issue', 'update', String(args.iid), '--title', title, ...projectArgs(args.remote)],
    args.execOptions
  )
}

export async function closeCodeHubMr(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  iid: number
}): Promise<void> {
  await runCodeHubCli(
    ['mr', 'close', String(args.iid), ...projectArgs(args.remote)],
    args.execOptions
  )
}

/** Open MR iid whose source branch is `sourceBranch`; null when none. */
export async function openCodeHubMrForBranch(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  sourceBranch: string
}): Promise<number | null> {
  const stdout = await runCodeHubCli(
    [
      'mr',
      'list',
      ...projectArgs(args.remote),
      '--source-branch',
      args.sourceBranch,
      '--state',
      'opened',
      '--jq',
      '.[0].iid'
    ],
    args.execOptions
  )
  const text = stdout.trim()
  if (!text || text === 'null') {
    return null
  }
  const iid = Number(text)
  return Number.isFinite(iid) ? iid : null
}

/**
 * Create an MR for `sourceBranch`, adopting an already-open one instead of
 * failing (main create_mr_on_branch semantics). Target branch must be resolved
 * by the caller (CodeHub has no implicit default).
 */
export async function createCodeHubMr(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  sourceBranch: string
  targetBranch: string
  title: string
  description: string
}): Promise<{ iid: number; adopted: boolean; url: string | null }> {
  const existing = await openCodeHubMrForBranch(args)
  if (existing !== null) {
    return { iid: existing, adopted: true, url: null }
  }
  const stdout = await runCodeHubCli(
    [
      'mr',
      'create',
      ...projectArgs(args.remote),
      '--source-branch',
      args.sourceBranch,
      '--target-branch',
      args.targetBranch,
      '--title',
      args.title,
      '--description',
      args.description,
      '--jq',
      '.iid'
    ],
    args.execOptions
  )
  const text = stdout.trim()
  const iid = Number(text)
  if (!Number.isFinite(iid)) {
    throw new Error(`无法解析 codehub MR iid：${text || '(空输出)'}`)
  }
  return { iid, adopted: false, url: null }
}

export async function mergeCodeHubMr(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  iid: number
  auto?: boolean
}): Promise<void> {
  const flags = ['mr', 'merge', String(args.iid), '--yes', ...projectArgs(args.remote)]
  if (args.auto) {
    flags.push('--auto')
  }
  await runCodeHubCli(flags, args.execOptions)
}

export async function setCodeHubReviewers(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  iid: number
  reviewers: string[]
}): Promise<void> {
  const reviewers = args.reviewers.map((name) => name.trim()).filter(Boolean)
  if (reviewers.length === 0) {
    throw new Error('At least one reviewer is required')
  }
  await runCodeHubCli(
    [
      'mr',
      'update',
      String(args.iid),
      '--reviewers',
      reviewers.join(','),
      ...projectArgs(args.remote)
    ],
    args.execOptions
  )
}

function namesOf(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const one = loginOfDetail(value)
    return one ? [one] : []
  }
  return value.flatMap((entry) => {
    const name = loginOfDetail(entry)
    return name ? [name] : []
  })
}

export function loginOfDetail(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  for (const key of ['username', 'user_name', 'login', 'name']) {
    const login = record[key]
    if (typeof login === 'string' && login.trim()) {
      return login.trim()
    }
  }
  return null
}

function plainText(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = plainText(value as Record<string, unknown>, [
        'markdown',
        'raw',
        'text',
        'body',
        'content',
        'description'
      ])
      if (nested) {
        return nested
      }
    }
  }
  return null
}

function detailRecord(parsed: unknown): Record<string, unknown> {
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim()
    if (!trimmed) {
      return {}
    }
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return detailRecord(JSON.parse(trimmed) as unknown)
      } catch {
        return { description: trimmed }
      }
    }
    return { description: trimmed }
  }
  if (Array.isArray(parsed)) {
    return detailRecord(parsed[0])
  }
  if (!parsed || typeof parsed !== 'object') {
    return {}
  }
  const record = parsed as Record<string, unknown>
  for (const key of ['issue', 'merge_request', 'data', 'result']) {
    const nested = record[key]
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
      continue
    }
    const inner = nested as Record<string, unknown>
    if (
      inner.title !== undefined ||
      inner.description !== undefined ||
      inner.body !== undefined ||
      inner.content !== undefined ||
      inner.iid !== undefined
    ) {
      return { ...record, ...inner }
    }
  }
  return record
}

export async function viewCodeHubTask(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  kind: 'issue' | 'mr'
  iid: number
}): Promise<CodeHubTaskDetail> {
  const record = detailRecord(
    parseJson(
      await runCodeHubCli(
        [args.kind, 'view', String(args.iid), ...projectArgs(args.remote), '-f', 'json'],
        args.execOptions
      )
    )
  )
  const url = record.web_url ?? record.html_url ?? record.url
  return {
    iid: args.iid,
    title: String(record.title ?? ''),
    description:
      plainText(record, ['description', 'body', 'content', 'desc', 'markdown', 'note']) ?? '',
    state: String(record.state ?? 'opened'),
    url: typeof url === 'string' ? url : null,
    author: loginOfDetail(record.author),
    assignees: namesOf(record.assignees ?? record.assignee),
    reviewers: namesOf(record.reviewers ?? record.approval_reviewers),
    labels: namesOf(record.labels),
    sourceBranch: plainText(record, ['source_branch', 'sourceBranch']),
    targetBranch: plainText(record, ['target_branch', 'targetBranch'])
  }
}

export async function listCodeHubPipelines(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  iid: number
}): Promise<CodeHubPipeline[]> {
  const parsed = parseJson(
    await runCodeHubCli(
      ['mr', 'pipeline', String(args.iid), ...projectArgs(args.remote), '-f', 'json'],
      args.execOptions
    )
  )
  const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') {
      return []
    }
    const record = row as Record<string, unknown>
    const id = record.id ?? record.iid
    if (id === undefined || id === null) {
      return []
    }
    const url = record.web_url ?? record.url
    const ref = record.ref ?? record.sha
    return [
      {
        id: String(id),
        status: String(record.status ?? record.state ?? 'unknown'),
        url: typeof url === 'string' ? url : null,
        ref: typeof ref === 'string' ? ref : null
      }
    ]
  })
}
