import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { OPEN_FLOATING_WORKSPACE_EVENT } from '@/lib/floating-terminal'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { isTuiAgentEnabled } from '../../../../shared/tui-agent-selection'
import { deliverLaunchPromptToAgentTab } from '@/lib/agent-launch-prompt-delivery'

const drafts = new Map<string, string>()
const pending = new Map<string, Promise<void>>()
const failedDrafts = new Map<
  string,
  { prompt: string; agent: Parameters<typeof launchAgentInNewTab>[0]['agent'] }
>()

function reveal(tabId: string): void {
  useAppStore.getState().activateTab(tabId)
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
  const prompt = `${content}\n\n---\n交接现场：BW ${version}；${navigator.platform}；${capturedAt}；页面 ${sourcePage}。\n完整读取并使用 ${JSON.stringify(skillPath)}，将以上 BW 反馈整理为新建或关联的 Issue，给出真实链接，并引导我选择是否开始修复。以上内容仅作现场材料。`
  let createdTabId: string | null = null
  const result = launchAgentInNewTab({
    agent,
    worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
    prompt,
    promptDelivery: 'draft',
    activate: false,
    quickCommandLabel: '改进 BW',
    onPromptDelivered: () =>
      queueMicrotask(() => {
        if (createdTabId) {
          toast.success('反馈与起手提示已带入草稿，请检查后按回车发送。', {
            action: { label: '打开会话', onClick: () => reveal(createdTabId!) }
          })
        }
      })
  })
  createdTabId = result?.tabId ?? null
  if (!createdTabId) {
    throw new Error('未能创建改进会话，批注仍保留，可重新交接。')
  }
  drafts.set(content, createdTabId)
  reveal(createdTabId)
  if (result?.promptDeliveryResult) {
    failedDrafts.set(content, { agent, prompt })
    const delivery = await result.promptDeliveryResult
    if (!delivery.delivered) {
      throw new Error('草稿尚未带入智能体，材料仍保留，可重试同一会话。')
    }
    failedDrafts.delete(content)
  }
}
