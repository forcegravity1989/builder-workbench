import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import type { TuiAgent } from '../../../shared/tui-agent'

/** Observe native launch and any available delivery receipt; draft visibility is verified in E2E. */
export async function openWorkflowDraft(agent: TuiAgent, worktreeId: string, prompt: string) {
  const result = launchAgentInNewTab({
    agent,
    worktreeId,
    prompt,
    promptDelivery: 'draft',
    activate: true
  })
  if (!result) {
    throw new Error('会话未能打开，请核对默认智能体配置后重试。')
  }
  let delivery = result.promptDeliveryResult
  if (result.structuredSettlement) {
    const settled = await result.structuredSettlement
    if (settled.kind === 'failed') {
      throw settled.error
    }
    if (
      settled.kind !== 'structured' &&
      !(settled.kind === 'refused-then-legacy' && settled.primaryTabId)
    ) {
      throw new Error('会话尚未确认打开，请先核对原生会话列表，避免重复启动。')
    }
    delivery = settled.promptDeliveryResult
  } else if (result.runtimeLaunch) {
    const launched = await result.runtimeLaunch
    if (!launched.hostTabId || !launched.delivered) {
      throw new Error('宿主会话草稿尚未就绪，请核对原生输入区。')
    }
  } else if (!result.tabId) {
    throw new Error('会话尚未确认打开，请核对原生会话列表。')
  }
  if (delivery && !(await delivery).delivered) {
    throw new Error('会话已打开，但入口草稿未送达，请核对输入区后重试。')
  }
}
