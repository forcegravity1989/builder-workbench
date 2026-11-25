import { getTaskPageRepoSourceContext } from '@/components/task-page-source-context'
import { githubWorkItemWorkspaceComposerData } from '@/components/task-page-github-workspace-composer'
import { prefillCodehubDetailCache } from '@/components/task-page/codehub/codehub-detail-cache'
import { createTaskPageCodeHubApi } from '@/lib/codehub-api'
import { lookupGitHubWorkItemByOwnerRepoForSource } from '@/lib/github-work-item-source-lookup'
import {
  findIndexedRepoOwner,
  findIndexedRepoOwnerForHost
} from '@/lib/worktree-runtime-owner-index'
import { useAppStore } from '@/store'
import {
  findTaskItemLinkRepo,
  parseTaskItemLink,
  taskItemLinkIdentityKey,
  type TaskItemLink
} from '../../../shared/task-item-link'
import { parseCodeHubRemote } from '../../../shared/codehub'
import { githubRepoIdentityKey } from '../../../shared/github/repository-identity-key'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { codeHubTaskItemFromDetail } from './codehub-task-item'
import { notifyScopedWorkspaceUnavailable } from './scoped-task-workspace'
import { worktreeActivationHostOpts } from './worktree-activation-host-opts'
import { dispatchScopedWorktrees } from './version-workspace-choice-state'

export async function openWorkbenchTaskItemLink(
  url: string,
  link: TaskItemLink,
  isCurrent: () => boolean,
  disposition: 'details' | 'repair' = 'details'
): Promise<void> {
  if (link.provider === 'codehub') {
    const candidates = useAppStore.getState().repos.filter((repo) => {
      const remote =
        parseCodeHubRemote(repo.gitRemoteIdentity?.remoteUrl) ??
        parseCodeHubRemote(repo.gitRemoteIdentity?.canonicalKey)
      return repo.path && remote?.project.toLowerCase() === link.repository.toLowerCase()
    })
    candidates.sort(
      (a, b) =>
        Number(getRepoExecutionHostId(b) === LOCAL_EXECUTION_HOST_ID) -
        Number(getRepoExecutionHostId(a) === LOCAL_EXECUTION_HOST_ID)
    )
    let failure: unknown
    for (const repo of candidates) {
      if (!isCurrent()) {
        return
      }
      const source = getTaskPageRepoSourceContext(repo, 'codehub')
      if (!source) {
        continue
      }
      const kind = link.kind === 'mr' ? 'mr' : 'issue'
      try {
        // 同项目名仅是候选；主进程必须由平台证明 clone/web 主机关系后才能点读。
        const detail = await createTaskPageCodeHubApi(source, {
          project: link.repository
        }).viewTask({
          repoPath: repo.path,
          repoId: repo.id,
          kind,
          iid: link.number,
          expectedUrl: url
        })
        if (!isCurrent()) {
          return
        }
        assertReturnedTaskLink(link, detail.url, detail.iid, kind)
        const item = codeHubTaskItemFromDetail({ repo, kind, detail, fallbackUrl: url })
        prefillCodehubDetailCache(
          { repoId: repo.id, kind, iid: link.number, sourceContext: source },
          detail
        )
        useAppStore.getState().openTaskPage(
          {
            taskSource: 'codehub',
            preselectedRepoId: repo.id,
            openCodeHubTask: item,
            openCodeHubSourceContext: source
          },
          { recordTasksInteraction: false, returnToPreviousView: true }
        )
        return
      } catch (error) {
        failure = error
      }
    }
    throw (
      failure ??
      new Error(
        `未在已登记项目中找到 ${link.host}/${link.repository}。请先添加项目，或选择浏览器打开。`
      )
    )
  }
  const repo = findTaskItemLinkRepo(link, useAppStore.getState().repos)
  if (!repo) {
    throw new Error(
      `未在已登记项目中找到 ${link.host}/${link.repository}。请先添加项目，或选择浏览器打开。`
    )
  }
  const source = getTaskPageRepoSourceContext(repo, link.provider)
  if (!source) {
    throw new Error('无法解析任务来源。请刷新项目后重试。')
  }
  const options = { recordTasksInteraction: false, returnToPreviousView: true }
  const [owner, name] = link.repository.split('/')
  const identity = { host: link.host, owner: owner!, repo: name! }
  const sourceContext = {
    ...source,
    taskRemoteCandidates: undefined,
    providerIdentity: { provider: 'github' as const, ...identity }
  }
  const item = await lookupGitHubWorkItemByOwnerRepoForSource({
    repoPath: repo.path,
    repoId: repo.id,
    sourceContext,
    ...identity,
    number: link.number,
    type: link.kind === 'pr' ? 'pr' : 'issue'
  })
  if (!isCurrent()) {
    return
  }
  assertReturnedTaskLink(link, item?.url, item?.number, item?.type)
  if (disposition === 'repair') {
    const state = useAppStore.getState()
    const matchingRepos = state.repos.filter((candidate) => findTaskItemLinkRepo(link, [candidate]))
    const outcome = dispatchScopedWorktrees({
      candidates: state.allWorktrees().flatMap((tree) => {
        const identity = tree.linkedTaskSourceContext?.providerIdentity
        if (
          tree.linkedIssue !== link.number ||
          tree.isArchived ||
          (identity &&
            (identity.provider !== 'github' ||
              githubRepoIdentityKey(identity) !== taskItemLinkIdentityKey(link)))
        ) {
          return []
        }
        const host = worktreeActivationHostOpts(tree)?.executionHostId
        const owner = host ? null : findIndexedRepoOwner(state.repos, tree.repoId)
        const ownerHost = host ?? (owner ? getRepoExecutionHostId(owner) : null)
        return ownerHost && findIndexedRepoOwnerForHost(matchingRepos, tree.repoId, ownerHost)
          ? [{ ...tree, hostId: ownerHost }]
          : []
      }),
      choiceTitle: `#${item!.number} ${item!.title}`,
      onUnavailable: notifyScopedWorkspaceUnavailable
    })
    if (outcome === 'none') {
      state.openModal('new-workspace-composer', {
        ...githubWorkItemWorkspaceComposerData(item!, sourceContext),
        initialNote: `拉取最新代码，按项目 workbench-start 处理 Issue ${item!.url}。`
      })
    }
    return
  }
  useAppStore.getState().openTaskPage(
    {
      taskSource: 'github',
      preselectedRepoId: repo.id,
      openGitHubWorkItem: item!,
      openGitHubSourceContext: sourceContext
    },
    options
  )
}

function assertReturnedTaskLink(
  expected: TaskItemLink,
  url: string | null | undefined,
  number: number | undefined,
  kind: string | undefined
): void {
  const returned = url ? parseTaskItemLink(url, useAppStore.getState().repos) : null
  if (
    number !== expected.number ||
    kind !== expected.kind ||
    !returned ||
    returned.provider !== expected.provider ||
    returned.kind !== expected.kind ||
    returned.number !== expected.number ||
    taskItemLinkIdentityKey(returned) !== taskItemLinkIdentityKey(expected)
  ) {
    throw new Error('平台返回的任务与链接来源不一致，已停止打开')
  }
}
