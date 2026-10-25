import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { isVersionFlowWorkflow } from '../../../../shared/workbench/version-workspace-prepare'
import { branchName } from '@/lib/git-utils'
import { normalizeStoredWorkbenchVersionBinding } from '../../../../shared/workbench/version-binding'
import { startCycleAutomation } from './start-cycle-automation'
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
    async (oneShot?: string) => {
      setBusy(true)
      try {
        if (!scope || !fixedId || !automation.automationId) {
          throw new Error('周期自动化尚未就绪，请在自动化页核对配置。')
        }
        await startCycleAutomation(scope, fixedId, automation.automationId, oneShot)
        toast.message('已打开本次运行的会话。')
        setNotice(null)
      } catch (reason) {
        if (scope && fixedId) {
          try {
            assertCurrentCycleWorkspace(scope, fixedId)
          } catch {
            return
          }
        }
        setNotice(reason instanceof Error ? reason.message : String(reason))
      } finally {
        setBusy(false)
      }
    },
    [scope, fixedId, automation.automationId]
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
              version: version.version,
              boundVersion: flowBinding?.version ?? null,
              branch: worktree?.branch ? branchName(worktree.branch) || null : null,
              selectVersion: version.selectVersion,
              materialPort,
              taskPort,
              archivePort,
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
      session,
      version.version,
      flowBinding,
      version.selectVersion,
      version.error,
      materialPort,
      taskPort,
      archivePort,
      error,
      syncing,
      materialRefresh,
      updateCode
    ]
  )
  return <CycleWorkspaceContext.Provider value={value}>{children}</CycleWorkspaceContext.Provider>
}
