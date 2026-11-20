import { ArrowLeft, Redo2, RotateCcw, Undo2 } from 'lucide-react'
import { MilestoneIconButton } from './milestone-icon-button'

export function MilestoneTitle({
  editing,
  busy,
  finishEditing
}: {
  editing: boolean
  busy: boolean
  finishEditing(): void
}) {
  return (
    <div className="monica-ml-title">
      {editing && (
        <MilestoneIconButton
          label="结束编辑，返回项目里程碑"
          disabled={busy}
          onClick={finishEditing}
        >
          <ArrowLeft size={15} />
        </MilestoneIconButton>
      )}
      <strong>项目里程碑</strong>
    </div>
  )
}

export function MilestoneHistoryActions({
  dirty,
  busy,
  fileChanged,
  canUndo,
  canRedo,
  undo,
  redo,
  discard
}: {
  dirty: boolean
  busy: boolean
  fileChanged: boolean
  canUndo: boolean
  canRedo: boolean
  undo(): void
  redo(): void
  discard(): void
}) {
  return (
    <>
      <MilestoneIconButton label="撤销" disabled={busy || !canUndo} onClick={undo}>
        <Undo2 size={15} />
      </MilestoneIconButton>
      <MilestoneIconButton label="重做" disabled={busy || !canRedo} onClick={redo}>
        <Redo2 size={15} />
      </MilestoneIconButton>
      <span className="monica-ml-action-separator" aria-hidden="true" />
      <MilestoneIconButton
        label="放弃本次修改，恢复最近提交"
        disabled={busy || !dirty || fileChanged}
        onClick={discard}
      >
        <RotateCcw size={15} />
      </MilestoneIconButton>
    </>
  )
}
