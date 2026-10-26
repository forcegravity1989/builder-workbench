export type CodeHubTaskItem = {
  type: 'issue' | 'mr'
  iid: number
  title: string
  state: 'opened' | 'closed' | 'merged'
  url: string
  author: string | null
  assignees: string[]
  reviewers: string[]
  labels: string[]
  sourceBranch: string | null
  targetBranch: string | null
  updatedAt: string
  mergedAt?: string | null
  repoId?: string
  repoPath?: string
  host?: string
  project?: string
}

export type CodeHubTaskDetail = {
  iid: number
  title: string
  description: string
  state: string
  url: string | null
  author: string | null
  assignees: string[]
  reviewers: string[]
  labels: string[]
  sourceBranch: string | null
  targetBranch: string | null
}

export type CodeHubComment = {
  id: string
  body: string
  author: string | null
  createdAt: string
  // Discussion the note belongs to; `mr review reply` addresses replies by
  // it. Standalone notes carry their own single-note discussion id; issue
  // comments have none.
  discussionId: string | null
  // Standalone notes delete by note id alone (`--note-id` without
  // `--discussion-id`); notes inside a multi-note discussion need both.
  individual: boolean
  isReply: boolean
  // Author avatar from the note's author object; null when the CLI omits it.
  authorAvatarUrl: string | null
  // MR notes carry `from_robot`; issue comments do not (always false there).
  isBot: boolean
  // MR review threads can be resolved; issue comment data has no such field.
  isResolved: boolean
  // Line-level review comments carry the file position; MR-level notes do
  // not (both null).
  path: string | null
  line: number | null
}

export type CodeHubPipeline = {
  id: string
  status: string
  url: string | null
  ref: string | null
}
