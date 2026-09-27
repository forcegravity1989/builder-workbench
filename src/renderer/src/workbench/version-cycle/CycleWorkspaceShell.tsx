import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { activateWebRuntimeSessionWorktree } from '@/runtime/web-runtime-worktree-activation'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'
import {
  nativeWorkspaceScope,
  nativeWorkspaceScopeKey,
  type NativeWorkspaceScope
} from './native-workspace'
import { cycleScopeForWorktree, cycleScopeKey, ensureCycleWorktree } from './native-cycle-workspace'
import { buildCyclePrompt } from './cycle-prompt'
import { prepareMetricsSession } from './metrics-setup'
import {
  bindCycleTab,
  openCycleHistory,
  prepareCycleRequest,
  startCycleSession
} from './native-session'
import { useWorkflowVersion } from './use-workflow-version'
import { useCycleAutomationDraft } from './use-cycle-automation-draft'
import { useEnsureCycleAutomation } from './ensure-cycle-automation'
import { CycleChat } from './CycleChat'
import { CycleHistoryPane } from './cycle-history-pane'
import { useAutoWorktreeBase } from './use-auto-worktree-base'
import type { CycleScope, CycleSession } from './ports'
import type { VersionCycleContext } from './cycle-context'
import { nativeVersionMaterialPort } from '../version-material-port'
import { nativeTaskPort } from '../task-port'
import { nativeArchivePort } from '../archive-port'
import { PlanningBoard } from '../version-planning/PlanningBoard'
import { AcceptancePage } from '../version-acceptance/AcceptancePage'
import { usePlanColumnResize } from '../use-plan-column-resize'
import './version-cycle.css'

/**
 * Production shell for one BW cycle workflow: formally selects the fixed native
 * worktree (host routing and history stay Orca-owned), then renders the native
 * session on the left and the material board on the right.
 */
export function CycleWorkspaceShell({ workflow }: { workflow: VersionWorkflow }) {
  const activeRepoId = useAppStore((s) => s.activeRepoId ?? s.repos[0]?.id ?? null)
  const repoWorktrees = useAppStore((s) =>
    activeRepoId ? s.worktreesByRepo[activeRepoId] : undefined
  )
  const fetchedRepo = useRef<string | null>(null)
  useEffect(() => {
    if (activeRepoId && !repoWorktrees && fetchedRepo.current !== activeRepoId) {
      fetchedRepo.current = activeRepoId
      void useAppStore
        .getState()
        .fetchWorktrees(activeRepoId)
        .catch(() => {
          // Allow a later render (focus/poll) to retry instead of staying empty.
          fetchedRepo.current = null
        })
    }
  }, [activeRepoId, repoWorktrees])

  const baseScope = useMemo<NativeWorkspaceScope | null>(() => {
    if (!activeRepoId || !repoWorktrees?.length) {
      return null
    }
    const home = repoWorktrees.find((item) => item.isMainWorktree) ?? repoWorktrees[0]
    try {
      return nativeWorkspaceScope(home)
    } catch {
      return null
    }
  }, [activeRepoId, repoWorktrees])
  /** Stable identity for effect deps: store refreshes must not retrigger setup. */
  const baseScopeKey = baseScope ? nativeWorkspaceScopeKey(baseScope) : null

  const [fixedId, setFixedId] = useState<string | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  /** While a metrics-setup handoff moves the selection, the re-select effect must stand down. */
  const metricsHandoff = useRef(false)
  // While the BW page stays mounted, its workspace is the fixed tree: if the user
  // activates another worktree from the native sidebar, re-select the fixed one so
  // history and host routing keep matching the boards.
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const repoWorktreeBasePath = useAppStore((s) => {
    const id = s.activeRepoId ?? s.repos[0]?.id ?? null
    return s.repos.find((item) => item.id === id)?.worktreeBasePath?.trim() || null
  })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const baseSettled = useAutoWorktreeBase(activeRepoId, repoWorktreeBasePath, setNotice)
  const ensureFailures = useRef<Record<string, number>>({})
  useEffect(() => {
    let current = true
    const breakerKey = `${baseScopeKey}:${workflow}`
    if ((ensureFailures.current[breakerKey] ?? 0) >= 2) {
      setSetupError(
        '固定树准备连续失败，已停止自动重试；重进本屏或按提示清理/登记占用工作树后再试。'
      )
      return
    }
    setSetupError(null)
    if (!baseScope || !baseSettled) {
      setFixedId(null)
      return
    }
    const scope: CycleScope = { ...baseScope, workflow }
    void (async () => {
      try {
        if (metricsHandoff.current) {
          return
        }
        const fixed = await ensureCycleWorktree(scope)
        if (!current) {
          return
        }
        setFixedId(fixed.id)
        const state = useAppStore.getState()
        if (metricsHandoff.current) {
          return
        }
        if (state.activeWorktreeId !== fixed.id) {
          // Formal selection keeps the BW page: activation never rewrites activeView.
          state.setActiveWorktree(fixed.id, scope.hostId)
          if (scope.runtimeOwnerEnvironmentId) {
            await activateWebRuntimeSessionWorktree({
              worktreeId: fixed.id,
              environmentId: scope.runtimeOwnerEnvironmentId
            })
          }
        }
      } catch (reason) {
        if (current) {
          ensureFailures.current[breakerKey] = (ensureFailures.current[breakerKey] ?? 0) + 1
          setSetupError(reason instanceof Error ? reason.message : String(reason))
        }
      }
    })()
    return () => {
      current = false
    }
  }, [baseScopeKey, baseSettled, workflow, activeWorktreeId])

  const cycleScope = useMemo<CycleScope | null>(() => {
    if (!baseScope || !fixedId) {
      return null
    }
    const fixed = useAppStore
      .getState()
      .allWorktrees()
      .find((item) => item.id === fixedId)
    // Wait for the native registration refresh instead of silently re-scoping
    // to the main worktree, which would route materials to the wrong tree.
    return fixed ? cycleScopeForWorktree(fixed, workflow) : null
  }, [baseScope, fixedId, workflow])

  const [session, setSessionState] = useState<CycleSession | null>(null)
  useEffect(() => {
    setSessionState((value) => (value && value.worktreeId === fixedId ? value : null))
  }, [fixedId])
  /** Tasks round-trips remount this shell; the bound native session identity survives in sessionStorage. */
  const sessionStoreKey = cycleScope ? `bw:cycle:session:${cycleScopeKey(cycleScope)}` : null
  const setSession = useCallback(
    (value: CycleSession | null) => {
      setSessionState(value)
      if (!sessionStoreKey) {
        return
      }
      try {
        if (value) {
          sessionStorage.setItem(sessionStoreKey, JSON.stringify(value))
        } else {
          sessionStorage.removeItem(sessionStoreKey)
        }
      } catch {
        /* Session restore is best-effort; history stays the authoritative entry. */
      }
    },
    [sessionStoreKey]
  )
  const restoredSessionKey = useRef<string | null>(null)
  useEffect(() => {
    if (!cycleScope || !fixedId || session || !sessionStoreKey) {
      return
    }
    if (restoredSessionKey.current === sessionStoreKey) {
      return
    }
    restoredSessionKey.current = sessionStoreKey
    try {
      const raw = sessionStorage.getItem(sessionStoreKey)
      if (!raw) {
        return
      }
      const saved = JSON.parse(raw) as CycleSession
      if (saved.worktreeId !== fixedId) {
        sessionStorage.removeItem(sessionStoreKey)
        return
      }
      // bindCycleTab re-resolves the live tab identity and throws when it is gone.
      setSession(bindCycleTab(cycleScope, fixedId, saved.tabId))
    } catch (reason) {
      // The remount-restore path must surface native-session's honest failure (tab
      // gone / PTY exited) instead of swallowing it into a silent empty column.
      setNotice(reason instanceof Error ? reason.message : String(reason))
      try {
        sessionStorage.removeItem(sessionStoreKey)
      } catch {
        /* Keep the entry; a later explicit choice overwrites it. */
      }
    }
  }, [cycleScope, fixedId, session, sessionStoreKey, setSession])
  // A history restore reveals the session in the native view first; if that reveal
  // remounts this shell, the bound session must be re-read from the live tabs or the
  // chat column stays empty while the native screen shows the session.
  useEffect(() => {
    if (session || !cycleScope || !fixedId) {
      return
    }
    const live = useAppStore
      .getState()
      .unifiedTabsByWorktree[fixedId]?.find((tab) => tab.contentType === 'agent-session')
    if (live) {
      try {
        // bindCycleTab re-resolves the live tab identity into a full CycleSession.
        setSessionState(bindCycleTab(cycleScope, fixedId, live.id))
      } catch {
        /* Tab gone between reveal and resync; stay empty and honest. */
      }
    }
  }, [cycleScope, fixedId, session])

  const detectionTarget = useAgentDetectionTargetForWorktree(fixedId)
  const { detectedIds: detectedAgents } = useDetectedAgents(detectionTarget)
  const detectedIds = useMemo(() => detectedAgents ?? [], [detectedAgents])
  const defaultAgentSetting = useAppStore((s) => s.settings?.defaultTuiAgent)
  const defaultAgent =
    defaultAgentSetting && defaultAgentSetting !== 'blank' ? defaultAgentSetting : null
  const [chosenAgent, setChosenAgent] = useState<TuiAgent | null>(null)
  const agentOptions = useMemo(() => {
    const ids = [
      ...new Set([...detectedIds, defaultAgent, chosenAgent].filter(Boolean))
    ] as TuiAgent[]
    return ids
  }, [detectedIds, defaultAgent, chosenAgent])
  const agent = chosenAgent ?? defaultAgent ?? detectedIds[0] ?? null

  /** 固定树就绪后注册一次周期自动化（默认关闭，人启用后才到点）；失败非致命，只提示。 */
  const cycleAutomation = useEnsureCycleAutomation({
    cycleScope,
    fixedId,
    workflow,
    agent,
    onNotice: setNotice
  })

  const newSession = useCallback(async () => {
    if (!cycleScope || !fixedId) {
      setNotice('固定工作树尚未就绪，请稍后重试。')
      return
    }
    if (!agent) {
      setNotice('未检测到可用会话工具，请先在设置中配置。')
      return
    }
    setBusy(true)
    try {
      const prompt = await buildCyclePrompt(cycleScope, fixedId)
      const bound = await startCycleSession(cycleScope, fixedId, agent, prompt)
      setSession(bound)
      setNotice(null)
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }, [cycleScope, fixedId, agent])

  const openHistory = useCallback(
    async (item: AiVaultSession) => {
      if (!cycleScope || !fixedId) {
        return
      }
      setBusy(true)
      try {
        const bound = await openCycleHistory(cycleScope, fixedId, item)
        setSession(bound)
        setNotice(null)
      } catch (reason) {
        setNotice(reason instanceof Error ? reason.message : String(reason))
      } finally {
        setBusy(false)
      }
    },
    [cycleScope, fixedId]
  )

  const materialScopeKey =
    cycleScope && fixedId ? `${nativeWorkspaceScopeKey(cycleScope)}:${fixedId}:${workflow}` : ''
  const materialPort = useMemo(() => {
    if (!cycleScope || !fixedId) {
      return null
    }
    try {
      return nativeVersionMaterialPort(
        { repoId: cycleScope.repoId, worktreeId: fixedId, hostId: cycleScope.hostId, workflow },
        cycleScope.runtimeOwnerEnvironmentId
      )
    } catch {
      return null
    }
    // materialScopeKey encodes scope identity + fixedId + workflow for memo stability.
  }, [materialScopeKey])
  const workflowVersion = useWorkflowVersion(materialPort)
  const selectVersion = useCallback(
    async (version: string) => {
      await workflowVersion.selectVersion(version)
    },
    [workflowVersion.selectVersion]
  )

  const ownerEnvironmentId = cycleScope?.runtimeOwnerEnvironmentId
  const taskPort = useMemo(() => nativeTaskPort(), [])
  const archivePort = useMemo(() => nativeArchivePort(ownerEnvironmentId), [ownerEnvironmentId])
  const sessionPort = useMemo(
    () => ({
      prepareRequest: (target: CycleSession, text: string) => prepareCycleRequest(target, text)
    }),
    []
  )
  const context: VersionCycleContext = {
    scope: cycleScope,
    worktreeId: fixedId,
    session,
    version: workflowVersion.version,
    sessionPort,
    taskPort,
    archivePort,
    materialPort,
    error: setupError ?? workflowVersion.error,
    selectVersion
  }

  /** 配置指标：独立固定维护树 + 原生项目会话（metrics-refresh），不借计划/验收树。 */
  const prepareMetrics = useCallback(async () => {
    if (!baseScope) {
      throw new Error('项目工作区尚未就绪')
    }
    if (!agent) {
      throw new Error('未检测到可用会话工具，请先在设置中配置')
    }
    await prepareMetricsSession({ baseScope, agent, handoff: metricsHandoff })
  }, [baseScope, agent])

  /** 配置自动化：已有 BW 身份条目则打开编辑该条；缺失则预填原生编辑器新建（固定树 existing、每次运行新会话）；启用与时间由人确认。 */
  const configureAutomation = useCycleAutomationDraft({
    cycleScope,
    fixedId,
    workflow,
    existingId: cycleAutomation.automationId,
    creationKey: cycleAutomation.creationKey,
    onError: setNotice
  })

  const resize = usePlanColumnResize()
  return (
    <div className="vc-workspace">
      <div className="vc-body" ref={resize.bodyRef}>
        <div className="vc-chat-col" ref={resize.chatColRef}>
          <div className="vc-chat-toolbar">
            <select
              aria-label="会话工具"
              value={agent ?? ''}
              disabled={busy || !fixedId || agentOptions.length === 0}
              onChange={(event) => setChosenAgent((event.target.value || null) as TuiAgent | null)}
            >
              {agentOptions.length === 0 && <option value="">无可用工具</option>}
              {agentOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <button
              className="wb-btn wb-btn-sm"
              disabled={busy || !fixedId || !agent}
              onClick={() => void newSession()}
            >
              新建本次会话
            </button>
            <button
              className="wb-btn wb-btn-ghost wb-btn-sm"
              disabled={busy || !fixedId}
              title="打开原生自动化编辑器：已有 BW 注册条目则编辑该条，否则预填新建；启用与时间由你确认"
              onClick={() => {
                setBusy(true)
                void configureAutomation().finally(() => setBusy(false))
              }}
            >
              配置自动化
            </button>
          </div>
          {(notice || setupError) && (
            <p role="alert" className="vc-notice">
              {notice ?? setupError}
            </p>
          )}
          <CycleChat session={session} />
          {cycleScope && fixedId && (
            <CycleHistoryPane
              scope={cycleScope}
              workflow={workflow}
              onOpenSession={(item) => void openHistory(item)}
            />
          )}
        </div>
        <div
          className={`vc-split${resize.isResizing ? ' is-on' : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整左右栏宽度"
          title="左右拖动调整宽度"
          onMouseDown={resize.onResizeStart}
        />
        <div className="vc-board-col">
          {workflow === 'plan' ? (
            <PlanningBoard context={context} prepareMetrics={prepareMetrics} />
          ) : (
            <AcceptancePage context={context} />
          )}
        </div>
      </div>
    </div>
  )
}
