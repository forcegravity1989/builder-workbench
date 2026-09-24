import { z } from 'zod'
import type { CodeHubRemote } from './codehub'
import type {
  CodeHubComment,
  CodeHubPipeline,
  CodeHubTaskDetail,
  CodeHubTaskItem
} from './codehub-tasks'

const Repo = z.object({ repoPath: z.string().min(1), repoId: z.string().nullish() })
const Iid = z.number().int().positive()
const Kind = z.enum(['issue', 'mr'])
export type CodeHubRepoArgs = z.infer<typeof Repo>

export const CodeHubListTasks = Repo.extend({
  kind: Kind,
  state: z.enum(['opened', 'closed', 'merged', 'all']),
  limit: z.number().int().positive().optional(),
  scope: z.enum(['created_by_me', 'assigned_to_me', 'need_my_review']).optional(),
  search: z.string().optional(),
  author: z.string().optional(),
  assignee: z.string().optional()
})
export const CodeHubCreateIssue = Repo.extend({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  assignee: z.string().optional()
})
export const CodeHubUpdateIssueTitle = Repo.extend({ iid: Iid, title: z.string().trim().min(1) })
export const CodeHubSetIssueState = Repo.extend({
  iid: Iid,
  state: z.enum(['open', 'closed']),
  stateReason: z.enum(['completed', 'not_planned', 'duplicate']).nullish(),
  duplicateOf: Iid.nullish()
})
export const CodeHubCloseMr = Repo.extend({ iid: Iid })
export const CodeHubAssignIssue = Repo.extend({ iid: Iid, assignee: z.string() })
export const CodeHubMergeMr = Repo.extend({ iid: Iid, auto: z.boolean().optional() })
export const CodeHubSetReviewers = Repo.extend({ iid: Iid, reviewers: z.array(z.string()) })
export const CodeHubListPipelines = Repo.extend({ iid: Iid })
export const CodeHubViewTask = Repo.extend({ kind: Kind, iid: Iid })
export const CodeHubListComments = Repo.extend({ kind: Kind, iid: Iid })
export const CodeHubCreateComment = Repo.extend({ kind: Kind, iid: Iid, body: z.string() })
export const CodeHubDeleteComment = Repo.extend({
  kind: Kind,
  iid: Iid,
  commentId: z.string().min(1)
})

export const CODEHUB_REQUEST_SCHEMAS = {
  listTasks: CodeHubListTasks,
  createIssue: CodeHubCreateIssue,
  updateIssueTitle: CodeHubUpdateIssueTitle,
  setIssueState: CodeHubSetIssueState,
  closeMr: CodeHubCloseMr,
  assignIssue: CodeHubAssignIssue,
  mergeMr: CodeHubMergeMr,
  setReviewers: CodeHubSetReviewers,
  listPipelines: CodeHubListPipelines,
  viewTask: CodeHubViewTask,
  listComments: CodeHubListComments,
  createComment: CodeHubCreateComment,
  deleteComment: CodeHubDeleteComment
}

export type CodeHubApi = {
  listTasks: (
    args: z.infer<typeof CodeHubListTasks>
  ) => Promise<{ remote: CodeHubRemote; items: CodeHubTaskItem[]; hasMore: boolean }>
  createIssue: (
    args: z.infer<typeof CodeHubCreateIssue>
  ) => Promise<{ iid: number | null; url: string | null; title: string }>
  updateIssueTitle: (args: z.infer<typeof CodeHubUpdateIssueTitle>) => Promise<void>
  setIssueState: (args: z.infer<typeof CodeHubSetIssueState>) => Promise<void>
  closeMr: (args: z.infer<typeof CodeHubCloseMr>) => Promise<void>
  assignIssue: (args: z.infer<typeof CodeHubAssignIssue>) => Promise<void>
  mergeMr: (args: z.infer<typeof CodeHubMergeMr>) => Promise<void>
  setReviewers: (args: z.infer<typeof CodeHubSetReviewers>) => Promise<void>
  listPipelines: (args: z.infer<typeof CodeHubListPipelines>) => Promise<CodeHubPipeline[]>
  viewTask: (args: z.infer<typeof CodeHubViewTask>) => Promise<CodeHubTaskDetail>
  listComments: (args: z.infer<typeof CodeHubListComments>) => Promise<CodeHubComment[]>
  createComment: (args: z.infer<typeof CodeHubCreateComment>) => Promise<void>
  deleteComment: (args: z.infer<typeof CodeHubDeleteComment>) => Promise<void>
}
export type CodeHubListTasksArgs = Parameters<CodeHubApi['listTasks']>[0]
export type CodeHubListTasksResult = Awaited<ReturnType<CodeHubApi['listTasks']>>

export const CODEHUB_RPC_METHOD_NAMES = Object.keys(CODEHUB_REQUEST_SCHEMAS).map(
  (name) => `codehub.${name}`
)
