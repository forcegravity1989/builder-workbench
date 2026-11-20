import type { Worktree } from '../../../shared/worktree/types'
import { toRuntimeExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'

/**
 * 宿主限定激活选项（STA-4343：同 repoId::path 的 id 可跨宿主重复，激活须带
 * 登记归属宿主）；本机/未限定行返回 undefined，沿原生默认解析。统一
 * Start/Open 各直开点共用，不在调用端各写条件展开。
 */
export function worktreeActivationHostOpts(
  worktree: Pick<Worktree, 'hostId' | 'runtimeOwnerEnvironmentId'>
): { executionHostId: ExecutionHostId } | undefined {
  const executionHostId = worktree.runtimeOwnerEnvironmentId
    ? toRuntimeExecutionHostId(worktree.runtimeOwnerEnvironmentId)
    : worktree.hostId
  return executionHostId ? { executionHostId } : undefined
}
