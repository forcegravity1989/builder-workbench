import { useAppStore } from '@/store'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { CycleScope } from './ports'
import { buildCyclePrompt } from './cycle-prompt'
import { cycleScopeForWorktree, cycleScopeKey } from './native-cycle-workspace'

export function assertCurrentCycleWorkspace(scope: CycleScope, worktreeId: string) {
  const state = useAppStore.getState()
  const worktree = state.getKnownWorktreeById(
    worktreeId,
    state.activeWorkspaceExecutionHostId ?? undefined
  )
  if (
    state.activeView !== 'terminal' ||
    state.activeWorktreeId !== worktreeId ||
    !worktree ||
    cycleScopeKey(cycleScopeForWorktree(worktree, scope.workflow)) !== cycleScopeKey(scope)
  ) {
    throw new Error('工作区已切换，请回到对应流程后重试。')
  }
}

/** Consume native launch receipts; a prepared tab is not proof the request was sent. */
export async function startMaterialRequest(
  scope: CycleScope,
  worktreeId: string,
  agent: TuiAgent,
  text: string
) {
  const prompt = `${await buildCyclePrompt(scope, worktreeId)}\n\n本次处理请求：\n${text}`
  assertCurrentCycleWorkspace(scope, worktreeId)
  const launched = launchAgentInNewTab({
    agent,
    worktreeId,
    prompt,
    activate: true,
    promptDelivery: 'submit-after-ready'
  })
  if (!launched) {
    throw new Error('无法准备会话启动请求。')
  }
  let delivery = launched.runtimeLaunch ?? launched.promptDeliveryResult
  if (launched.structuredSettlement) {
    const settled = await launched.structuredSettlement
    if (settled.kind === 'failed') {
      throw settled.error
    }
    if (settled.kind === 'cancelled' || settled.kind === 'visibility-unknown') {
      throw new Error('新会话尚未确认就绪，请先在原生会话中核对请求是否发送。')
    }
    delivery = settled.promptDeliveryResult
  }
  if (!delivery || !(await delivery).delivered) {
    throw new Error('处理请求尚未确认发送，请在新建的原生会话中核对。')
  }
}
