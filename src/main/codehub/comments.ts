import type { CodeHubRemote } from '../../shared/codehub'
import type { CodeHubComment } from '../../shared/codehub-tasks'
import { runCodeHubCli, type CodeHubExecOptions } from './cli'
import { projectArgs, parseJson, loginOfDetail } from './mutations'

function mapComment(value: unknown): CodeHubComment | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  if (record.system === true) {
    // Activity records such as "changed this line" are not user comments.
    return null
  }
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
  execOptions?: CodeHubExecOptions
  kind: 'issue' | 'mr'
  iid: number
}): Promise<CodeHubComment[]> {
  const command =
    args.kind === 'issue'
      ? [
          'issue',
          'comment',
          'list',
          String(args.iid),
          ...projectArgs(args.remote),
          '-f',
          'json',
          '--limit',
          '50'
        ]
      : [
          'mr',
          'review',
          'list',
          String(args.iid),
          ...projectArgs(args.remote),
          '-f',
          'json',
          '--limit',
          '50'
        ]
  const parsed = parseJson(await runCodeHubCli(command, args.execOptions))
  const rows = Array.isArray(parsed) ? parsed : []
  // `mr review list` returns discussions whose comments are nested in
  // `notes`; `issue comment list` returns flat comments.
  const entries = rows.flatMap((row) => {
    if (!row || typeof row !== 'object') {
      return []
    }
    const record = row as Record<string, unknown>
    return Array.isArray(record.notes) ? (record.notes as unknown[]) : [row]
  })
  return entries.flatMap((entry) => {
    const comment = mapComment(entry)
    return comment ? [comment] : []
  })
}

export async function createCodeHubComment(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  kind: 'issue' | 'mr'
  iid: number
  body: string
}): Promise<void> {
  const command =
    args.kind === 'issue'
      ? [
          'issue',
          'comment',
          'create',
          String(args.iid),
          '--body',
          args.body,
          ...projectArgs(args.remote)
        ]
      : [
          'mr',
          'review',
          'create',
          String(args.iid),
          '--body',
          args.body,
          ...projectArgs(args.remote)
        ]
  await runCodeHubCli(command, args.execOptions)
}

export async function deleteCodeHubComment(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  kind: 'issue' | 'mr'
  iid: number
  commentId: string
}): Promise<void> {
  const command =
    args.kind === 'issue'
      ? [
          'issue',
          'comment',
          'delete',
          String(args.iid),
          args.commentId,
          ...projectArgs(args.remote),
          '--yes'
        ]
      : [
          'mr',
          'review',
          'delete',
          String(args.iid),
          '--note-id',
          args.commentId,
          ...projectArgs(args.remote),
          '--yes'
        ]
  await runCodeHubCli(command, args.execOptions)
}
