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
import { assertCurrentCycleWorkspace } from './start-material-request'

/** Manual workflow launches use the saved native automation and reveal only that run. */
export async function startCycleAutomation(
  scope: CycleScope,
  worktreeId: string,
  automationId: string
) {
  const requestedOwner = cycleAutomationOwner(scope)
  const listed = await listAutomationsForOwner(requestedOwner)
  const row = toScopedAutomationHostRows(requestedOwner.authority, listed).find(
    (item) => item.automation.id === automationId
  )
  if (!row?.owner) {
    throw new Error('周期自动化已不存在或宿主已改变，请在自动化页核对配置。')
  }
  const { automation, owner } = row
  if (automation.workspaceMode !== 'existing' || automation.workspaceId !== worktreeId) {
    throw new Error('此自动化的工作区已改变，请在自动化页核对后启动。')
  }
  const assertCurrent = () => {
    assertCurrentCycleWorkspace(scope, worktreeId)
    if (ownerKey(cycleAutomationOwner(scope)) !== ownerKey(owner)) {
      throw new Error('自动化宿主登记已改变，请回到对应流程后重试。')
    }
  }
  assertCurrent()
  let run = await runAutomationNowForOwner(owner, automation.id)
  const runId = run.id
  const deadline = Date.now() + 30_000
  while (true) {
    assertCurrent()
    if (run.error || run.status.startsWith('skipped') || run.status === 'dispatch_failed') {
      throw new Error(run.error ?? '自动化未能启动，请在自动化页查看运行记录。')
    }
    if (run.workspaceId && run.workspaceId !== worktreeId) {
      throw new Error('本次运行的工作区已改变，请在自动化页核对运行记录。')
    }
    if (openAutomationRunTerminal(run, scope.hostId)) {
      return
    }
    if (Date.now() >= deadline) {
      throw new Error('运行已提交，会话尚未能打开；请在自动化页查看本次运行，避免重复启动。')
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 1000))
    assertCurrent()
    const runs = await listAutomationRunsForOwner(owner, automation.id)
    run = runs.find((item) => item.id === runId) ?? run
  }
}
