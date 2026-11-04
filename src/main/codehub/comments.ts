import type { CodeHubRemote } from '../../shared/codehub'
import type { CodeHubComment } from '../../shared/codehub-tasks'
import { runCodeHubCli, type CodeHubExecOptions } from './cli'
import { projectArgs, parseJson, loginOfDetail } from './mutations'

function avatarUrlOf(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const url = (value as Record<string, unknown>).avatar_url
  return typeof url === 'string' && url.trim() ? url.trim() : null
}

function noteLineOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

function mapComment(
  value: unknown,
  discussionId: string | null,
  individual: boolean
): CodeHubComment | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  const id = record.id ?? record.note_id ?? record.noteId
  if (id === undefined || id === null) {
    return null
  }
  const author = record.author ?? record.user
  // Line-anchored notes arrive in two shapes: some hosts fill the top-level
  // file_path/line, others (szv-open) leave them null and tuck the anchor
  // into the nested position object. Read the top-level first, then fall
  // back to position, or inline cards never anchor on the latter hosts.
  const position =
    record.position && typeof record.position === 'object'
      ? (record.position as Record<string, unknown>)
      : null
  const path = record.file_path ?? position?.new_path
  return {
    id: String(id),
    body: String(record.body ?? record.note ?? record.description ?? ''),
    author: loginOfDetail(author),
    createdAt: String(record.created_at ?? record.createdAt ?? ''),
    discussionId,
    individual,
    isReply: record.is_reply === true,
    authorAvatarUrl: avatarUrlOf(author),
    isBot: record.from_robot === true,
    isResolved: record.resolved === true,
    path: typeof path === 'string' && path.trim() ? path.trim() : null,
    line: noteLineOf(record.line ?? position?.new_line),
    isOutdated: record.is_outdated === true
  }
}

export async function listCodeHubComments(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  kind: 'issue' | 'mr'
  iid: number
  requireComplete?: boolean
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
  const rows: unknown[] = []
  const seen = new Set<string>()
  const seenNotes = new Set<string>()
  for (let page = 0; ; page++) {
    if (page >= 100) {
      throw new Error('CodeHub指标评论分页超出读取上限，无法确认完整结果')
    }
    const stdout = await runCodeHubCli(
      args.requireComplete
        ? [
            ...command,
            '--offset',
            String(rows.length),
            '--order-by',
            'created_at',
            '--sort',
            'asc',
            '--no-cache'
          ]
        : command,
      args.execOptions
    )
    const parsed = parseJson(stdout)
    // v1.3.4 returns JSON null for an empty page; empty stdout is not that contract.
    const pageRows = parsed === null && stdout.trim() === 'null' ? [] : parsed
    if (args.requireComplete && (!Array.isArray(pageRows) || pageRows.length > 50)) {
      throw new Error('CodeHub指标评论分页格式无效，无法确认完整结果')
    }
    const current = Array.isArray(pageRows) ? pageRows : []
    if (args.requireComplete) {
      for (const row of current) {
        if (!row || typeof row !== 'object') {
          throw new Error('CodeHub指标评论记录无效')
        }
        const record = row as Record<string, unknown>
        const id = record.id ?? record.note_id ?? record.noteId
        if ((typeof id !== 'string' && typeof id !== 'number') || String(id).trim() === '') {
          throw new Error('CodeHub指标评论缺少分页标识')
        }
        if (seen.has(String(id))) {
          throw new Error('CodeHub指标评论分页重复，无法确认完整结果')
        }
        seen.add(String(id))
        const notes = Array.isArray(record.notes) ? record.notes : [record]
        for (const note of notes) {
          const noteId = note?.id ?? note?.note_id ?? note?.noteId
          if (
            !note ||
            typeof note !== 'object' ||
            (typeof noteId !== 'string' && typeof noteId !== 'number') ||
            String(noteId).trim() === '' ||
            typeof (note.body ?? note.note ?? note.description) !== 'string'
          ) {
            throw new Error('CodeHub指标评论字段不完整')
          }
          if (seenNotes.has(String(noteId))) {
            throw new Error('CodeHub指标评论记录重复，无法确认完整结果')
          }
          seenNotes.add(String(noteId))
        }
      }
    }
    rows.push(...current)
    if (!args.requireComplete || current.length < 50) {
      break
    }
  }
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
  path?: string | null
  line?: number | null
  startLine?: number | null
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
        : args.path && args.line
          ? [
              'mr',
              'review',
              'create',
              String(args.iid),
              '--body',
              args.body,
              // --path + --line make the note a line-anchored DiffNote;
              // --start-line covers a multi-line range. The CLI fetches the
              // MR's diff_refs by itself, so no commit anchors are passed.
              '--path',
              args.path,
              '--line',
              String(args.line),
              ...(args.startLine && args.startLine !== args.line
                ? ['--start-line', String(args.startLine)]
                : []),
              // Line-level notes hit CodeHub's review API, whose
              // note_required_attributes.severity is on: an empty value is
              // rejected with CH.00406030. "suggestion" is the mildest
              // level; the GitHub-parity card exposes no severity picker.
              '--severity',
              'suggestion',
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
