import { useCallback } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { openAiVaultSessionLogInOrca } from './ai-vault-session-log-open'

/**
 * Row-level copy/open/delete handlers for the vault session list. Extracted so
 * AiVaultPanel stays under the file-size gate; behavior is unchanged.
 */
export function useAiVaultSessionRowActions({
  copyResumeCommand,
  requestDelete
}: {
  copyResumeCommand(session: AiVaultSession, worktreeId?: string | null): unknown
  requestDelete(session: AiVaultSession): unknown
}) {
  const copyText = useCallback(async (text: string, label: string): Promise<void> => {
    await window.api.ui.writeClipboardText(text)
    toast.success(
      translate('auto.components.right.sidebar.AiVaultPanel.valueCopied', '{{value0}} copied', {
        value0: label
      })
    )
  }, [])
  const onCopyResume = useCallback(
    (session: AiVaultSession, worktreeId?: string | null) => {
      void copyResumeCommand(session, worktreeId)
    },
    [copyResumeCommand]
  )
  const onCopyId = useCallback(
    (session: AiVaultSession) => {
      void copyText(
        session.sessionId,
        translate('auto.components.right.sidebar.AiVaultPanel.sessionId', 'Session ID')
      )
    },
    [copyText]
  )
  const onCopyPath = useCallback(
    (session: AiVaultSession) => {
      void copyText(
        session.filePath,
        translate('auto.components.right.sidebar.AiVaultPanel.logPath', 'Log path')
      )
    },
    [copyText]
  )
  const onOpenLog = useCallback((session: AiVaultSession) => {
    void openAiVaultSessionLogInOrca(session)
  }, [])
  const onRevealLog = useCallback((session: AiVaultSession) => {
    void window.api.shell.openPath(session.filePath)
  }, [])
  const onOpenCwd = useCallback((session: AiVaultSession) => {
    if (session.cwd) {
      void window.api.shell.openPath(session.cwd)
    }
  }, [])
  const onRequestDelete = useCallback(
    (session: AiVaultSession) => {
      void requestDelete(session)
    },
    [requestDelete]
  )
  return {
    onCopyResume,
    onCopyId,
    onCopyPath,
    onOpenLog,
    onRevealLog,
    onOpenCwd,
    onRequestDelete
  }
}
