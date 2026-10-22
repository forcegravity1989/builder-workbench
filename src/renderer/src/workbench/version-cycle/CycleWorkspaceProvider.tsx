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
const ACCEPTANCE_SKILL_SYNC_NOTICE =
  '验收流程树的版本化提示同步待验收 Skill 正本更新（#394）合入后放开：为防止会话按旧固定分支文案归档到错误分支，本版验收树的定时/手动运行入口暂未开放。请在本树会话区直接新建会话。'

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
  // G2：绑定流程树=版本化工作区。计划侧自动化身份已随 P5 版本化放开；验收
  // 绑定树在验收 Skill 正本同步（#394 合入）前如实受限——见下方
  // useEnsureCycleAutomation 的 skip 与 start/configure 守卫。
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
    version: flowBinding?.version ?? null,
    // G2（P5）：计划绑定树已版本化（creationKey/条目名/提示词钉真实分支与绑定
    // 版本）；验收绑定树在验收 Skill 正本同步（#394 合入后）前如实跳过，防止
    // 提示词与旧归档分支文案矛盾。旧无绑定树 skip=null 沿原语义。
    skip: versionBound && workflow === 'acceptance' ? 'acceptance-skill-sync' : null
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
    if (versionBound && workflow === 'acceptance') {
      setNotice(ACCEPTANCE_SKILL_SYNC_NOTICE)
      return
    }
    await configure()
  }, [configure, versionBound, workflow])
  const start = useCallback(
    async (oneShot?: string) => {
      if (versionBound && workflow === 'acceptance') {
        setNotice(ACCEPTANCE_SKILL_SYNC_NOTICE)
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
    [scope, fixedId, automation.automationId, versionBound, workflow]
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
