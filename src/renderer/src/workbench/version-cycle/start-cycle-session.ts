import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'
import type { CycleScope } from './ports'
import { assertCurrentCycleWorkspace } from './current-cycle-workspace'
import { revealPlanChat } from '../plan-column-resize'

function cycleStartDraft(workflow: VersionWorkflow, version: string | null): string {
  const target = version ? ` ${version} 的版本` : '本版'
  return workflow === 'plan'
    ? `先用 \`ORCA_CLI_COMMAND\` 指定的命令（未设置则用 \`orca\`）执行 \`skills get week-planning\`，按 BW 内置技能读全公共纪律与当前上下文，再和我制定${target}计划。`
    : `先用 \`ORCA_CLI_COMMAND\` 指定的命令（未设置则用 \`orca\`）执行 \`skills get version-acceptance\`，按 BW 内置技能读全公共纪律与当前上下文，再协助我开展${target}验收。`
}

/** Manual entry uses native editable drafts; scheduling keeps the automation dispatcher. */
export async function startCycleSession(
  scope: CycleScope,
  worktreeId: string,
  agent: TuiAgent,
  version: string | null
) {
  assertCurrentCycleWorkspace(scope, worktreeId)
  revealPlanChat()
  const result = launchAgentInNewTab({
    agent,
    worktreeId,
    prompt: cycleStartDraft(scope.workflow, version),
    promptDelivery: 'draft',
    activate: true
  })
  if (!result) {
    throw new Error('会话未能打开，请核对默认智能体配置后重试。')
  }
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
  } else if (result.runtimeLaunch) {
    const launched = await result.runtimeLaunch
    if (!launched.hostTabId || !launched.delivered) {
      throw new Error('宿主会话草稿尚未确认就绪，请先核对原生会话输入区。')
    }
  } else if (!result.tabId) {
    throw new Error('会话尚未确认打开，请先核对原生会话列表。')
  }
  assertCurrentCycleWorkspace(scope, worktreeId)
}
