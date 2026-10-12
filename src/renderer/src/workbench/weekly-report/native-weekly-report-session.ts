import { useAppStore } from '@/store'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { routeForOwner } from '@/lib/worktree-owner-route'
import { getConnectionIdFromState } from '@/lib/connection-context'
import { captureWorktreeSshMutationExpectation } from '@/lib/ssh-mutation-expectation'
import { activateWebRuntimeSessionWorktree } from '@/runtime/web-runtime-worktree-activation'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { Worktree } from '../../../../shared/worktree/types'
import { toRuntimeExecutionHostId } from '../../../../shared/execution-host'
import {
  ensureNamedWorktree,
  nativeWorkspaceScope,
  nativeWorkspaceScopeKey,
  type NativeWorkspaceScope
} from '../version-cycle/native-workspace'
import type { WeeklyReportContext } from './report-port'
import { buildWeeklyReportPrompt } from './weekly-report-prompt'

export const WEEKLY_REPORT_BRANCH = 'bw/weekly-report'

export function assertWeeklyReportOwner(scope: NativeWorkspaceScope, worktreeId?: string) {
  const state = useAppStore.getState()
  const activeHost = state.activeWorkspaceExecutionHostId
  if (
    (state.activeRepoId ?? state.repos[0]?.id) !== scope.repoId ||
    (activeHost &&
      activeHost !== scope.hostId &&
      (!scope.runtimeOwnerEnvironmentId ||
        activeHost !== toRuntimeExecutionHostId(scope.runtimeOwnerEnvironmentId)))
  ) {
    throw new Error('项目或宿主已改变，请回到目标项目后重试')
  }
  if (
    worktreeId &&
    !state
      .allWorktrees()
      .some(
        (tree) =>
          tree.id === worktreeId &&
          nativeWorkspaceScopeKey(nativeWorkspaceScope(tree)) === nativeWorkspaceScopeKey(scope)
      )
  ) {
    throw new Error('周报工作区登记已改变，请重新读取后重试')
  }
}

export function weeklyReportFileContext(worktree: Worktree): WeeklyReportContext {
  const state = useAppStore.getState()
  const scope = nativeWorkspaceScope(worktree)
  const route = routeForOwner(scope)
  if (!route) {
    throw new Error('周报工作区宿主尚未就绪')
  }
  const connectionId = getConnectionIdFromState(state, worktree.id)
  if (connectionId === undefined) {
    throw new Error('无法确定周报工作区所属宿主')
  }
  return {
    worktreeId: worktree.id,
    worktreePath: worktree.path,
    settings: { activeRuntimeEnvironmentId: route.runtimeEnvironmentId },
    connectionId: connectionId ?? undefined,
    ...captureWorktreeSshMutationExpectation(state, worktree.id)
  }
}

export async function prepareWeeklyReportSession(args: {
  scope: NativeWorkspaceScope
  agent: TuiAgent
  projectName: string
  repository: string
  periodStart: string
  periodEndExclusive: string
  timezone: string
}): Promise<void> {
  const { scope, agent, ...promptContext } = args
  assertWeeklyReportOwner(scope)
  const worktree = await ensureNamedWorktree(scope, WEEKLY_REPORT_BRANCH, 'weekly-report')
  assertWeeklyReportOwner(scope, worktree.id)
  if (nativeWorkspaceScopeKey(nativeWorkspaceScope(worktree)) !== nativeWorkspaceScopeKey(scope)) {
    throw new Error('周报工作区所属项目或宿主已改变')
  }
  const prompt = buildWeeklyReportPrompt({
    ...promptContext,
    reportPath: `.bw/weekly-reports/${args.periodStart}/${crypto.randomUUID()}.json`,
    executionContext: {
      projectId: scope.projectId,
      repoId: scope.repoId,
      hostId: scope.hostId,
      runtimeOwnerEnvironmentId: scope.runtimeOwnerEnvironmentId,
      worktreeId: worktree.id,
      workspacePath: worktree.path
    }
  })
  const state = useAppStore.getState()
  state.setActiveWorktree(worktree.id, scope.hostId)
  if (scope.runtimeOwnerEnvironmentId) {
    await activateWebRuntimeSessionWorktree({
      worktreeId: worktree.id,
      environmentId: scope.runtimeOwnerEnvironmentId
    })
  }
  assertWeeklyReportOwner(scope, worktree.id)
  const result = launchAgentInNewTab({
    agent,
    worktreeId: worktree.id,
    prompt,
    activate: true,
    promptDelivery: 'auto-submit'
  })
  if (!result) {
    throw new Error('未能启动周报会话，请核对会话工具设置后重试')
  }
  useAppStore.getState().setActiveView('terminal')
  let promptDelivery = result.promptDeliveryResult
  if (result.structuredSettlement) {
    const settlement = await result.structuredSettlement
    if (settlement.kind === 'failed') {
      throw settlement.error instanceof Error
        ? settlement.error
        : new Error(String(settlement.error))
    }
    if (settlement.kind === 'cancelled') {
      throw new Error('周报会话启动已取消')
    }
    if (settlement.kind === 'visibility-unknown') {
      throw new Error('周报会话已启动但显示状态未确认，请在工作区核对，避免重复启动')
    }
    promptDelivery = settlement.promptDeliveryResult ?? promptDelivery
  }
  if (promptDelivery) {
    const delivery = await promptDelivery
    if (!delivery.delivered) {
      throw new Error('周报请求尚未发送，请在已打开的会话中核对后继续')
    }
  }
}
