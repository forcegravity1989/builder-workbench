import { MessageSquarePlus, Plus, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useState } from 'react'
import { BoardIconButton } from '../board-ui'
import type { AnnotationRef } from './types'

const POP_W = 320
const POP_H = 200

/**
 * Object-annotation popover anchored beside the clicked board element, aligned
 * with the Orca element-annotation dialog (object-name title, textarea,
 * 取消 / 添加, Ctrl+Enter). BW difference: no intent segments and no send row —
 * it only adds records; the × closes the popover without touching them.
 */
export function AnnotationPopover({
  target,
  onSave,
  onCancel
}: {
  target: { ref: AnnotationRef; rect: { left: number; top: number; bottom: number } }
  onSave(text: string): void
  onCancel(): void
}) {
  const [draft, setDraft] = useState('')
  const left = Math.max(16, Math.min(target.rect.left, window.innerWidth - POP_W - 16))
  const below = target.rect.bottom + 8
  const top =
    below + POP_H > window.innerHeight - 16
      ? Math.max(16, Math.min(target.rect.top - POP_H - 8, window.innerHeight - POP_H - 16))
      : below
  const save = () => {
    if (draft.trim()) {
      onSave(draft.trim())
    }
  }
  // Portaled to body: left/top are viewport coordinates from the clicked
  // element's rect, so the popover must not inherit any board-local containing
  // block (container-type/contain ancestry) — same approach as Radix overlays.
  return createPortal(
    <div
      className="g3-annot-pop"
      role="dialog"
      aria-label={`对象批注（${target.ref.label}）`}
      style={{ left, top }}
    >
      <header>
        <MessageSquarePlus size={13} aria-hidden="true" />
        <strong>{target.ref.label}</strong>
        <BoardIconButton label="关闭批注小窗" onClick={onCancel}>
          <X size={15} aria-hidden="true" />
        </BoardIconButton>
      </header>
      <textarea
        rows={3}
        aria-label="批注内容"
        placeholder="在此添加批注..."
        value={draft}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            save()
          }
        }}
      />
      <footer>
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button type="button" className="primary" disabled={!draft.trim()} onClick={save}>
          <Plus size={13} aria-hidden="true" /> 添加
        </button>
      </footer>
    </div>,
    document.body
  )
}
