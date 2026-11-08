import type { KeybindingActionId, KeybindingOverrides } from '../../../shared/keybindings'
import type { TuiAgent } from '../../../shared/tui-agent'
import { listBoundAgentTabActions, resolveDefaultAgentForNewTab } from '@/lib/agent-tab-shortcuts'
import { ensureAgentLaunchPreferences } from '@/runtime/agent-launch-settings/use-host-agent-launch-preferences'
import { detectAgentSessionContinuationAgents } from '@/lib/launch-agent-session-continuation'
import { isTuiAgentEnabled } from '../../../shared/tui-agent-selection'
import {
  getAgentDetectionTargetKeyForWorktree,
  parseAgentDetectionTargetKey
} from '@/hooks/useAgentDetectionTarget'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { getRuntimeEnvironmentRevision } from '@/runtime/runtime-environment-revision'

export type TerminalAgentTabShortcut = {
  actionId: KeybindingActionId | null
  agent: TuiAgent | null
}

export function getTerminalAgentShortcutOwnerKey(worktreeId: string): string | undefined {
  const state = useAppStore.getState()
  const route = getAgentDetectionTargetKeyForWorktree(state, worktreeId)
  const target = parseAgentDetectionTargetKey(route)
  if (!target) {
    return undefined
  }
  return target.kind === 'runtime'
    ? JSON.stringify([
        route,
        getRuntimeEnvironmentRevision(target.environmentId),
        state.runtimeStatusByEnvironmentId.get(target.environmentId)?.status?.runtimeId
      ])
    : route
}

export function resolveTerminalAgentTabShortcut({
  keybindings,
  matchShortcut
}: {
  keybindings: KeybindingOverrides
  matchShortcut: (actionId: KeybindingActionId) => boolean
}): TerminalAgentTabShortcut {
  if (matchShortcut('tab.newAgent')) {
    return { actionId: 'tab.newAgent', agent: null }
  }
  for (const bound of listBoundAgentTabActions(keybindings, [])) {
    if (matchShortcut(bound.actionId)) {
      return { actionId: bound.actionId, agent: bound.agent }
    }
  }
  return { actionId: null, agent: null }
}

export async function resolveTerminalAgentForShortcut(
  worktreeId: string,
  shortcut: TerminalAgentTabShortcut,
  ownerKey: string | undefined
): Promise<TuiAgent | null> {
  const assertOwner = (): void => {
    if (
      ownerKey === undefined ||
      getTerminalAgentShortcutOwnerKey(worktreeId) !== ownerKey
    ) {
      throw new DOMException('Agent launch cancelled', 'AbortError')
    }
  }
  assertOwner()
  const detectedAgentIds =
    shortcut.actionId === 'tab.newAgent'
      ? await detectAgentSessionContinuationAgents(worktreeId)
      : []
  assertOwner()
  const preferences = await ensureAgentLaunchPreferences(worktreeId)
  assertOwner()
  if (!preferences.isAvailable) {
    throw new Error(
      translate(
        'settings.agents.readFailed',
        'Couldn’t read agent settings. Check the host connection and try again.'
      )
    )
  }
  if (shortcut.agent) {
    return isTuiAgentEnabled(shortcut.agent, preferences.disabledTuiAgents) ? shortcut.agent : null
  }
  return resolveDefaultAgentForNewTab({ ...preferences, detectedAgentIds })
}
