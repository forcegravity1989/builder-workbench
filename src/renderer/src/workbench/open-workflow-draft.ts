import { launchAgentInNewTabWithOutcome } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab'
import { settleAgentTabLaunch } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab-host-agents'
import { createNonSecureContextUuid } from '../../../shared/identifiers/non-secure-context-uuid'
import type { TuiAgent } from '../../../shared/agent-launch/catalog/tui-agent'

/** Observe native launch and any available delivery receipt; draft visibility is verified in E2E. */
export async function openWorkflowDraft(agent: TuiAgent, worktreeId: string, prompt: string) {
  const result = launchAgentInNewTabWithOutcome({
    requestId: createNonSecureContextUuid(),
    agent,
    worktreeId,
    prompt,
    promptDelivery: 'draft',
    activate: true
  })
  if (!result || 'refused' in result) {
    throw new Error('会话未能打开，请核对默认智能体配置后重试。')
  }
  const settled = await settleAgentTabLaunch(result)
  if (settled.kind === 'failed') {
    throw settled.error
  }
  if (settled.kind !== 'structured' && settled.kind !== 'terminal') {
    throw new Error('会话尚未确认打开，请先核对原生会话列表，避免重复启动。')
  }
  const delivery =
    settled.kind === 'structured'
      ? (settled.promptDeliveryResult ?? result.promptDeliveryResult)
      : result.promptDeliveryResult
  if (delivery && !(await delivery).delivered) {
    throw new Error('会话已打开，但入口草稿未送达，请核对输入区后重试。')
  }
}
