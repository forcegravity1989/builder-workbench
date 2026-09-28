import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { assertCurrentCycleWorkspace, startMaterialRequest } from './start-material-request'
import { startCycleAutomation } from './start-cycle-automation'
import { prepareMetricsSession, useMetricsSetupAgent } from './metrics-setup'
import { getActiveCycleSession, prepareCycleRequest } from './native-session'
import { useWorkflowVersion } from './use-workflow-version'
import { useCycleAutomationDraft } from './use-cycle-automation-draft'
import { useEnsureCycleAutomation } from './ensure-cycle-automation'
import { useCycleWorkspaceWorkflow } from './cycle-workspace-view'
import { useCycleWorkspaceTarget } from './use-cycle-workspace-target'
import { CycleWorkspaceContext } from './cycle-workspace-context'
import { nativeVersionMaterialPort } from '../version-material-port'
import { nativeTaskPort } from '../task-port'
import { nativeArchivePort } from '../archive-port'
import './version-cycle.css'

/** BW supplies workflow assets to the existing Orca workspace, never a second session host. */
export function CycleWorkspaceProvider({ children }: { children: ReactNode }) {
  const workflow = useCycleWorkspaceWorkflow()
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { worktree, scope, error } = useCycleWorkspaceTarget(workflow, setNotice)
  const fixedId = worktree?.id ?? null
  const agent = useMetricsSetupAgent(fixedId)
  const session = useAppStore(useShallow((state) => getActiveCycleSession(state, scope, fixedId)))
  const owner = scope?.runtimeOwnerEnvironmentId
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
  const archivePort = useMemo(() => nativeArchivePort(owner), [owner])
  const sessionPort = useMemo(() => ({ prepareRequest: prepareCycleRequest }), [])
  const automation = useEnsureCycleAutomation({
    cycleScope: scope,
    fixedId,
    workflow: workflow ?? 'plan',
    agent,
    onNotice: setNotice
  })
  const configure = useCycleAutomationDraft({
    cycleScope: scope,
    fixedId,
    workflow: workflow ?? 'plan',
    existingId: automation.automationId,
    creationKey: automation.creationKey,
    onError: setNotice
  })
  const start = useCallback(async () => {
    setBusy(true)
    try {
      if (!scope || !fixedId || !automation.automationId) {
        throw new Error('周期自动化尚未就绪，请在自动化页核对配置。')
      }
      await startCycleAutomation(scope, fixedId, automation.automationId)
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
  }, [scope, fixedId, automation.automationId])
  const startRequest = useCallback(
    async (text: string) => {
      if (!scope || !fixedId || !agent) {
        throw new Error('工作区或会话工具尚未就绪。')
      }
      await startMaterialRequest(scope, fixedId, agent, text)
    },
    [scope, fixedId, agent]
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
            start,
            configure,
            prepareMetrics,
            context: {
              scope,
              worktreeId: fixedId,
              session,
              version: version.version,
              selectVersion: version.selectVersion,
              startRequest,
              materialPort,
              sessionPort,
              taskPort,
              archivePort,
              error: error ?? version.error
            }
          }
        : null,
    [
      workflow,
      busy,
      notice,
      start,
      configure,
      prepareMetrics,
      scope,
      fixedId,
      session,
      version.version,
      version.selectVersion,
      version.error,
      startRequest,
      materialPort,
      sessionPort,
      taskPort,
      archivePort,
      error
    ]
  )
  return <CycleWorkspaceContext.Provider value={value}>{children}</CycleWorkspaceContext.Provider>
}
