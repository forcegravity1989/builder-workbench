import { useCallback, useEffect, useId, useState, type ReactElement } from 'react'
import { useAppStore } from '@/store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ReviewNotesSendMenuContent } from '@/components/editor/ReviewNotesSendMenuContent'
import { preventAgentSendTargetOutsideDismiss } from '@/components/browser-pane/annotate/prevent-agent-send-target-outside-dismiss'
import { revealPlanChat } from './plan-column-resize'
// Owns .g3-send-preview; imported here so the preview is styled on every board
// that uses this menu, not only where board-ui happens to be loaded first.
import './board-ui.css'

/** Object-level action prop: wraps the caller's trigger button in the send menu. */
export type SendActionWrap = (prompt: string, label: string, button: ReactElement) => ReactElement

/** Plan board is the original consumer; the acceptance board passes its own. */
const DEFAULT_ASSISTANT = '计划助手'

/**
 * Board-level factory: every object-level action reports delivery as a notice.
 * `assistant` names the receiving AI role in user-visible text; both cycle boards
 * share this wrapper but each talks to its own assistant (计划助手 / 验收助手).
 */
export function usePlanSendAction(
  worktreeId: string | null,
  onSentNotice: (message: string) => void,
  assistant = DEFAULT_ASSISTANT
): SendActionWrap {
  return useCallback(
    (prompt, label, button) => (
      <PlanSendMenu
        worktreeId={worktreeId}
        prompt={prompt}
        label={label}
        assistant={assistant}
        onSent={() => onSentNotice(`${label}已发送给${assistant} · 在会话栏查看进展`)}
      >
        {button}
      </PlanSendMenu>
    ),
    [worktreeId, onSentNotice, assistant]
  )
}

/**
 * Object-level board actions (break down Issues, organize minutes, start
 * archiving, release, send board annotations) reuse the Orca native agent-send
 * chain — the same one browser annotations use — but complete it: #399 only
 * triggered the sidebar target-mode highlight and never rendered the picker, so
 * clicks dead-ended. This wraps the action button in the native dropdown:
 * instruction preview (BW wrapper layer; the native menu shows no pending text),
 * then the native「发送至」running-session list and「新建智能体」quick launch.
 * Opening also reveals the chat column. Shared by both cycle boards; `assistant`
 * only names the receiving AI role in the preview line.
 */
export function PlanSendMenu({
  worktreeId,
  prompt,
  label,
  assistant = DEFAULT_ASSISTANT,
  onSent,
  children
}: {
  worktreeId: string | null
  prompt: string
  label: string
  assistant?: string
  onSent?(): void
  children: ReactElement
}) {
  const open = useAppStore((state) => state.openAgentSendPopoverTargetMode)
  const close = useAppStore((state) => state.closeAgentSendPopoverTargetMode)
  // Why: several trigger buttons share the same label (every goal card's
  //「拆解 Issue」); a label-only target-mode id would let one menu's unmount
  // close another menu's sidebar target mode, and the store de-dupes opens by
  // id. useId keeps one identity per trigger instance.
  const instance = useId()
  const id = `bw-plan-send:${instance}:${label}:${worktreeId ?? 'none'}`
  const [menuOpen, setMenuOpen] = useState(false)
  // Why: mirror NotesSendMenu — when the store's target mode leaves this id
  // (sent from the sidebar, or taken over by another source), the local menu
  // must collapse too instead of lingering.
  const targetModeMine = useAppStore((state) => state.agentSendPopoverTargetMode?.id === id)
  useEffect(() => {
    if (!targetModeMine && menuOpen) {
      setMenuOpen(false)
    }
  }, [targetModeMine, menuOpen])
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
          <small>发送指令给{assistant} · {label}</small>
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
