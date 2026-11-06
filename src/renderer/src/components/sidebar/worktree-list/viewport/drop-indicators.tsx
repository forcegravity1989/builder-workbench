import { WorktreeSidebarDropIndicator } from '../../WorktreeSidebarDropIndicator'
import type { useWorktreeDragRuntime } from '../drag/use-runtime'
import type { useWorktreeSidebarHeaderDrag } from '../drag/use-header-drag'

/** Header and worktree drop lines float above the virtual rows, so they render as siblings. */
export function renderWorktreeSidebarDropIndicators(args: {
  headerDrag: ReturnType<typeof useWorktreeSidebarHeaderDrag>
  worktreeDragState: ReturnType<typeof useWorktreeDragRuntime>['worktreeDragState']
  /** #475: indicator y values are scroller-wide; the sizer starts below the prefix. */
  scrollMargin?: number
}): React.ReactNode {
  const { headerDrag, worktreeDragState } = args
  const offsetY = (y: number): number => Math.max(0, y - (args.scrollMargin ?? 0))
  return (
    <>
      {headerDrag.canReorderRepoHeaders &&
      headerDrag.repoDrag.state.draggingRepoId !== null &&
      headerDrag.repoDrag.state.dropIndicatorY !== null ? (
        <WorktreeSidebarDropIndicator y={offsetY(headerDrag.repoDrag.state.dropIndicatorY)} />
      ) : null}
      {headerDrag.canReorderProjectGroupHeaders &&
      headerDrag.projectGroupDrag.state.draggingGroupId !== null &&
      headerDrag.projectGroupDrag.state.dropIndicatorY !== null ? (
        <WorktreeSidebarDropIndicator
          y={offsetY(headerDrag.projectGroupDrag.state.dropIndicatorY)}
        />
      ) : null}
      {headerDrag.hostDrag.state.draggingHostId !== null &&
      headerDrag.hostDrag.state.dropIndicatorY !== null ? (
        <WorktreeSidebarDropIndicator
          y={offsetY(headerDrag.hostDrag.state.dropIndicatorY)}
          className="z-40"
        />
      ) : null}
      {worktreeDragState.draggingWorktreeId !== null &&
      worktreeDragState.dropIndicatorY !== null ? (
        <WorktreeSidebarDropIndicator y={offsetY(worktreeDragState.dropIndicatorY)} />
      ) : null}
    </>
  )
}
