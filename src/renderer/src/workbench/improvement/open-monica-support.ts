import type { Bot, BotAgent } from '../../../../shared/bot-types'
import { ownBotHost } from '@/lib/bot-hosts'
import { openBotHomeTab, refreshBotHost } from '@/lib/bot-catalog'
import { readHostBots, stampBotHost } from '@/lib/bot-catalog-snapshot'
import { selectFrontTab } from '@/store/slices/tabs/active-tab-selection'
import { isBotHomeTab, isLocalBotChatTab } from '../../../../shared/bots/bot-home-tab'
import { MONICA_SUPPORT_ROLE } from '../../../../shared/workbench/monica-support-role'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { useAppStore } from '@/store'
import { getRepoRowIdentity } from '@/store/repos/repo-host-identity'
import { getRepoExecutionHostId } from '../../../../shared/execution-host/execution-host'
import { normalizeStoredWorkbenchVersionBinding } from '../../../../shared/workbench/version-binding'
import type { MonicaNavigationContext } from '../../../../shared/workbench/monica-support'
import { getProjectPage } from '../project-page-state'
import { isWorkbenchBotWorkspace } from '../project-source-resolution'

function navigationContext(): MonicaNavigationContext | null | undefined {
  const state = useAppStore.getState()
  const page = getProjectPage()
  if (page?.kind === 'wall') {
    return null
  }
  const source = page?.kind === 'cycle' ? page.options.scope : page?.options
  if (!page && isWorkbenchBotWorkspace(state.activeWorkspaceKey)) {
    const tab = selectFrontTab(state)
    const monica = readHostBots('local').find((bot) => bot.templateId === MONICA_SUPPORT_ROLE)
    return tab && monica && isLocalBotChatTab(tab, monica) && isBotHomeTab(tab, monica)
      ? undefined
      : null
  }
  const repoId = page ? source?.repoId : state.activeRepoId
  const hostId = page ? source?.hostId : state.activeWorkspaceExecutionHostId
  const matches = state.repos.filter(
    (repo) => repo.id === repoId && (!hostId || getRepoExecutionHostId(repo) === hostId)
  )
  if (matches.length !== 1) {
    return null
  }
  const repo = matches[0]!
  const tree =
    !page && state.activeWorktreeId
      ? state.getKnownWorktreeById(state.activeWorktreeId, hostId ?? undefined)
      : null
  const version =
    page?.kind === 'cycle' || page?.kind === 'version-overview'
      ? page.options.version
      : tree?.repoId === repo.id
        ? normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)?.version
        : undefined
  return { name: repo.displayName, project: getRepoRowIdentity(repo), version }
}

export async function openMonicaSupport(agent?: BotAgent): Promise<string | undefined> {
  const { hostId, target } = ownBotHost()
  const { bot, skillWarning } = await callRuntimeRpc<{ bot: Bot; skillWarning?: string }>(
    target,
    'workbench.support.open',
    { agent, navigation: navigationContext() },
    { timeoutMs: 120_000 }
  )
  await refreshBotHost(hostId)
  const opened = await openBotHomeTab(stampBotHost(hostId, bot), { requireChat: true })
  if (!opened) {
    throw new Error('Could not open the Monica conversation. Try again from Help.')
  }
  return skillWarning
}
