import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { requestContextualTourWhenReady } from '@/components/contextual-tours/request-contextual-tour-when-ready'
import { ArrowLeft, CircleHelp, Redo2, RotateCcw, Undo2 } from 'lucide-react'
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
    <div className="wb-ml-title">
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
  conflict,
  recoveryBlocked,
  canUndo,
  canRedo,
  undo,
  redo,
  discard
}: {
  dirty: boolean
  busy: boolean
  conflict: boolean
  recoveryBlocked: boolean
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
      <span className="wb-ml-action-separator" aria-hidden="true" />
      <MilestoneIconButton
        label={
          recoveryBlocked
            ? '重试读取本机草案'
            : conflict
              ? '放弃本次修改，从最新材料重新编辑'
              : '放弃本次修改，恢复最近提交'
        }
        disabled={busy || (!dirty && !conflict)}
        onClick={discard}
      >
        <RotateCcw size={15} />
      </MilestoneIconButton>
    </>
  )
}

export function MilestoneGuide({
  editing,
  blocked,
  scopeKey
}: {
  editing: boolean
  blocked: boolean
  scopeKey: string | null
}) {
  const uiReady = useAppStore((s) => s.persistedUIReady)
  useEffect(() => {
    if (!editing || blocked || !uiReady) {
      return
    }
    const app = useAppStore.getState()
    const wasFeaturePreviouslyInteracted = Boolean(app.featureInteractions['workbench-milestones'])
    void app.recordFeatureInteraction('workbench-milestones')
    return requestContextualTourWhenReady({
      wasFeaturePreviouslyInteracted,
      id: 'workbench-milestones',
      source: 'milestone_planning',
      waitForActiveTourToClear: true,
      shouldContinue: () =>
        !useAppStore.getState().contextualToursSeenIds.includes('workbench-milestones')
    })
  }, [editing, blocked, uiReady, scopeKey])
  useEffect(
    () => () => {
      useAppStore.getState().suppressContextualTour('workbench-milestones', 'milestone_planning')
    },
    [scopeKey, editing]
  )
  return (
    <MilestoneIconButton
      label="里程碑操作引导"
      onClick={() =>
        useAppStore
          .getState()
          .requestContextualTour('workbench-milestones', 'milestone_planning', false, {
            force: true
          })
      }
    >
      <CircleHelp size={15} />
    </MilestoneIconButton>
  )
}
