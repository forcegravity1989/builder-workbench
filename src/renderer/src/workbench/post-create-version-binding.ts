import { toast } from 'sonner'
import type { Worktree } from '../../../shared/worktree/types'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { branchName } from '@/lib/git-utils'
import type { WorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import { nativeVersionBindingPort } from './version-binding-port'

/**
 * 真实创建结果处写版本绑定（G2 P4④）：只认创建返回的登记身份，instanceId
 * 必填口径——缺实例身份报错不写；树已由原生创建并保留，重试只重发绑定写入、
 * 不再建树。写失败如实提示（树保留、原生入口照常可用），不虚报成功、
 * 不阻塞原生激活/启动流。
 */
export async function writeWorkbenchCreationBinding(
  binding: WorkbenchVersionBinding,
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
  >
): Promise<void> {
  const label =
    worktree.displayName?.trim() ||
    (worktree.branch ? branchName(worktree.branch) : '') ||
    worktree.id
  const hostId = worktree.hostId ?? LOCAL_EXECUTION_HOST_ID
  async function attempt(retry: boolean): Promise<void> {
    if (!worktree.instanceId) {
      toast.error(
        `工作树 ${label} 已创建，但缺实例身份，版本绑定未写入。树已保留、不会重复创建；请在原生项目核对该树登记（恢复归属需补绑定或清理该树）`
      )
      return
    }
    try {
      await nativeVersionBindingPort({
        hostId,
        ...(worktree.runtimeOwnerEnvironmentId
          ? { runtimeOwnerEnvironmentId: worktree.runtimeOwnerEnvironmentId }
          : {})
      }).set(
        {
          repoId: worktree.repoId,
          worktreeId: worktree.id,
          hostId,
          ...(worktree.projectId ? { projectId: worktree.projectId } : {}),
          instanceId: worktree.instanceId
        },
        binding
      )
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      toast.error(
        `工作树 ${label} 已创建，但版本绑定未写入：${message}。树已保留、不会重复创建${
          retry ? '（重试仍未成功，可在原生项目核对后处理该树）' : ''
        }`,
        {
          action: {
            label: '重试写绑定',
            onClick: () => {
              void attempt(true)
            }
          }
        }
      )
    }
  }
  await attempt(false)
}
