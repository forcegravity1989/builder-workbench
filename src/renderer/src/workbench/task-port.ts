import type { AppState } from '@/store/types'
import type { CodeHubTaskDetail } from '../../../shared/codehub-tasks'
import type { WorkItemsBatchResult } from '../../../shared/github/work-item-batch-types'
import type { GitHubWorkItem } from '../../../shared/github/work-item-types'
import type { Repo } from '../../../shared/repo-types'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import { codeHubTaskItemFromDetail } from './codehub-task-item'
import {
  createTaskReferenceReader,
  cycleTaskRead,
  type TaskReferenceReader
} from './task-reference-reader'
import {
  requireSourceContext,
  resolveReferenceRepo,
  viewCodeHubTaskByIid
} from './task-reference-repo'
import type {
  CycleScope,
  CycleTaskRead,
  CycleTaskReference,
  CycleTaskSnapshot,
  TaskOrigin,
  TaskPort
} from './version-cycle/ports'

/** Reads/writes go through the same native provider layer the Tasks page uses;
 * BW keeps references and point-in-time snapshots only — never issue bodies or
 * a second source of truth for work state. */
export type TaskPortDeps = {
  repos(): readonly Repo[]
  lookupGitHubWorkItems?(args: {
    host?: string | null
    owner: string
    repo: string
    numbers: number[]
  }): Promise<WorkItemsBatchResult>
  lookupGitHubWorkItem(args: {
    repoPath: string
    repoId: string
    sourceContext?: TaskSourceContext | null
    number: number
  }): Promise<Omit<GitHubWorkItem, 'repoId'> | null>
  viewCodeHubTask(args: {
    repoPath: string
    repoId?: string
    kind: 'issue' | 'mr'
    iid: number
  }): Promise<CodeHubTaskDetail>
  openTaskPage: AppState['openTaskPage']
  now(): string
}

export { resolveReferenceRepo, viewCodeHubTaskByIid } from './task-reference-repo'

/** Point reads use the same native-row mapping as the three list screens. */
export async function readReference(
  deps: TaskPortDeps,
  scope: Pick<CycleScope, 'repoId' | 'hostId'>,
  reference: CycleTaskReference
): Promise<CycleTaskSnapshot> {
  const [value] = await createTaskReferenceReader(deps).read(scope, [reference])
  const read = cycleTaskRead(reference, value!)
  if (read.kind === 'unavailable') {
    throw new Error(read.error)
  }
  return read.task
}

async function openDetail(
  deps: TaskPortDeps,
  task: CycleTaskSnapshot,
  origin: TaskOrigin
): Promise<void> {
  const repo = resolveReferenceRepo(deps, origin, task.reference)
  if (!repo) {
    throw new Error(`未在已登记项目中找到引用仓库 ${task.reference.repository}`)
  }
  // Why: returnToPreviousView keeps the BW screen as the Back target; the BW
  // container restores version/draft/scroll from its own persisted view state.
  const options = {
    recordTasksInteraction: false,
    returnToPreviousView: true
  }
  if (task.reference.provider === 'github') {
    const sourceContext = requireSourceContext(repo, 'github')
    const item = await deps.lookupGitHubWorkItem({
      repoPath: repo.path,
      repoId: repo.id,
      sourceContext,
      number: task.iid
    })
    if (!item) {
      throw new Error(`GitHub 未返回编号 ${task.iid} 的工作项，无法打开详情`)
    }
    deps.openTaskPage(
      {
        taskSource: 'github',
        preselectedRepoId: repo.id,
        openGitHubWorkItem: { ...item, repoId: repo.id },
        openGitHubSourceContext: sourceContext
      },
      options
    )
    return
  }
  if (task.reference.provider === 'codehub') {
    const { kind, detail } = await viewCodeHubTaskByIid(deps, repo, task.iid)
    const item = codeHubTaskItemFromDetail({ detail, kind, repo, fallbackUrl: task.url })
    deps.openTaskPage(
      {
        taskSource: 'codehub',
        preselectedRepoId: repo.id,
        openCodeHubTask: item,
        openCodeHubSourceContext: requireSourceContext(repo, 'codehub')
      },
      options
    )
    return
  }
  throw new Error(`provider ${task.reference.provider} 尚未接入 Workbench 详情打开`)
}

export function createTaskPort(
  deps: TaskPortDeps,
  reader: TaskReferenceReader = createTaskReferenceReader(deps)
): TaskPort {
  async function readAll(
    scope: CycleScope,
    references: readonly CycleTaskReference[],
    force = false
  ): Promise<CycleTaskRead[]> {
    const values = await reader.read(scope, references, force)
    return values.map((value, index) => cycleTaskRead(references[index]!, value))
  }
  return {
    cacheKey: reader.key,
    cached: (scope, references) =>
      reader
        .cached(scope, references)
        ?.map((value, index) => cycleTaskRead(references[index]!, value)) ?? null,
    listVersion: (scope, references) => readAll(scope, references),
    refresh: (scope, references) => readAll(scope, references, true),
    openDetail: (task, origin) => openDetail(deps, task, origin)
  }
}
