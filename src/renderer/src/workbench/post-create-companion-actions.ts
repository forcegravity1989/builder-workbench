import { useAppStore } from '@/store'
import {
  getProjectHostSetupForRepoHost,
  repoHostId,
  withRepoHostOwnership
} from '@/store/slices/worktrees/listing/worktree-host-ownership'
import { writeWorkbenchCreationBinding } from '@/workbench/post-create-version-binding'
import { claimIssueOnWorkspaceStart } from '@/workbench/issue-start-claim'
import type { Worktree } from '../../../shared/worktree/types'
import type { WorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import type { LinkedWorkItemSummary } from '@/lib/new-workspace'

/**
 * quick/background 创建链真实创建结果处的 BW 伴飞动作集（G2 版本绑定＋#512
 * 开工认领）：都在创建成功、任何取消/激活分支之前触发——树已真实存在，本轮
 * UI 交接即使被放弃也保留归属与认领；全部 fire-and-forget，失败只 toast
 * 如实提示，不阻断原生激活/启动流。原生执行文件保持一行薄挂载。
 */
export function runPostCreateCompanionActions(request: {
  workbenchVersionBinding?: WorkbenchVersionBinding | null
  /** 两条创建链的关联意图公共投影（quick 链 WorkspaceLinkedItem / full 链 LinkedWorkItemSummary）。 */
  linkedWorkItem?: Pick<LinkedWorkItemSummary, 'provider' | 'type' | 'number' | 'title'> | null
  linkedTaskSourceContext?: TaskSourceContext | null
  worktree: Pick<
    Worktree,
    | 'id'
    | 'repoId'
    | 'hostId'
    | 'projectId'
    | 'instanceId'
    | 'runtimeOwnerEnvironmentId'
    | 'displayName'
    | 'branch'
    | 'projectHostSetupId'
  >
}): void {
  const { worktree } = request
  if (request.workbenchVersionBinding) {
    // Why: 裸创建结果行带归属宿主侧拼写（hostId='local'、无 runtimeOwnerEnvironmentId），
    // 直接写绑定会路由回访问者本机被拒；按 store 同源重拼写补齐访客侧宿主身份再写。
    const state = useAppStore.getState()
    const ownerHost = repoHostId(state, worktree.repoId)
    const setup = getProjectHostSetupForRepoHost(state, worktree.repoId, ownerHost)
    void writeWorkbenchCreationBinding(
      request.workbenchVersionBinding,
      withRepoHostOwnership(worktree, ownerHost, setup)
    )
  }
  // 开工认领（#512）：Issue 开工创建成功即把当前用户 add 为 Issue 责任人，
  // 开工状态跨机可见；非 Issue 或失败一律不阻断激活/启动流（spec「异常」）。
  void claimIssueOnWorkspaceStart({
    linkedWorkItem: request.linkedWorkItem,
    repoId: worktree.repoId,
    sourceContext: request.linkedTaskSourceContext ?? null
  })
}
