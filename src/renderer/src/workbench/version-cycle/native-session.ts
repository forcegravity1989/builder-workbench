import { useAppStore } from '@/store'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { launchAiVaultSessionInNewTab } from '@/lib/launch-ai-vault-session'
import { prepareAiVaultSessionForResume } from '@/lib/ai-vault-session-resume-preparation'
import { buildAiVaultResumeStartupForWorktree } from '@/lib/ai-vault-resume-command'
import {
  revealStructuredSession,
  refreshStructuredSessionTabs
} from '@/lib/activate-ai-vault-structured-session'
import { findOriginalAiVaultSessionPane } from '@/components/right-sidebar/ai-vault-original-pane'
import { requestBackgroundTerminalWorktreeMount } from '@/components/terminal/background-terminal-worktree-mount'
import { toWebTerminalSurfaceTabId } from '@/runtime/web-terminal-surface-id'
import { refreshWebRuntimeSessionTabsSnapshot } from '@/runtime/web-runtime-session'
import { getRuntimeEnvironmentRevision } from '@/runtime/runtime-environment-revision'
import { insertNativeChatDraft } from '@/lib/native-chat-draft-insertion'
import { structuredAgentSessionPaneKey } from '../../../../shared/structured-agent-session-projection'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { CycleScope, CycleSession } from './ports'
import { seedTerminalLayoutIfNeeded } from './terminal-pane-layout'
import { cycleScopeForWorktree, cycleScopeKey } from './native-cycle-workspace'

/** Launch routing is native: the fixed worktree is the actual selected workspace. */
export function assertCycleWorkspace(scope: CycleScope, worktreeId: string) {
  const state = useAppStore.getState()
  const worktree = state.getKnownWorktreeById(
    worktreeId,
    state.activeWorkspaceExecutionHostId ?? undefined
  )
  if (
    !worktree ||
    state.activeWorktreeId !== worktreeId ||
    cycleScopeKey(cycleScopeForWorktree(worktree, scope.workflow)) !== cycleScopeKey(scope)
  ) {
    throw new Error('工作区已切换，请回到对应流程后重试')
  }
}

export function bindCycleTab(scope: CycleScope, worktreeId: string, tabId: string): CycleSession {
  const state = useAppStore.getState()
  const structured = state.unifiedTabsByWorktree[worktreeId]?.find(
    (tab) => tab.id === tabId && tab.contentType === 'agent-session'
  )
  if (structured) {
    return {
      ...scope,
      worktreeId,
      tabId,
      sessionId: structured.entityId,
      paneKey: structuredAgentSessionPaneKey(tabId, structured.entityId),
      kind: 'structured',
      title: structured.customLabel || structured.label
    }
  }
  const tab = state.tabsByWorktree[worktreeId]?.find((item) => item.id === tabId)
  if (!tab) {
    throw new Error('会话已创建，等待原生工作区同步后从历史中打开')
  }
  const { paneKey, snapshot } = seedTerminalLayoutIfNeeded(
    tabId,
    state.terminalLayoutsByTabId[tabId]
  )
  if (snapshot) {
    state.setTabLayout(tabId, snapshot)
  }
  requestBackgroundTerminalWorktreeMount({ worktreeId, tabIds: [tabId] })
  return {
    ...scope,
    worktreeId,
    tabId,
    paneKey,
    kind: 'terminal',
    sessionId: tabId,
    title: tab.customTitle || tab.title || '会话'
  }
}

function bindStructured(scope: CycleScope, worktreeId: string, sessionId: string) {
  const tab = useAppStore
    .getState()
    .unifiedTabsByWorktree[worktreeId]?.find(
      (item) => item.contentType === 'agent-session' && item.entityId === sessionId
    )
  if (!tab) {
    throw new Error('原生会话尚未同步，请从历史中重试打开')
  }
  return bindCycleTab(scope, worktreeId, tab.id)
}

export async function startCycleSession(
  scope: CycleScope,
  worktreeId: string,
  agent: TuiAgent,
  prompt: string
) {
  assertCycleWorkspace(scope, worktreeId)
  const launched = launchAgentInNewTab({
    agent,
    worktreeId,
    prompt,
    activate: false,
    promptDelivery: 'auto-submit'
  })
  if (!launched) {
    throw new Error('无法准备会话启动请求')
  }
  if (launched.tabId) {
    return bindCycleTab(scope, worktreeId, launched.tabId)
  }
  if (launched.structuredSettlement) {
    const result = await launched.structuredSettlement
    if (result.kind === 'structured') {
      return bindStructured(scope, worktreeId, result.sessionId)
    }
    if (result.kind === 'refused-then-legacy' && result.primaryTabId) {
      return bindCycleTab(scope, worktreeId, result.primaryTabId)
    }
    throw new Error(
      result.kind === 'failed' ? String(result.error) : '会话启动尚未确认，请核对原生会话历史'
    )
  }
  const result = await launched.runtimeLaunch
  if (!result?.hostTabId) {
    throw new Error('未收到宿主会话身份，请核对原生会话历史')
  }
  return bindCycleTab(scope, worktreeId, toWebTerminalSurfaceTabId(result.hostTabId))
}

export async function openCycleHistory(
  scope: CycleScope,
  worktreeId: string,
  session: AiVaultSession
) {
  assertCycleWorkspace(scope, worktreeId)
  const environmentId = scope.runtimeOwnerEnvironmentId
  const pairingRevision = environmentId ? getRuntimeEnvironmentRevision(environmentId) : undefined
  if (session.structuredSession) {
    const pointer = session.structuredSession
    if (pointer.workspaceId !== worktreeId) {
      throw new Error('历史会话不属于当前工作区')
    }
    const existing = useAppStore
      .getState()
      .unifiedTabsByWorktree[worktreeId]?.some(
        (tab) => tab.contentType === 'agent-session' && tab.entityId === pointer.sessionId
      )
    if (!existing) {
      const outcome = await revealStructuredSession({ worktreeId, sessionId: pointer.sessionId })
      if (outcome !== 'revealed') {
        throw new Error(`原生会话暂不可打开：${outcome}`)
      }
      await (environmentId
        ? refreshWebRuntimeSessionTabsSnapshot(environmentId, worktreeId, {
            expectedEnvironmentPairingRevision: pairingRevision,
            acceptCurrentSnapshot: true,
            afterCurrentInFlight: true,
            errorMode: 'throw'
          })
        : refreshStructuredSessionTabs(worktreeId))
    }
    assertCycleWorkspace(scope, worktreeId)
    return bindStructured(scope, worktreeId, pointer.sessionId)
  }
  const state = useAppStore.getState()
  const pane = findOriginalAiVaultSessionPane(state, session, {
    worktreeId,
    allowPromptFallback: false
  })
  if (pane && pane.worktreeId === worktreeId) {
    return { ...bindCycleTab(scope, worktreeId, pane.tabId), paneKey: pane.paneKey }
  }
  const prepared = await prepareAiVaultSessionForResume(session)
  assertCycleWorkspace(scope, worktreeId)
  const startup = buildAiVaultResumeStartupForWorktree({
    state: useAppStore.getState(),
    worktreeId,
    session: prepared,
    commandOverride: state.settings?.agentCmdOverrides?.[session.agent]
  })
  const result = launchAiVaultSessionInNewTab({
    ...startup,
    agent: session.agent,
    worktreeId,
    activate: false
  })
  if (result.tabId !== null) {
    return bindCycleTab(scope, worktreeId, result.tabId)
  }
  const created = await result.runtimeLaunch
  if (created.status !== 'created' || !created.hostTabId) {
    throw new Error('恢复结果尚未确认，请从原生历史核对')
  }
  return bindCycleTab(scope, worktreeId, toWebTerminalSurfaceTabId(created.hostTabId))
}

export async function prepareCycleRequest(session: CycleSession, text: string) {
  assertCycleWorkspace(session, session.worktreeId)
  if (
    !session.paneKey ||
    !insertNativeChatDraft({ tabId: session.tabId, paneKey: session.paneKey, text })
  ) {
    throw new Error('请先切换到此会话的聊天输入框，再准备请求')
  }
}
