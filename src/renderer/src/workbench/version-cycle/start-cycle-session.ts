import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { waitForAgentReady } from '@/lib/agent-ready-wait'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'
import type { CycleScope } from './ports'
import { assertCurrentCycleWorkspace } from './current-cycle-workspace'
import { revealPlanChat } from '../plan-column-resize'

/** Native sessions expose the app CLI; WSL publishes its executable in ORCA_CLI_COMMAND. */
function cycleStartDraft(workflow: VersionWorkflow, version: string | null): string {
  const target = version ? `${version} 的` : '本版'
  return workflow === 'plan'
    ? `先用 \`ORCA_CLI_COMMAND\`（未设置时用 \`orca\`）执行 \`skills get week-planning\` 读取 BW 内置计划技能，再帮我回顾上版遗留、制定${
        target
      }目标与任务，整理评审纪要并归档。`
    : `先用 \`ORCA_CLI_COMMAND\`（未设置时用 \`orca\`）执行 \`skills get version-acceptance\` 读取 BW 内置验收技能，再帮我准备${
        target
      }验收材料、核对目标交付，整理会议纪要、归档并按需发布。`
}

async function waitForTerminalDraft(
  tabId: string | null,
  expectedProcess: string,
  delivery?: Promise<{ delivered: boolean }>
) {
  if (!tabId) {
    throw new Error('会话尚未确认打开，请先核对原生会话列表。')
  }
  if (delivery && !(await delivery).delivered) {
    throw new Error('会话草稿尚未就绪，请先核对原生会话输入区。')
  }
  const ready = await waitForAgentReady(tabId, expectedProcess, { timeoutMs: 20_000 })
  if (!ready.ready) {
    throw new Error('智能体尚未就绪，请先核对已打开的会话，避免重复启动。')
  }
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
    if (settled.kind === 'refused-then-legacy') {
      await waitForTerminalDraft(
        settled.primaryTabId,
        result.startupPlan.expectedProcess,
        settled.promptDeliveryResult
      )
    } else if (settled.kind !== 'structured') {
      throw new Error('会话尚未确认打开，请先核对原生会话列表，避免重复启动。')
    }
  } else if (result.runtimeLaunch) {
    const launched = await result.runtimeLaunch
    if (!launched.hostTabId || !launched.delivered) {
      throw new Error('宿主会话草稿尚未确认就绪，请先核对原生会话输入区。')
    }
  } else {
    await waitForTerminalDraft(
      result.tabId,
      result.startupPlan.expectedProcess,
      result.promptDeliveryResult
    )
  }
  assertCurrentCycleWorkspace(scope, worktreeId)
}
