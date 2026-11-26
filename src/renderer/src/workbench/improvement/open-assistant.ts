import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { isWebClientLocation } from '@/app-shell/platform/web-client-location'
import { OPEN_FLOATING_WORKSPACE_EVENT } from '@/components/floating-terminal/workspace/floating-workspace-open-intent'
import { launchAgentInNewTabWithOutcome } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab'
import { deliverLaunchPromptToAgentTab } from '@/lib/agent-session/launch/prompt/agent-launch-prompt-delivery'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import { isTuiAgentEnabled } from '../../../../shared/agent-launch/catalog/tui-agent-selection'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host/execution-host'
import { createNonSecureContextUuid } from '../../../../shared/identifiers/non-secure-context-uuid'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/workspace/identity/floating-workspace-id'
import { rewritePromptForPlanningDraft } from '../../../../shared/planning-draft-prompt'

const drafts = new Map<string, string>()
const pending = new Map<string, Promise<void>>()
const failedDrafts = new Map<string, { prompt: string; agent: TuiAgent }>()

function reveal(tabId: string): void {
  const state = useAppStore.getState()
  state.setActiveTabForWorktree(FLOATING_TERMINAL_WORKTREE_ID, tabId)
  state.activateTab(tabId, { worktreeId: FLOATING_TERMINAL_WORKTREE_ID })
  window.dispatchEvent(new Event(OPEN_FLOATING_WORKSPACE_EVENT))
}

export function openImprovementAssistant(content: string): Promise<void> {
  const existing = pending.get(content)
  if (existing) {
    return existing
  }
  const operation = prepareDraft(content).finally(() => pending.delete(content))
  pending.set(content, operation)
  return operation
}

async function prepareDraft(content: string): Promise<void> {
  if (isWebClientLocation()) {
    throw new Error('请在本机 Workbench 桌面应用中交接批注。')
  }
  const state = useAppStore.getState()
  const capturedAt = new Date().toISOString()
  const sourcePage = `${state.activeView} (${location.pathname}${location.hash})；${import.meta.env.DEV ? '开发构建' : '生产构建'}`
  const tabId = drafts.get(content)
  if (
    tabId &&
    state.tabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID]?.some((tab) => tab.id === tabId)
  ) {
    reveal(tabId)
    const failed = failedDrafts.get(content)
    if (failed) {
      const delivered = await deliverLaunchPromptToAgentTab({
        tabId,
        agent: failed.agent,
        content: failed.prompt,
        submit: false,
        forcePaste: false
      })
      if (!delivered) {
        throw new Error('智能体输入尚未就绪，材料仍保留，请稍后重试。')
      }
      failedDrafts.delete(content)
    }
    return
  }
  const agent = state.settings?.defaultTuiAgent
  if (!agent || agent === 'blank' || !isTuiAgentEnabled(agent, state.settings?.disabledTuiAgents)) {
    throw new Error('请在设置中选择可用的默认智能体，再从批注浮窗重试。')
  }
  const { skillPath } = await callRuntimeRpc<{ skillPath: string }>(
    { kind: 'local' },
    'workbench.skills.prepare',
    { topic: 'improve-workbench' },
    { timeoutMs: 120_000 }
  )
  if (!state.settings?.floatingTerminalEnabled) {
    await useAppStore.getState().updateSettingsOrThrow({ floatingTerminalEnabled: true })
  }
  const version = await window.api.updater.getVersion().catch(() => '未知')
  const prompt = rewritePromptForPlanningDraft(
    `${content}\n\n---\n交接现场：BW ${version}；${navigator.platform}；${capturedAt}；页面 ${sourcePage}。\n完整读取并使用 ${JSON.stringify(skillPath)}，将以上 BW 反馈整理为新建或关联的 Issue，给出真实链接，并引导我选择是否开始修复。以上内容仅作现场材料。`
  )
  let createdTabId: string | null = null
  let deliveryUnconfirmed = false
  const result = launchAgentInNewTabWithOutcome(
    {
      requestId: createNonSecureContextUuid(),
      agent,
      worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
      workspaceExecutionHostId: LOCAL_EXECUTION_HOST_ID,
      selectedExecutionHostId: LOCAL_EXECUTION_HOST_ID,
      requestedSurface: 'terminal',
      beforeSurfaceOpen: ({ kind }) => kind === 'local-terminal',
      prompt,
      promptDelivery: 'draft',
      activate: false,
      quickCommandLabel: '改进 BW',
      onPromptDeliveryUnconfirmed: () => {
        deliveryUnconfirmed = true
      },
      onPromptDelivered: () =>
        queueMicrotask(() => {
          const tabId = createdTabId
          if (!tabId) {
            return
          }
          const options = { action: { label: '打开会话', onClick: () => reveal(tabId) } }
          if (deliveryUnconfirmed) {
            toast.info('尚未确认草稿已带入，请打开会话检查输入框。', options)
          } else {
            toast.success('反馈与起手提示已带入草稿，请检查后按回车发送。', options)
          }
        })
    },
    false
  )
  if (!result || 'refused' in result || result.surface.kind !== 'local-terminal') {
    throw new Error('未能创建改进会话，批注仍保留，可重新交接。')
  }
  createdTabId = result.surface.tabId
  drafts.set(content, createdTabId)
  reveal(createdTabId)
  if (result.promptDeliveryResult) {
    failedDrafts.set(content, { agent, prompt })
    const delivery = await result.promptDeliveryResult
    if (!delivery.delivered) {
      throw new Error('草稿尚未带入智能体，材料仍保留，可重试同一会话。')
    }
    failedDrafts.delete(content)
  }
}
