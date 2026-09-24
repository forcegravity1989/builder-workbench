import type { CodeHubRemote } from '../../shared/codehub'
import type { CodeHubComment, CodeHubPipeline, CodeHubTaskDetail } from '../../shared/codehub-tasks'
import { runCodeHubCli } from './cli'

function projectArgs(remote: CodeHubRemote): string[] {
  return ['-p', remote.project, '-H', remote.host.replace(/:\d+$/, '')]
}

function parseJson(stdout: string): unknown {
  const text = stdout.trim()
  if (!text) {
    return null
  }
  return JSON.parse(text) as unknown
}

export async function createCodeHubIssue(args: {
  remote: CodeHubRemote
  repoPath: string
  title: string
  description?: string
  assignee?: string
}): Promise<{ iid: number | null; url: string | null; title: string }> {
  const flags = ['issue', 'create', '--title', args.title, ...projectArgs(args.remote), '-f', 'json']
  const description = args.description?.trim()
  if (description) {
    flags.push('--description', description)
  }
  const assignee = args.assignee?.trim()
  if (assignee) {
    flags.push('--assignee', assignee)
  }
  const parsed = parseJson(await runCodeHubCli(flags, { cwd: args.repoPath }))
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
  repoPath: string
  iid: number
  assignee: string
}): Promise<void> {
  await runCodeHubCli(
    ['issue', 'update', String(args.iid), '--assignee', args.assignee, ...projectArgs(args.remote)],
    { cwd: args.repoPath }
  )
}

export async function updateCodeHubIssueTitle(args: {
  remote: CodeHubRemote
  repoPath: string
  iid: number
  title: string
}): Promise<void> {
  const title = args.title.trim()
  if (!title) {
    throw new Error('Title is required')
  }
  await runCodeHubCli(
    ['issue', 'update', String(args.iid), '--title', title, ...projectArgs(args.remote)],
    { cwd: args.repoPath }
  )
}

export async function closeCodeHubMr(args: {
  remote: CodeHubRemote
  repoPath: string
  iid: number
}): Promise<void> {
  await runCodeHubCli(
    ['mr', 'close', String(args.iid), ...projectArgs(args.remote)],
    { cwd: args.repoPath }
  )
}

export async function mergeCodeHubMr(args: {
  remote: CodeHubRemote
  repoPath: string
  iid: number
  auto?: boolean
}): Promise<void> {
  const flags = ['mr', 'merge', String(args.iid), '--yes', ...projectArgs(args.remote)]
  if (args.auto) {
    flags.push('--auto')
  }
  await runCodeHubCli(flags, { cwd: args.repoPath })
}

export async function setCodeHubReviewers(args: {
  remote: CodeHubRemote
  repoPath: string
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
    { cwd: args.repoPath }
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

function loginOfDetail(value: unknown): string | null {
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

export async function viewCodeHubTask(args: {
  remote: CodeHubRemote
  repoPath: string
  kind: 'issue' | 'mr'
  iid: number
}): Promise<CodeHubTaskDetail> {
  const parsed = parseJson(
    await runCodeHubCli(
      [args.kind, 'view', String(args.iid), ...projectArgs(args.remote), '-f', 'json'],
      { cwd: args.repoPath }
    )
  )
  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  const url = record.web_url ?? record.html_url ?? record.url
  return {
    iid: args.iid,
    title: String(record.title ?? ''),
    description: String(record.description ?? record.body ?? ''),
    state: String(record.state ?? 'opened'),
    url: typeof url === 'string' ? url : null,
    author: loginOfDetail(record.author),
    assignees: namesOf(record.assignees ?? record.assignee),
    reviewers: namesOf(record.reviewers ?? record.approval_reviewers)
  }
}

function mapComment(value: unknown): CodeHubComment | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  const id = record.id ?? record.note_id ?? record.noteId
  if (id === undefined || id === null) {
    return null
  }
  return {
    id: String(id),
    body: String(record.body ?? record.note ?? record.description ?? ''),
    author: loginOfDetail(record.author ?? record.user),
    createdAt: String(record.created_at ?? record.createdAt ?? '')
  }
}

export async function listCodeHubComments(args: {
  remote: CodeHubRemote
  repoPath: string
  kind: 'issue' | 'mr'
  iid: number
}): Promise<CodeHubComment[]> {
  const command =
    args.kind === 'issue'
      ? ['issue', 'comment', 'list', String(args.iid), ...projectArgs(args.remote), '-f', 'json', '--limit', '50']
      : ['mr', 'review', 'list', String(args.iid), ...projectArgs(args.remote), '-f', 'json', '--limit', '50']
  const parsed = parseJson(await runCodeHubCli(command, { cwd: args.repoPath }))
  const rows = Array.isArray(parsed) ? parsed : []
  return rows.flatMap((row) => {
    const comment = mapComment(row)
    return comment ? [comment] : []
  })
}

export async function createCodeHubComment(args: {
  remote: CodeHubRemote
  repoPath: string
  kind: 'issue' | 'mr'
  iid: number
  body: string
}): Promise<void> {
  const command =
    args.kind === 'issue'
      ? ['issue', 'comment', 'create', String(args.iid), '--body', args.body, ...projectArgs(args.remote)]
      : ['mr', 'review', 'create', String(args.iid), '--body', args.body, ...projectArgs(args.remote)]
  await runCodeHubCli(command, { cwd: args.repoPath })
}

export async function deleteCodeHubComment(args: {
  remote: CodeHubRemote
  repoPath: string
  kind: 'issue' | 'mr'
  iid: number
  commentId: string
}): Promise<void> {
  const command =
    args.kind === 'issue'
      ? ['issue', 'comment', 'delete', String(args.iid), args.commentId, ...projectArgs(args.remote), '--yes']
      : ['mr', 'review', 'delete', String(args.iid), '--note-id', args.commentId, ...projectArgs(args.remote), '--yes']
  await runCodeHubCli(command, { cwd: args.repoPath })
}

export async function listCodeHubPipelines(args: {
  remote: CodeHubRemote
  repoPath: string
  iid: number
}): Promise<CodeHubPipeline[]> {
  const parsed = parseJson(
    await runCodeHubCli(
      ['mr', 'pipeline', String(args.iid), ...projectArgs(args.remote), '-f', 'json'],
      { cwd: args.repoPath }
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
