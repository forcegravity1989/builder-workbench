import { Redo2, RotateCcw, Undo2 } from 'lucide-react'
import { MilestoneIconButton } from './milestone-icon-button'

export function MilestoneHistoryActions({
  status,
  dirty,
  busy,
  conflict,
  canUndo,
  canRedo,
  undo,
  redo,
  discard
}: {
  status: string
  dirty: boolean
  busy: boolean
  conflict: boolean
  canUndo: boolean
  canRedo: boolean
  undo(): void
  redo(): void
  discard(): void
}) {
  return (
    <>
      <small
        className="wb-ml-status"
        role="status"
        title={dirty ? '本次修改尚未提交评审' : undefined}
      >
        {status}
      </small>
      <MilestoneIconButton label="撤销" disabled={busy || !canUndo} onClick={undo}>
        <Undo2 size={15} />
      </MilestoneIconButton>
      <MilestoneIconButton label="重做" disabled={busy || !canRedo} onClick={redo}>
        <Redo2 size={15} />
      </MilestoneIconButton>
      <span className="wb-ml-action-separator" aria-hidden="true" />
      <MilestoneIconButton
        label={conflict ? '放弃本次修改，从最新材料重新编辑' : '放弃本次修改，恢复最近提交'}
        disabled={busy || (!dirty && !conflict)}
        onClick={discard}
      >
        <RotateCcw size={15} />
      </MilestoneIconButton>
    </>
  )
}
