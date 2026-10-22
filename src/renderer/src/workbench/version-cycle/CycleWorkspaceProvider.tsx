import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
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

/** BW supplies workflow assets to the existing Orca workspace, never a second session host. */
const VERSIONED_AUTOMATION_NOTICE =
  '版本化自动化身份待接入（P5）：本版绑定树的定时/手动运行入口会复用旧版自动化条目、落错执行树，已拒绝启动。请暂在本树会话区直接新建会话。'

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
  // G2 (P3a)：绑定树=版本化工作区；自动化身份版本化属 P5，此前如实拒绝
  // 启动/配置（防 creationKey 无版本维度导致运行落到旧版树），不假报就绪。
  const flowBinding = useMemo(() => {
    const binding = worktree
      ? normalizeStoredWorkbenchVersionBinding(worktree.workbenchVersionBinding)
      : null
    return binding && (binding.workflow === 'plan' || binding.workflow === 'acceptance')
      ? binding
      : null
  }, [worktree])
  const versionBound = flowBinding !== null
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
    skip: versionBound ? 'version-bound' : null
  })
  const configure = useCycleAutomationDraft({
    cycleScope: scope,
    fixedId,
    workflow: workflow ?? 'plan',
    existingId: automation.automationId,
    creationKey: automation.creationKey,
    onError: setNotice
  })
  const configureGuarded = useCallback(async () => {
    if (versionBound) {
      setNotice(VERSIONED_AUTOMATION_NOTICE)
      return
    }
    await configure()
  }, [configure, versionBound])
  const start = useCallback(
    async (oneShot?: string) => {
      if (versionBound) {
        setNotice(VERSIONED_AUTOMATION_NOTICE)
        return
      }
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
    [scope, fixedId, automation.automationId, versionBound]
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
            configure: configureGuarded,
            prepareMetrics,
            context: {
              scope,
              worktreeId: fixedId,
              session,
              version: version.version,
              boundVersion: flowBinding?.version ?? null,
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
      configureGuarded,
      prepareMetrics,
      scope,
      fixedId,
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
