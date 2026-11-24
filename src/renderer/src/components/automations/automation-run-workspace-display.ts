import type { AutomationRun } from '../../../../shared/automations-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { translate } from '@/i18n/i18n'

export type AutomationRunWorkspaceDisplay = {
  rowLabel: string
  detailLabel: string
  muted: boolean
  title?: string
}

export function getAutomationRunWorkspaceDisplay({
  run,
  worktree
}: {
  run: AutomationRun
  worktree: Worktree | null
}): AutomationRunWorkspaceDisplay {
  if (!run.workspaceId) {
    return {
      rowLabel: 'Not launched',
      detailLabel: 'Not launched',
      muted: true
    }
  }
  if (worktree) {
    return {
      rowLabel: worktree.displayName,
      detailLabel: worktree.displayName,
      muted: false,
      title: worktree.displayName
    }
  }

  const previousName = run.workspaceDisplayName?.trim()
  if (run.sessionKind === 'agent-session') {
    const label = previousName || translate('bots.schedule-bot-home', 'Bot Home')
    return { rowLabel: label, detailLabel: label, muted: !run.chatSessionId, title: label }
  }
  if (previousName) {
    const deletedLabel = `${previousName} (no longer available)`
    return {
      rowLabel: previousName,
      detailLabel: deletedLabel,
      muted: true,
      title: deletedLabel
    }
  }

  return {
    rowLabel: 'Workspace no longer available',
    detailLabel: 'Workspace no longer available',
    muted: true
  }
}
