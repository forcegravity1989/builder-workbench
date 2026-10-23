import { AnnotationPanel } from '../annotations/AnnotationPanel'
import { AnnotationPopover } from '../annotations/AnnotationPopover'
import { formatBoardAnnotationsAsMarkdown } from '../annotations/annotation-markdown'
import type { useBoardAnnotations } from '../annotations/use-board-annotations'

/**
 * Panel + object popover overlays for the plan board (extracted from
 * PlanningBoard to hold the max-lines gate). Copy goes through the Orca IPC
 * clipboard channel — navigator.clipboard silently failed on device; send
 * rides the panel-internal PlanSendMenu. Renders inside vp-body so the
 * absolute-positioned panel keeps its vp-body anchor; the popover is fixed.
 */
export function PlanningAnnotationOverlays({
  annotations,
  worktreeId,
  onSentNotice
}: {
  annotations: ReturnType<typeof useBoardAnnotations>
  worktreeId: string | null
  onSentNotice(message: string): void
}) {
  const popover = annotations.popover
  return (
    <>
      {annotations.panelOpen && (
        <AnnotationPanel
          annotations={annotations.numbered}
          annotating={annotations.annotating}
          worktreeId={worktreeId}
          onClose={annotations.closePanel}
          onUpdate={annotations.update}
          onRemove={annotations.remove}
          onBoardLevel={(rect) => annotations.openPopover({ kind: 'board', label: '板面级' }, rect)}
          onCopy={async () => {
            await window.api.ui.writeClipboardText(
              formatBoardAnnotationsAsMarkdown(annotations.annotations)
            )
          }}
          onCopyError={(message) => onSentNotice(`复制板面批注失败：${message}`)}
          onSent={() => {
            // Why: onPromptDelivered only fires on a delivered send, so clearing here
            // never drops notes on failure/Esc (option A, 2026-10-22). The receipt must
            // say how many were cleared or the empty panel reads as lost input.
            const count = annotations.annotations.length
            annotations.clearAll()
            onSentNotice(
              `板面批注已发送给计划助手 · 在会话栏查看进展。已递交的 ${count} 条批注已从板面清空，可继续批注。`
            )
          }}
        />
      )}
      {popover && (
        <AnnotationPopover
          key={popover.id}
          target={popover}
          onSave={(text) => {
            annotations.add(popover.ref, text)
            annotations.closePopover()
          }}
          onCancel={annotations.closePopover}
        />
      )}
    </>
  )
}
