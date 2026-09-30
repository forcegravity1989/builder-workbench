import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { assertCurrentCycleWorkspace } from './current-cycle-workspace'
import { buildCyclePrompt } from './cycle-prompt'
import { prepareMetricsSession, useMetricsSetupAgent } from './metrics-setup'
import { getActiveCycleSession, prepareCycleRequest } from './native-session'
import { useWorkflowVersion } from './use-workflow-version'
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
  const start = useCallback(
    async (oneShot?: string) => {
      setBusy(true)
      try {
        if (!scope || !fixedId) {
          throw new Error('固定工作树尚未就绪，请稍后重试。')
        }
        if (!agent) {
          throw new Error('未检测到可用会话工具，请先在设置中配置')
        }
        assertCurrentCycleWorkspace(scope, fixedId)
        const prompt = await buildCyclePrompt(scope, fixedId)
        launchAgentInNewTab({
          agent,
          worktreeId: fixedId,
          prompt: oneShot ? `${prompt}\n\n${oneShot}` : prompt,
          activate: true,
          promptDelivery: 'draft'
        })
        toast.message('已打开本次会话，提示在左侧输入框，尚未发送。')
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
            prepareMetrics,
            context: {
              scope,
              worktreeId: fixedId,
              session,
              version: version.version,
              selectVersion: version.selectVersion,
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
      prepareMetrics,
      scope,
      fixedId,
      session,
      version.version,
      version.selectVersion,
      version.error,
      materialPort,
      sessionPort,
      taskPort,
      archivePort,
      error
    ]
  )
  return <CycleWorkspaceContext.Provider value={value}>{children}</CycleWorkspaceContext.Provider>
}
