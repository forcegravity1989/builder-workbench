export type CodeHubTaskItem = {
  type: 'issue' | 'mr'
  iid: number
  title: string
  state: 'opened' | 'closed' | 'merged'
  url: string
  author: string | null
  assignees: string[]
  reviewers: string[]
  updatedAt: string
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
}

export type CodeHubComment = {
  id: string
  body: string
  author: string | null
  createdAt: string
}

export type CodeHubPipeline = {
  id: string
  status: string
  url: string | null
  ref: string | null
}
