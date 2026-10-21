import type { CodeHubRemote } from '../../shared/codehub'
import type { CodeHubComment } from '../../shared/codehub-tasks'
import { runCodeHubCli, type CodeHubExecOptions } from './cli'
import { projectArgs, parseJson, loginOfDetail } from './mutations'

function mapComment(
  value: unknown,
  discussionId: string | null,
  individual: boolean
): CodeHubComment | null {
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
    createdAt: String(record.created_at ?? record.createdAt ?? ''),
    discussionId,
    individual,
    isReply: record.is_reply === true
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
  // `notes`; `issue comment list` returns flat comments. Every MR note keeps
  // its discussion id so `mr review reply` can address it — standalone notes
  // (individual_note) carry their own single-note discussion. Deletion still
  // distinguishes them via `individual`: standalone notes delete by note id
  // alone, notes inside a multi-note discussion need the discussion id too.
  const entries = rows.flatMap((row) => {
    if (!row || typeof row !== 'object') {
      return []
    }
    const record = row as Record<string, unknown>
    if (!Array.isArray(record.notes)) {
      return [{ note: row, discussionId: null, individual: false }]
    }
    const discussionId = record.id === undefined || record.id === null ? null : String(record.id)
    const individual = record.individual_note === true
    return (record.notes as unknown[]).map((note) => ({ note, discussionId, individual }))
  })
  return entries.flatMap(({ note, discussionId, individual }) => {
    const comment = mapComment(note, discussionId, individual)
    return comment ? [comment] : []
  })
}

export async function createCodeHubComment(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  kind: 'issue' | 'mr'
  iid: number
  body: string
  discussionId?: string | null
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
      : args.discussionId
        ? [
            'mr',
            'review',
            // codehub-cli replies within a discussion via the `reply`
            // subcommand; the discussion id is its second positional arg.
            'reply',
            String(args.iid),
            args.discussionId,
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
  discussionId?: string | null
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
          // codehub-cli deletes a note within a discussion via
          // `--discussion-id`; standalone notes take `--note-id` alone.
          ...(args.discussionId ? ['--discussion-id', args.discussionId] : []),
          '--note-id',
          args.commentId,
          ...projectArgs(args.remote),
          '--yes'
        ]
  await runCodeHubCli(command, args.execOptions)
}
