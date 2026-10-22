import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { useAppStore } from '@/store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ReviewNotesSendMenuContent } from '@/components/editor/ReviewNotesSendMenuContent'
import { preventAgentSendTargetOutsideDismiss } from '@/components/browser-pane/annotate/prevent-agent-send-target-outside-dismiss'
import { revealPlanChat } from './plan-column-resize'

/** Object-level action prop: wraps the caller's trigger button in the send menu. */
export type SendActionWrap = (prompt: string, label: string, button: ReactElement) => ReactElement

/** Board-level factory: every object-level action reports delivery as a notice. */
export function usePlanSendAction(
  worktreeId: string | null,
  onSentNotice: (message: string) => void
): SendActionWrap {
  return useCallback(
    (prompt, label, button) => (
      <PlanSendMenu
        worktreeId={worktreeId}
        prompt={prompt}
        label={label}
        onSent={() => onSentNotice(`${label}已发送给计划助手 · 在会话栏查看进展`)}
      >
        {button}
      </PlanSendMenu>
    ),
    [worktreeId, onSentNotice]
  )
}

/**
 * Object-level plan actions (break down Issues, organize minutes, send board
 * annotations) reuse the Orca native agent-send chain — the same one browser
 * annotations use — but complete it: #399 only triggered the sidebar target-mode
 * highlight and never rendered the picker, so clicks dead-ended. This wraps the
 * action button in the native dropdown: instruction preview (BW wrapper layer;
 * the native menu shows no pending text), then the native「发送至」running-session
 * list and「新建智能体」quick launch. Opening also reveals the chat column.
 */
export function PlanSendMenu({
  worktreeId,
  prompt,
  label,
  onSent,
  children
}: {
  worktreeId: string | null
  prompt: string
  label: string
  onSent?(): void
  children: ReactElement
}) {
  const open = useAppStore((state) => state.openAgentSendPopoverTargetMode)
  const close = useAppStore((state) => state.closeAgentSendPopoverTargetMode)
  const [menuOpen, setMenuOpen] = useState(false)
  const id = `bw-plan-send:${label}:${worktreeId ?? 'none'}`
  useEffect(() => {
    return () => close(id)
  }, [id, close])
  if (!worktreeId) {
    return children
  }
  return (
    <DropdownMenu
      modal={false}
      open={menuOpen}
      onOpenChange={(next) => {
        setMenuOpen(next)
        if (next) {
          // The action also reveals the chat column, matching the approved design.
          revealPlanChat()
          open({
            id,
            worktreeId,
            source: 'browser-annotations',
            prompt,
            label,
            launchSource: 'notes_send',
            onPromptDelivered: onSent
          })
        } else {
          close(id)
        }
      }}
    >
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[260px]"
        onInteractOutside={preventAgentSendTargetOutsideDismiss}
        onPointerDownOutside={preventAgentSendTargetOutsideDismiss}
      >
        <div className="g3-send-preview">
          <small>发送指令给计划助手 · {label}</small>
          <p>{prompt}</p>
        </div>
        <ReviewNotesSendMenuContent
          worktreeId={worktreeId}
          groupId={worktreeId}
          prompt={prompt}
          // Why: keep plan-action delivery semantics stable even if the shared
          // review-notes menu defaults change later.
          promptDelivery="submit-after-ready"
          launchSource="notes_send"
          onPromptDelivered={onSent}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
