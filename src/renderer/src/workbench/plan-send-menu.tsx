import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { useAppStore } from '@/store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ReviewNotesSendMenuContent } from '@/components/editor/ReviewNotesSendMenuContent'
import { preventAgentSendTargetOutsideDismiss } from '@/components/browser-pane/annotate/prevent-agent-send-target-outside-dismiss'
import { revealPlanChat } from './plan-column-resize'
// Owns .g3-send-preview; imported here so the preview is styled on every board
// that uses this menu, not only where board-ui happens to be loaded first.
import './board-ui.css'

/** Object-level action prop: wraps the caller's trigger button in the send menu. */
export type SendActionWrap = (
  prompt: string,
  label: string,
  button: ReactElement,
  preparePrompt?: () => Promise<string>
) => ReactElement

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
    (prompt, label, button, preparePrompt) => (
      <PlanSendMenu
        worktreeId={worktreeId}
        prompt={prompt}
        preparePrompt={preparePrompt}
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

/** Board requests share Orca's running-session picker and new-agent launcher. */
export function PlanSendMenu({
  worktreeId,
  prompt,
  preparePrompt,
  label,
  assistant = DEFAULT_ASSISTANT,
  onSent,
  children
}: {
  worktreeId: string | null
  prompt: string
  preparePrompt?: () => Promise<string>
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
  const [preparedPrompt, setPreparedPrompt] = useState<string | null>(null)
  const [prepareError, setPrepareError] = useState('')
  const preparation = useRef(0)
  // Why: mirror NotesSendMenu — when the store's target mode leaves this id
  // (sent from the sidebar, or taken over by another source), the local menu
  // must collapse too instead of lingering.
  const targetModeMine = useAppStore((state) => state.agentSendPopoverTargetMode?.id === id)
  useEffect(() => {
    if (!targetModeMine && menuOpen && preparedPrompt !== null) {
      setMenuOpen(false)
    }
  }, [targetModeMine, menuOpen, preparedPrompt])
  useEffect(() => {
    return () => {
      preparation.current++
      close(id)
    }
  }, [id, close])
  if (!worktreeId) {
    return children
  }
  return (
    <DropdownMenu
      modal={false}
      open={menuOpen}
      onOpenChange={(next) => {
        const request = ++preparation.current
        setMenuOpen(next)
        setPreparedPrompt(null)
        setPrepareError('')
        close(id)
        if (next) {
          revealPlanChat()
          void (async () => {
            try {
              const resolved = preparePrompt ? await preparePrompt() : prompt
              // Closing or replacing the menu must not activate a late send target.
              if (request !== preparation.current) return
              setPreparedPrompt(resolved)
              open({
                id,
                worktreeId,
                source: 'browser-annotations',
                prompt: resolved,
                label,
                launchSource: 'notes_send',
                onPromptDelivered: onSent
              })
            } catch (reason) {
              if (request === preparation.current) {
                setPrepareError(reason instanceof Error ? reason.message : String(reason))
              }
            }
          })()
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
          <small>
            发送指令给{assistant} · {label}
          </small>
          <p>{prompt}</p>
        </div>
        {prepareError ? (
          <div className="max-w-sm px-2 py-1.5 text-sm" role="alert">
            准备请求失败：{prepareError}。处理后重新打开菜单重试。
          </div>
        ) : preparedPrompt === null ? (
          <DropdownMenuItem disabled>正在准备发送…</DropdownMenuItem>
        ) : (
          <ReviewNotesSendMenuContent
            worktreeId={worktreeId}
            groupId={worktreeId}
            prompt={preparedPrompt}
            promptDelivery="submit-after-ready"
            launchSource="notes_send"
            onPromptDelivered={onSent}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
