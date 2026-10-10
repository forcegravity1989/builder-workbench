import {
  listAutomationsForOwner,
  listAutomationRunsForOwner,
  runAutomationNowForOwner
} from '@/components/automations/automation-scoped-list-client'
import { toScopedAutomationHostRows } from '@/components/automations/automation-host-cache-rows'
import { openAutomationRunTerminal } from '@/components/automations/automation-run-workspace-action'
import { ownerKey } from '../../../../shared/automation-owner-key'
import type { CycleScope } from './ports'
import { cycleAutomationOwner } from './ensure-cycle-automation'
import { assertCurrentCycleWorkspace } from './current-cycle-workspace'

/**
 * 「AI 创建自动化」：runNow 那条禁用态 composer 自动化，用户的描述作为
 * oneShotPrompt 一次性随行（host 追加到保存的提示词后投递，不写回记录）。
 * 等待与失败处理同 start-cycle-automation：owner fence 断言、只开本次匹配的
 * 运行终端、30 秒内打不开就如实交还自动化页。
 */
export async function startComposerSession(
  scope: CycleScope,
  worktreeId: string,
  automationId: string,
  userRequest: string
) {
  const requestedOwner = cycleAutomationOwner(scope)
  const listed = await listAutomationsForOwner(requestedOwner)
  const row = toScopedAutomationHostRows(requestedOwner.authority, listed).find(
    (item) => item.automation.id === automationId
  )
  if (!row?.owner) {
    throw new Error('AI 创建自动化入口已不存在或宿主已改变，请在自动化页核对配置。')
  }
  const { automation, owner } = row
  if (automation.workspaceMode !== 'existing' || automation.workspaceId !== worktreeId) {
    throw new Error('AI 创建自动化入口的工作区已改变，请在自动化页核对后启动。')
  }
  const assertCurrent = () => {
    assertCurrentCycleWorkspace(scope, worktreeId)
    if (ownerKey(cycleAutomationOwner(scope)) !== ownerKey(owner)) {
      throw new Error('自动化宿主登记已改变，请回到对应流程后重试。')
    }
  }
  assertCurrent()
  let run = await runAutomationNowForOwner(owner, automation.id, userRequest)
  const runId = run.id
  const deadline = Date.now() + 30_000
  while (true) {
    assertCurrent()
    if (run.error || run.status.startsWith('skipped') || run.status === 'dispatch_failed') {
      throw new Error(run.error ?? 'AI 创建自动化会话未能启动，请在自动化页查看运行记录。')
    }
    if (run.workspaceId && run.workspaceId !== worktreeId) {
      throw new Error('本次会话的工作区已改变，请在自动化页核对运行记录。')
    }
    if (openAutomationRunTerminal(run, scope.hostId)) {
      return
    }
    if (Date.now() >= deadline) {
      throw new Error('会话已提交，终端尚未能打开；请在自动化页查看本次运行，避免重复启动。')
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 1000))
    assertCurrent()
    const runs = await listAutomationRunsForOwner(owner, automation.id)
    run = runs.find((item) => item.id === runId) ?? run
  }
}
