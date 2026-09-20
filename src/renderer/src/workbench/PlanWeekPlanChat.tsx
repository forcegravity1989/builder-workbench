import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import NativeChatView from '@/components/native-chat/NativeChatView'
import {
  setActivityTerminalPortals,
  type ActivityTerminalPortalTarget
} from '@/components/activity/activity-terminal-portal'
import { isAgentSessionHandleProvider } from '../../../shared/agent-session-provider-handle'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { requestBackgroundTerminalWorktreeMount } from '@/components/terminal/background-terminal-worktree-mount'
import { SYNC_FIT_PANES_EVENT } from '@/constants/terminal'
import {
  findWeekPlanStructuredTabInProject,
  findWeekPlanTerminalTabInProject,
  launchWeekPlanSession,
  rememberWeekPlanSession,
  resolveWeekPlanHomeWorktreeId,
  resolveWeekPlanPaneKey,
  WEEK_PLAN_SESSION_LABEL,
  weekPlanProjectKey,
  weekPlanProjectWorktreeIds,
  type WeekPlanLaunchResult
} from './plan-week-plan-session'
import { readWeekPlanSessionAnchor } from './plan-week-plan-anchor'

const PLAN_PORTAL_SLOT = 'plan-week-plan'

export function PlanWeekPlanChat(): React.JSX.Element {
  const {
    worktreeId,
    homeWorktreeId,
    projectKey,
    sessionWorktreeId,
    terminalTab,
    structuredTab,
    paneKey
  } = useAppStore(
    useShallow((state) => {
      const activeWorktreeId = state.activeWorktreeId
      const worktrees = state.allWorktrees?.() ?? []
      const projectWorktreeIds = activeWorktreeId
        ? weekPlanProjectWorktreeIds(activeWorktreeId, worktrees)
        : []
      const projectKey = activeWorktreeId
        ? weekPlanProjectKey(state.getKnownWorktreeById(activeWorktreeId), activeWorktreeId)
        : null
      const anchor = projectKey ? readWeekPlanSessionAnchor(projectKey) : null
      const homeWorktreeId = activeWorktreeId
        ? resolveWeekPlanHomeWorktreeId({
            activeWorktreeId,
            projectWorktreeIds,
            worktrees,
            storedWorktreeId: anchor?.worktreeId
          })
        : null
      const foundTerminal = activeWorktreeId
        ? findWeekPlanTerminalTabInProject({
            activeWorktreeId,
            tabsByWorktree: state.tabsByWorktree,
            projectWorktreeIds,
            storedTabId: anchor?.tabId,
            storedWorktreeId: anchor?.worktreeId,
            worktrees
          })
        : undefined
      const foundStructured = activeWorktreeId
        ? findWeekPlanStructuredTabInProject({
            activeWorktreeId,
            unifiedTabsByWorktree: state.unifiedTabsByWorktree,
            projectWorktreeIds,
            storedTabId: anchor?.tabId,
            storedWorktreeId: anchor?.worktreeId,
            worktrees
          })
        : undefined
      const foundTerminalTab = foundTerminal?.tab ?? null
      return {
        worktreeId: activeWorktreeId,
        homeWorktreeId,
        projectKey,
        sessionWorktreeId: foundTerminal?.worktreeId ?? foundStructured?.worktreeId ?? null,
        terminalTab: foundTerminalTab,
        structuredTab: foundStructured?.tab ?? null,
        paneKey: foundTerminalTab
          ? resolveWeekPlanPaneKey(
              foundTerminalTab.id,
              state.terminalLayoutsByTabId[foundTerminalTab.id]
            )
          : null
      }
    })
  )
  const [hostEl, setHostEl] = useState<HTMLElement | null>(null)
  const [launchState, setLaunchState] = useState<WeekPlanLaunchResult | null>(null)
  const [launchProjectKey, setLaunchProjectKey] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)
  const scopedLaunch = launchProjectKey === projectKey ? launchState : null
  const portalWorktreeId =
    sessionWorktreeId ??
    (scopedLaunch && scopedLaunch.kind !== 'failed' ? scopedLaunch.worktreeId : null)
  const portalPaneKey = paneKey ?? (scopedLaunch?.kind === 'terminal' ? scopedLaunch.paneKey : null)
  const portalTabId =
    terminalTab?.id ?? (scopedLaunch?.kind === 'terminal' ? scopedLaunch.tabId : null)
  const setHost = useCallback((node: HTMLElement | null) => {
    setHostEl(node)
  }, [])

  const start = useCallback(async (targetWorktreeId: string, targetProjectKey: string) => {
    setLaunching(true)
    setLaunchProjectKey(targetProjectKey)
    setLaunchState(null)
    const result = await launchWeekPlanSession(targetWorktreeId)
    setLaunchState(result)
    setLaunching(false)
  }, [])

  useEffect(() => {
    if (
      !homeWorktreeId ||
      !projectKey ||
      launching ||
      terminalTab ||
      structuredTab ||
      portalTabId ||
      scopedLaunch
    ) {
      return
    }
    void start(homeWorktreeId, projectKey)
  }, [
    homeWorktreeId,
    launching,
    portalTabId,
    projectKey,
    scopedLaunch,
    start,
    structuredTab,
    terminalTab
  ])

  useEffect(() => {
    if (!portalWorktreeId || !portalTabId) {
      return
    }
    requestBackgroundTerminalWorktreeMount({
      worktreeId: portalWorktreeId,
      tabIds: [portalTabId]
    })
  }, [portalTabId, portalWorktreeId])

  const portalDescriptors = useMemo(() => {
    if (!portalWorktreeId || !hostEl || !portalTabId || !portalPaneKey || structuredTab) {
      return [] as ActivityTerminalPortalTarget[]
    }
    return [
      {
        slotId: PLAN_PORTAL_SLOT,
        requestToken: `${PLAN_PORTAL_SLOT}:${portalPaneKey}`,
        target: hostEl,
        worktreeId: portalWorktreeId,
        tabId: portalTabId,
        paneKey: portalPaneKey,
        active: true
      }
    ]
  }, [hostEl, portalPaneKey, portalTabId, portalWorktreeId, structuredTab])

  useLayoutEffect(() => {
    setActivityTerminalPortals(portalDescriptors)
  }, [portalDescriptors])

  useEffect(() => {
    if (portalDescriptors.length === 0) {
      return
    }
    window.dispatchEvent(new Event(SYNC_FIT_PANES_EVENT))
  }, [portalDescriptors])

  useEffect(() => {
    return () => setActivityTerminalPortals([])
  }, [])

  const runtimeTarget = useMemo(() => {
    if (!portalWorktreeId || !structuredTab) {
      return null
    }
    return getActiveRuntimeTarget({
      activeRuntimeEnvironmentId: getRuntimeEnvironmentIdForWorktree(
        useAppStore.getState(),
        portalWorktreeId
      )
    })
  }, [portalWorktreeId, structuredTab])

  const providerSession = useAppStore((state) =>
    portalPaneKey ? state.agentStatusByPaneKey[portalPaneKey]?.providerSession : undefined
  )
  useEffect(() => {
    if (!portalWorktreeId || !portalTabId) {
      return
    }
    rememberWeekPlanSession(portalWorktreeId, portalTabId, providerSession)
  }, [portalTabId, portalWorktreeId, providerSession])

  const failed = scopedLaunch?.kind === 'failed' ? scopedLaunch.error : null
  const hasSession = Boolean(portalTabId || structuredTab)
  const structuredAgent = structuredTab?.agentSessionAgent
  const emptyCopy = emptyStateCopy({
    worktreeId,
    failed,
    launching,
    hasSession
  })

  return (
    <div className="chat" data-plan-week-plan-chat="">
      <div className="chat-top">
        <span className="tab is-on">Claude Code</span>
        <span className="wb-muted wb-mono" style={{ marginLeft: 'auto', fontSize: 10 }}>
          {WEEK_PLAN_SESSION_LABEL}
        </span>
      </div>
      <div className="chat-session">
        <div className="chat-session-host" ref={setHost}>
          {structuredTab && runtimeTarget && isAgentSessionHandleProvider(structuredAgent) ? (
            <NativeChatView
              mode="structured"
              tabId={structuredTab.id}
              sessionId={structuredTab.entityId}
              agent={structuredAgent}
              isVisible
              isFocusedGroup
              target={runtimeTarget}
            />
          ) : null}
        </div>
        {emptyCopy ? (
          <div className="chat-session-empty">
            <p>{emptyCopy.title}</p>
            {emptyCopy.detail ? <p className="wb-muted">{emptyCopy.detail}</p> : null}
            {emptyCopy.action ? (
              <button
                className="wb-btn wb-btn-primary wb-btn-sm"
                type="button"
                disabled={!worktreeId || launching}
                onClick={() => {
                  if (homeWorktreeId && projectKey) {
                    void start(homeWorktreeId, projectKey)
                  }
                }}
              >
                {emptyCopy.action}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function emptyStateCopy(args: {
  worktreeId: string | null | undefined
  failed: string | null
  launching: boolean
  hasSession: boolean
}): { title: string; detail?: string; action?: string } | null {
  if (!args.worktreeId) {
    return { title: '先在左侧选一个项目', detail: '选好之后会在这里启动 Claude Code。' }
  }
  if (args.hasSession) {
    return null
  }
  if (args.failed && !args.launching) {
    return { title: args.failed, action: '重试' }
  }
  return { title: '正在启动 Claude Code…' }
}
