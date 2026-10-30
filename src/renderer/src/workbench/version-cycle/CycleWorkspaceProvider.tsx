import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { isVersionFlowWorkflow } from '../../../../shared/workbench/version-workspace-prepare'
import { branchName } from '@/lib/git-utils'
import { normalizeStoredWorkbenchVersionBinding } from '../../../../shared/workbench/version-binding'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { revealPlanChat } from '../plan-column-resize'
import { assertCurrentCycleWorkspace } from './current-cycle-workspace'
import { prepareMetricsSession, useMetricsSetupAgent } from './metrics-setup'
import { getActiveCycleSession } from './native-session'
import { useWorkflowVersion } from './use-workflow-version'
import { useCycleAutomationDraft } from './use-cycle-automation-draft'
import { useEnsureCycleAutomation } from './ensure-cycle-automation'
import { useCycleWorkspaceWorkflow } from './cycle-workspace-view'
import { useCycleWorkspaceTarget } from './use-cycle-workspace-target'
import { CycleWorkspaceContext } from './cycle-workspace-context'
import { nativeVersionMaterialPort } from '../version-material-port'
import { nativeTaskPort } from '../native-task-port'
import { nativeArchivePrPort } from '../archive-pr-port'
import { nativeReleaseStatusPort } from '../release-port'
import './version-cycle.css'

export function CycleWorkspaceProvider({ children }: { children: ReactNode }) {
  const workflow = useCycleWorkspaceWorkflow()
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { worktree, scope, error, syncing, materialRefresh, updateCode, readonlyBrowse } =
    useCycleWorkspaceTarget(workflow, setNotice)
  const fixedId = worktree?.id ?? null
  const agent = useMetricsSetupAgent(fixedId)
  const session = useAppStore(useShallow((state) => getActiveCycleSession(state, scope, fixedId)))
  const owner = scope?.runtimeOwnerEnvironmentId
  // G2：绑定流程树=版本化工作区。周期自动化身份已随 P5 版本化，计划、验收
  // 两侧均放开（验收 Skill 正本 v0.7.1 已绑定感知同步，归档分支文案不再矛盾）。
  const flowBinding = useMemo(() => {
    const binding = worktree
      ? normalizeStoredWorkbenchVersionBinding(worktree.workbenchVersionBinding)
      : null
    return binding && isVersionFlowWorkflow(binding.workflow) ? binding : null
  }, [worktree])
  const materialPort = useMemo(
    () =>
      scope && fixedId
        ? nativeVersionMaterialPort(
            {
              repoId: scope.repoId,
              worktreeId: fixedId,
              hostId: scope.hostId,
              workflow: scope.workflow
            },
            owner
          )
        : null,
    [scope, fixedId, owner]
  )
  const version = useWorkflowVersion(materialPort)
  const taskPort = useMemo(() => nativeTaskPort(), [])
  const archivePort = useMemo(() => nativeArchivePrPort(owner), [owner])
  const releasePort = useMemo(() => nativeReleaseStatusPort(owner), [owner])
  const automation = useEnsureCycleAutomation({
    cycleScope: scope,
    fixedId,
    workflow: workflow ?? 'plan',
    agent,
    onNotice: setNotice,
    version: flowBinding?.version ?? null
  })
  const configure = useCycleAutomationDraft({
    cycleScope: scope,
    fixedId,
    workflow: workflow ?? 'plan',
    existingId: automation.automationId,
    creationKey: automation.creationKey,
    onError: setNotice
  })
  const start = useCallback(
    async (selectedVersion?: string | null) => {
      setBusy(true)
      try {
        if (!scope || !fixedId) {
          throw new Error('流程工作区尚未就绪，请稍后重试。')
        }
        if (!agent) {
          throw new Error('会话工具尚未就绪，请先在设置中配置默认智能体。')
        }
        assertCurrentCycleWorkspace(scope, fixedId)
        const selected = selectedVersion ?? version.version
        const target = selected ? ` ${selected} 的版本` : '本版'
        const topic = scope.workflow === 'plan' ? 'week-planning' : 'version-acceptance'
        const task = scope.workflow === 'plan' ? `和我制定${target}计划` : `协助我开展${target}验收`
        revealPlanChat()
        const result = launchAgentInNewTab({
          agent,
          worktreeId: fixedId,
          prompt: `先用 \`ORCA_CLI_COMMAND\` 指定的命令（未设置则用 \`orca\`）执行 \`skills get ${topic}\`，按 BW 内置技能读全公共纪律与当前上下文，再${task}。`,
          promptDelivery: 'draft',
          activate: true
        })
        if (!result) throw new Error('会话未能打开，请核对默认智能体配置后重试。')
        if (result.structuredSettlement) {
          const settled = await result.structuredSettlement
          if (settled.kind === 'failed') throw settled.error
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
        assertCurrentCycleWorkspace(scope, fixedId)
        toast.message('已打开会话，补充后发送。')
        setNotice(null)
        return true
      } catch (reason) {
        if (scope && fixedId) {
          try {
            assertCurrentCycleWorkspace(scope, fixedId)
          } catch {
            return false
          }
        }
        setNotice(reason instanceof Error ? reason.message : String(reason))
        return false
      } finally {
        setBusy(false)
      }
    },
    [scope, fixedId, agent, version.version]
  )
  const prepareMetrics = useCallback(async () => {
    if (!scope || !agent) {
      throw new Error('工作区或会话工具尚未就绪。')
    }
    await prepareMetricsSession({ baseScope: scope, agent })
  }, [scope, agent])
  const value = useMemo(
    () =>
      workflow
        ? {
            workflow,
            busy,
            notice,
            readonlyBrowse,
            start,
            configure,
            prepareMetrics,
            context: {
              scope,
              worktreeId: fixedId,
              session,
              worktreeInstanceId: worktree?.instanceId ?? null,
              version: version.version,
              boundVersion: flowBinding?.version ?? null,
              branch: worktree?.branch ? branchName(worktree.branch) || null : null,
              selectVersion: version.selectVersion,
              materialPort,
              taskPort,
              archivePort,
              releasePort,
              error: error ?? version.error,
              syncing,
              materialRefresh,
              updateCode
            }
          }
        : null,
    [
      workflow,
      busy,
      notice,
      readonlyBrowse,
      start,
      configure,
      prepareMetrics,
      scope,
      fixedId,
      worktree?.branch,
      worktree?.instanceId,
      session,
      version.version,
      flowBinding,
      version.selectVersion,
      version.error,
      materialPort,
      taskPort,
      archivePort,
      releasePort,
      error,
      syncing,
      materialRefresh,
      updateCode
    ]
  )
  return <CycleWorkspaceContext.Provider value={value}>{children}</CycleWorkspaceContext.Provider>
}
