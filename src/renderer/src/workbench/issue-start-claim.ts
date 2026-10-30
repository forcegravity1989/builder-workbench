import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { codehubApi } from '@/lib/codehub-api'
import { lookupGitHubViewerForSource } from '@/lib/github-work-item-source-lookup'
import { getTaskPageRepoSourceContext } from '@/components/task-page-source-context'
import { runIssueUpdate } from '@/components/github/github-work-item-edit-mutations'
import type { LinkedWorkItemSummary } from '@/lib/new-workspace'
import type { TaskSourceContext } from '../../../shared/task-source-context'

/**
 * 开工认领（#512）：Issue 开工创建工作区成功后，把当前用户 add 为该 Issue
 * 责任人，开工状态经 GitHub/CodeHub 原生字段对所有协作者实例可见（任务屏
 * 责任人列与平台网页同见）。行为正本：docs/05-features/issue-start-claim/spec.md。
 * 与版本绑定同站点伴飞：失败不阻断开工、如实提示、不重试不虚报。
 */

/** 两条创建链的关联意图形状（quick 链 WorkspaceLinkedItem / full 链 LinkedWorkItemSummary 的公共投影）。 */
type ClaimableStartItem = Pick<LinkedWorkItemSummary, 'provider' | 'type' | 'number' | 'title'>

/** 认领准入（spec「行为规则」）：只认 GitHub/CodeHub 的 Issue；PR/MR 与其他 provider 静默跳过。 */
function isClaimableStartItem(
  item: ClaimableStartItem | null | undefined
): item is ClaimableStartItem & { provider: 'github' | 'codehub' } {
  return (item?.provider === 'github' || item?.provider === 'codehub') && item?.type === 'issue'
}

/**
 * 开工认领执行：挂在创建器真实创建结果处（quick 链活跃、full 链同构镜像）。
 * fire-and-forget——调用方不 await，任何失败只 toast，不影响激活/启动流。
 * 认领者 = 工作区所属 repo 宿主的平台登录账号（本地读本机、远程项目由
 * viewer/updateIssue 的 owning-runtime 路由在宿主侧执行），正是「当前开
 * worktree 的用户」。不预读 assignee：直接 add，平台去重；GitHub 侧 add
 * 只加不删已证，CodeHub 追加语义待真实环境验证（spec「幂等与追加」）。
 */
export async function claimIssueOnWorkspaceStart(args: {
  linkedWorkItem: ClaimableStartItem | null | undefined
  repoId: string
  /** 创建意图自带的任务来源（优先）；缺失时按 repo 行与 provider 现构。 */
  sourceContext?: TaskSourceContext | null
}): Promise<void> {
  const { linkedWorkItem, repoId } = args
  if (!isClaimableStartItem(linkedWorkItem)) {
    return
  }
  const repo = useAppStore.getState().repos.find((item) => item.id === repoId) ?? null
  const sourceContext =
    args.sourceContext ??
    (repo ? getTaskPageRepoSourceContext(repo, linkedWorkItem.provider) : null)
  const issueLabel = `#${linkedWorkItem.number} ${linkedWorkItem.title}`.trim()
  try {
    if (linkedWorkItem.provider === 'github') {
      const viewer = await lookupGitHubViewerForSource({
        repoPath: repo?.path ?? '',
        repoId,
        sourceContext
      })
      if (!viewer?.login) {
        throw new Error('未读取到当前 GitHub 账号')
      }
      await runIssueUpdate({
        repoPath: repo?.path ?? '',
        repoId,
        sourceContext,
        projectOrigin: undefined,
        number: linkedWorkItem.number,
        updates: { addAssignees: [viewer.login] }
      })
    } else {
      if (!repo) {
        throw new Error('仓库未注册，无法解析 CodeHub 账号')
      }
      const viewer = await codehubApi.viewer({ repoId: repo.id, repoPath: repo.path })
      if (!viewer?.username) {
        throw new Error('未读取到当前 CodeHub 账号')
      }
      await codehubApi.assignIssue({
        repoId: repo.id,
        repoPath: repo.path,
        iid: linkedWorkItem.number,
        assignee: viewer.username
      })
    }
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason)
    // 工作区已创建保留（spec「异常」）；责任人可人工补，不自动重试。
    toast.error(`工作区已创建，但 Issue ${issueLabel} 责任人标记失败：${message}`)
  }
}
