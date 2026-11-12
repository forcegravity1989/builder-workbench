import { ArrowUp, Check, Copy, MessageSquarePlus, Pencil, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useOptionalShortcutLabel } from '@/hooks/useShortcutLabel'
import { BoardIconButton } from '../board-ui'
import { PlanSendMenu } from '../plan-send-menu'
import { boardAnnotationsSendPrompt } from './annotation-markdown'
import type { BoardAnnotation } from './types'
import './annotations.css'

/** Panel card: number + object + text, with card-level inline edit and delete. */
function AnnotationCard({
  item,
  onUpdate,
  onRemove
}: {
  item: BoardAnnotation & { number: number }
  onUpdate(id: string, text: string): void
  onRemove(id: string): void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.text)
  return (
    <div className="g3-annot-card">
      <span className="g3-annot-num">{item.number}</span>
      <div>
        <strong>{item.ref.label}</strong>
        {editing ? (
          <div className="g3-annot-edit">
            <textarea
              rows={2}
              aria-label={`编辑批注 ${item.number}`}
              value={draft}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
            />
            <span className="g3-annot-edit-actions">
              <button
                type="button"
                onClick={() => {
                  setDraft(item.text)
                  setEditing(false)
                }}
              >
                取消
              </button>
              <button
                type="button"
                className="primary"
                disabled={!draft.trim()}
                onClick={() => {
                  onUpdate(item.id, draft.trim())
                  setEditing(false)
                }}
              >
                保存
              </button>
            </span>
          </div>
        ) : (
          <p>{item.text}</p>
        )}
      </div>
      <BoardIconButton
        label={`编辑批注 ${item.number}（${item.ref.label}）`}
        onClick={() => {
          setDraft(item.text)
          setEditing(true)
        }}
      >
        <Pencil size={14} aria-hidden="true" />
      </BoardIconButton>
      <BoardIconButton
        label={`删除批注 ${item.number}（${item.ref.label}）`}
        onClick={() => onRemove(item.id)}
      >
        <X size={14} aria-hidden="true" />
      </BoardIconButton>
    </div>
  )
}

/**
 * Board-annotation panel: compact numbered record list on the right, aligned
 * with the Orca native annotation tray layout (list, hint row, board-level
 * entry, copy / send footer). Recording itself happens in the object popover;
 * the panel manages the records. The list scrolls within a height cap so the
 * panel never grows without bound or covers the board.
 */
export function AnnotationPanel({
  annotations,
  annotating,
  worktreeId,
  assistant = '计划助手',
  onClose,
  onUpdate,
  onRemove,
  onBoardLevel,
  onCopy,
  onCopyError,
  onSent,
  onSendDirect
}: {
  annotations: (BoardAnnotation & { number: number })[]
  annotating: boolean
  worktreeId: string | null
  /** Receiving AI role named in the send button; each cycle board has its own. */
  assistant?: string
  onClose(): void
  onUpdate(id: string, text: string): void
  onRemove(id: string): void
  onBoardLevel(anchor: DOMRect): void
  /** Writes via the Orca IPC clipboard channel; resolves once written. */
  onCopy(): Promise<void>
  /** Surfaces a failed copy honestly instead of swallowing it. */
  onCopyError?(message: string): void
  onSent?(): void
  /** Sends straight to one session. When set, the button does not open a picker. */
  onSendDirect?(): Promise<boolean>
}) {
  const [copied, setCopied] = useState(false)
  const toggleShortcut = useOptionalShortcutLabel('workbench.toggleAnnotationMode')
  const [sending, setSending] = useState(false)
  useEffect(() => {
    if (!copied) {
      return
    }
    const timer = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <aside className="g3-annot-panel" aria-label="板面批注窗">
      <header>
        <MessageSquarePlus size={14} aria-hidden="true" />
        <strong>板面批注（{annotations.length}）</strong>
        <BoardIconButton label="关闭板面批注窗" onClick={onClose}>
          <X size={15} aria-hidden="true" />
        </BoardIconButton>
      </header>
      <div className="g3-annot-list">
        {annotations.length ? (
          annotations.map((item) => (
            <AnnotationCard key={item.id} item={item} onUpdate={onUpdate} onRemove={onRemove} />
          ))
        ) : (
          <p className="g3-muted g3-annot-empty">暂无批注</p>
        )}
      </div>
      {annotating && (
        <p className="g3-annot-hint">
          批注模式中，点击板面元素即可添加批注{toggleShortcut ? `（${toggleShortcut} 退出）` : ''}
        </p>
      )}
      <button
        type="button"
        className="g3-annot-board"
        onClick={(event) => onBoardLevel(event.currentTarget.getBoundingClientRect())}
      >
        <Plus size={13} aria-hidden="true" /> 添加板面级批注
      </button>
      <footer>
        <button
          type="button"
          disabled={!annotations.length}
          onClick={() => {
            void onCopy().then(
              () => setCopied(true),
              (reason: unknown) =>
                onCopyError?.(reason instanceof Error ? reason.message : String(reason))
            )
          }}
        >
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}{' '}
          {copied ? '已复制' : '复制'}
        </button>
        {onSendDirect ? (
          <button
            type="button"
            className="primary"
            disabled={!annotations.length || sending}
            onClick={() => {
              setSending(true)
              void onSendDirect()
                .then(
                  (sent) => {
                    if (sent) {
                      onSent?.()
                    }
                  },
                  () => undefined
                )
                .finally(() => setSending(false))
            }}
          >
            <ArrowUp size={13} aria-hidden="true" /> 发送给{assistant}
          </button>
        ) : (
          <PlanSendMenu
            worktreeId={worktreeId}
            prompt={boardAnnotationsSendPrompt(annotations)}
            label="板面批注"
            assistant={assistant}
            onSent={onSent}
          >
            <button type="button" className="primary" disabled={!annotations.length}>
              <ArrowUp size={13} aria-hidden="true" /> 发送给{assistant}
            </button>
          </PlanSendMenu>
        )}
      </footer>
    </aside>
  )
}
