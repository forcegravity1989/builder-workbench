import type { AgentProviderSessionMetadata } from '../../../shared/agent-session-resume'
import { isTuiAgentEnabled } from '../../../shared/tui-agent-selection'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { requestBackgroundTerminalWorktreeMount } from '@/components/terminal/background-terminal-worktree-mount'
import { resolveAgentResumeLaunchTarget } from '@/lib/agent-resume-launch-target'
import { getLocalProjectExecutionRuntimeContext } from '@/lib/local-preflight-context'
import { getConnectionIdFromState } from '@/lib/connection-context'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { buildAgentResumeStartupPlan } from '@/lib/tui-agent-startup'
import { tuiAgentToAgentKind } from '@/lib/telemetry'
import { useAppStore } from '@/store'
import {
  readWeekPlanSessionAnchor,
  writeWeekPlanSessionAnchor,
  type WeekPlanSessionAnchor
} from './plan-week-plan-anchor'
import {
  WEEK_PLAN_SESSION_LABEL,
  findWeekPlanStructuredTabInProject,
  findWeekPlanTerminalTabInProject,
  resolveWeekPlanHomeWorktreeId,
  seedWeekPlanLayoutIfNeeded,
  weekPlanProjectKey,
  weekPlanProjectWorktreeIds
} from './plan-week-plan-identity'
import {
  buildWeekPlanInjectPrompt,
  resolveWeekPlanInjectInput,
  WEEK_PLAN_PROMPT_DELIVERY
} from './plan-week-planning-prompt'

export {
  WEEK_PLAN_SESSION_LABEL,
  findWeekPlanStructuredTab,
  findWeekPlanStructuredTabInProject,
  findWeekPlanTerminalTab,
  findWeekPlanTerminalTabInProject,
  isWeekPlanStructuredTab,
  isWeekPlanTerminalTab,
  isWeekPlanWorktreeName,
  resolveWeekPlanHomeWorktreeId,
  resolveWeekPlanPaneKey,
  seedWeekPlanLayoutIfNeeded,
  weekPlanProjectKey,
  weekPlanProjectWorktreeIds
} from './plan-week-plan-identity'
export type {
  WeekPlanStructuredHit,
  WeekPlanTabHit,
  WeekPlanWorktreeRef
} from './plan-week-plan-identity'

const inflightByProject = new Map<
  string,
  Promise<Extract<WeekPlanLaunchResult, { kind: 'terminal' | 'structured' }>>
>()

export type WeekPlanLaunchResult =
  | { kind: 'terminal'; tabId: string; paneKey: string; worktreeId: string }
  | { kind: 'structured'; tabId: string; sessionId: string; worktreeId: string }
  | { kind: 'failed'; error: string }

export function rememberWeekPlanSession(
  worktreeId: string,
  tabId: string,
  providerSession?: AgentProviderSessionMetadata | null
): void {
  const projectKey = weekPlanProjectKey(
    useAppStore.getState().getKnownWorktreeById(worktreeId),
    worktreeId
  )
  const previous = readWeekPlanSessionAnchor(projectKey)
  const sessionId =
    providerSession?.key === 'session_id' ? providerSession.id.trim() : previous?.sessionId
  const transcriptPath =
    providerSession?.key === 'session_id'
      ? providerSession.transcriptPath?.trim()
      : previous?.transcriptPath
  writeWeekPlanSessionAnchor(projectKey, {
    tabId,
    worktreeId,
    ...(sessionId ? { sessionId } : {}),
    ...(transcriptPath ? { transcriptPath } : {})
  })
}

export async function launchWeekPlanSession(worktreeId: string): Promise<WeekPlanLaunchResult> {
  const projectKey = weekPlanProjectKey(
    useAppStore.getState().getKnownWorktreeById(worktreeId),
    worktreeId
  )
  const pending = inflightByProject.get(projectKey)
  if (pending) {
    return pending.catch((error: unknown) => ({ kind: 'failed', error: launchErrorMessage(error) }))
  }
  const run = launchWeekPlanSessionOnce(worktreeId)
  inflightByProject.set(projectKey, run)
  try {
    return await run
  } catch (error) {
    return { kind: 'failed', error: launchErrorMessage(error) }
  } finally {
    if (inflightByProject.get(projectKey) === run) {
      inflightByProject.delete(projectKey)
    }
  }
}

async function launchWeekPlanSessionOnce(
  worktreeId: string
): Promise<Extract<WeekPlanLaunchResult, { kind: 'terminal' | 'structured' }>> {
  const store = useAppStore.getState()
  if (!store.getKnownWorktreeById(worktreeId)) {
    throw new Error('没有可用的工作区')
  }
  if (!isTuiAgentEnabled('claude', store.settings?.disabledTuiAgents)) {
    throw new Error('Claude Code 未启用')
  }
  const worktrees = store.allWorktrees?.() ?? []
  const projectWorktreeIds = weekPlanProjectWorktreeIds(worktreeId, worktrees)
  const projectKey = weekPlanProjectKey(store.getKnownWorktreeById(worktreeId), worktreeId)
  const anchor = readWeekPlanSessionAnchor(projectKey)
  const homeWorktreeId = resolveWeekPlanHomeWorktreeId({
    activeWorktreeId: worktreeId,
    projectWorktreeIds,
    worktrees,
    storedWorktreeId: anchor?.worktreeId
  })
  const existingTerminal = findWeekPlanTerminalTabInProject({
    activeWorktreeId: worktreeId,
    tabsByWorktree: store.tabsByWorktree,
    projectWorktreeIds,
    storedTabId: anchor?.tabId,
    storedWorktreeId: anchor?.worktreeId,
    worktrees
  })
  if (existingTerminal) {
    return bindTerminalWeekPlanTab(existingTerminal.worktreeId, existingTerminal.tab.id)
  }
  const existingStructured = findWeekPlanStructuredTabInProject({
    activeWorktreeId: worktreeId,
    unifiedTabsByWorktree: store.unifiedTabsByWorktree,
    projectWorktreeIds,
    storedTabId: anchor?.tabId,
    storedWorktreeId: anchor?.worktreeId,
    worktrees
  })
  if (existingStructured) {
    return bindStructuredWeekPlanTab(existingStructured.worktreeId, existingStructured.tab.entityId)
  }
  const resumed = resumeWeekPlanSession(homeWorktreeId, anchor)
  if (resumed) {
    return resumed
  }
  const homeWorktree = store.getKnownWorktreeById(homeWorktreeId)
  const workspacePath = homeWorktree?.path?.trim()
  if (!workspacePath) {
    throw new Error('没有可用的工作区')
  }
  const prompt = buildWeekPlanInjectPrompt(
    await resolveWeekPlanInjectInput({
      workspacePath,
      mainProjectPath: resolveMainProjectPath(homeWorktreeId, projectWorktreeIds, store)
    })
  )
  const launched = launchAgentInNewTab({
    agent: 'claude',
    worktreeId: homeWorktreeId,
    quickCommandLabel: WEEK_PLAN_SESSION_LABEL,
    launchSource: 'task_page',
    activate: false,
    prompt,
    promptDelivery: WEEK_PLAN_PROMPT_DELIVERY
  })
  if (launched?.tabId) {
    return bindTerminalWeekPlanTab(homeWorktreeId, launched.tabId)
  }
  const settlement = await launched?.structuredSettlement
  if (settlement?.kind === 'structured') {
    return bindStructuredWeekPlanTab(homeWorktreeId, settlement.sessionId)
  }
  if (settlement?.kind === 'refused-then-legacy' && settlement.primaryTabId) {
    return bindTerminalWeekPlanTab(homeWorktreeId, settlement.primaryTabId)
  }
  throw new Error('无法启动 Claude Code')
}

function resolveMainProjectPath(
  homeWorktreeId: string,
  projectWorktreeIds: readonly string[],
  store: ReturnType<typeof useAppStore.getState>
): string {
  const allowed = new Set(projectWorktreeIds)
  const main = (store.allWorktrees?.() ?? []).find((wt) => allowed.has(wt.id) && wt.isMainWorktree)
  return main?.path?.trim() || store.getKnownWorktreeById(homeWorktreeId)?.path?.trim() || ''
}

function resumeWeekPlanSession(
  worktreeId: string,
  anchor: WeekPlanSessionAnchor | null
): Extract<WeekPlanLaunchResult, { kind: 'terminal' }> | null {
  const sessionId = anchor?.sessionId?.trim()
  if (!anchor || !sessionId) {
    return null
  }
  const store = useAppStore.getState()
  const resumeWorktreeId = store.getKnownWorktreeById(anchor.worktreeId)
    ? anchor.worktreeId
    : worktreeId
  const worktree = store.getKnownWorktreeById(resumeWorktreeId)
  const providerSession: AgentProviderSessionMetadata = {
    key: 'session_id',
    id: sessionId,
    ...(anchor.transcriptPath ? { transcriptPath: anchor.transcriptPath } : {})
  }
  const resumeTarget = resolveAgentResumeLaunchTarget({
    projectRuntime: getLocalProjectExecutionRuntimeContext(store, resumeWorktreeId),
    connectionId: getConnectionIdFromState(store, resumeWorktreeId),
    executionHostId: getExecutionHostIdForWorktree(store, resumeWorktreeId),
    worktreePath: worktree?.path,
    terminalWindowsShell: store.settings?.terminalWindowsShell
  })
  const startupPlan = buildAgentResumeStartupPlan({
    agent: 'claude',
    providerSession,
    cmdOverrides: store.settings?.agentCmdOverrides ?? {},
    platform: resumeTarget.platform,
    shell: resumeTarget.shell
  })
  if (!startupPlan) {
    return null
  }
  const tab = store.createTab(resumeWorktreeId, undefined, undefined, {
    launchAgent: 'claude',
    quickCommandLabel: WEEK_PLAN_SESSION_LABEL,
    activate: false,
    pendingStartup: {
      command: startupPlan.launchCommand,
      ...(startupPlan.env ? { env: startupPlan.env } : {}),
      launchConfig: startupPlan.launchConfig,
      resumeProviderSession: providerSession,
      launchAgent: 'claude',
      showSessionRestoredBanner: true,
      telemetry: {
        agent_kind: tuiAgentToAgentKind('claude'),
        launch_source: 'task_page',
        request_kind: 'resume'
      }
    },
    automaticResumeClaim: {
      worktreeId: resumeWorktreeId,
      launchAgent: 'claude',
      providerSession
    }
  })
  return bindTerminalWeekPlanTab(resumeWorktreeId, tab.id)
}

function bindTerminalWeekPlanTab(
  worktreeId: string,
  tabId: string
): Extract<WeekPlanLaunchResult, { kind: 'terminal' }> {
  const store = useAppStore.getState()
  store.setTabCustomTitle(tabId, WEEK_PLAN_SESSION_LABEL)
  store.pinTab(tabId)
  requestBackgroundTerminalWorktreeMount({ worktreeId, tabIds: [tabId] })
  const { paneKey, snapshot } = seedWeekPlanLayoutIfNeeded(
    tabId,
    store.terminalLayoutsByTabId[tabId]
  )
  if (snapshot) {
    store.setTabLayout(tabId, snapshot)
  }
  rememberWeekPlanSession(worktreeId, tabId)
  return { kind: 'terminal', tabId, paneKey, worktreeId }
}

function bindStructuredWeekPlanTab(
  worktreeId: string,
  sessionId: string
): Extract<WeekPlanLaunchResult, { kind: 'structured' }> {
  const store = useAppStore.getState()
  const tab = (store.unifiedTabsByWorktree[worktreeId] ?? []).find(
    (candidate) => candidate.contentType === 'agent-session' && candidate.entityId === sessionId
  )
  if (!tab) {
    throw new Error('Claude Code 会话已启动，但还没有出现在工作区')
  }
  store.setTabCustomTitle(tab.id, WEEK_PLAN_SESSION_LABEL)
  store.pinTab(tab.id)
  rememberWeekPlanSession(worktreeId, tab.id, { key: 'session_id', id: sessionId })
  return { kind: 'structured', tabId: tab.id, sessionId, worktreeId }
}

function launchErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : '无法启动 Claude Code'
}
