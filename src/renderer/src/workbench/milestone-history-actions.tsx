import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Ellipsis, Redo2, Undo2 } from 'lucide-react'
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
      <Popover>
        <PopoverTrigger asChild>
          <MilestoneIconButton label="更多规划操作" disabled={busy}>
            <Ellipsis size={15} />
          </MilestoneIconButton>
        </PopoverTrigger>
        <PopoverContent className="wb-ml-small" align="end">
          <Button
            variant="ghost"
            size="xs"
            disabled={busy || (!dirty && !conflict)}
            onClick={discard}
          >
            放弃本次修改
          </Button>
        </PopoverContent>
      </Popover>
    </>
  )
}
