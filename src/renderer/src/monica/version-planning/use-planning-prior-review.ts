import { useEffect, useState, type RefObject } from 'react'
import { useAppStore } from '@/store'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import { setCycleView } from '../cycle-view-state'
import { openAcceptanceSource } from '../version-cycle/open-acceptance-source'
import type { usePlanningMaterial } from './use-planning-material'
import { usePriorCarryovers } from './use-prior-carryovers'
import { usePriorLiveOpen } from './use-prior-live-open'

/** Read/adopt one prior source and open its fixed snapshot without changing editable material. */
export function usePlanningPriorReview({
  context,
  material,
  disabled,
  selectionKey,
  currentSelection,
  onAct
}: {
  context: VersionCycleContext
  material: ReturnType<typeof usePlanningMaterial>
  disabled: boolean
  selectionKey: string
  currentSelection: RefObject<string>
  onAct: (operation: () => Promise<unknown>) => Promise<void>
}) {
  const { scope, worktreeId } = context
  const { edit: editMaterial } = material
  const plan = material.draft?.document
  const startVersion = context.version ?? context.boundVersion
  const prior = usePriorCarryovers(
    scope,
    worktreeId,
    plan?.summary.progressSource,
    context.materialRefresh,
    plan?.version
  )
  const progressSource =
    plan?.summary.progressSource ?? (prior.state.kind === 'ready' ? prior.state.source : undefined)
  const priorError = prior.state.kind === 'error' ? prior.state.reason : null
  // Live state supplements an unmarked frozen record; it never asserts carryover.
  const liveRefs =
    prior.state.kind === 'ready' ? prior.state.carryovers.openReadbackReferences : null
  const liveEnabled =
    prior.state.kind === 'ready' &&
    !prior.state.carryovers.issueMarksRecorded &&
    Boolean(progressSource)
  const priorLive = usePriorLiveOpen(
    scope,
    worktreeId,
    context.taskPort,
    liveRefs,
    liveEnabled,
    context.materialRefresh
  )
  const resolvedSource = prior.state.kind === 'ready' ? prior.state.source : undefined
  const canAdoptSource =
    !material.busy &&
    !material.draft?.dirty &&
    !material.draft?.error &&
    material.draft?.remote === undefined
  useEffect(() => {
    if (
      plan &&
      plan.version === startVersion &&
      !plan.summary.progressSource &&
      resolvedSource &&
      !disabled &&
      canAdoptSource
    ) {
      editMaterial({
        ...plan,
        summary: { ...plan.summary, progressSource: resolvedSource }
      })
    }
  }, [plan, startVersion, resolvedSource, disabled, canAdoptSource, editMaterial])

  const [openingSource, setOpeningSource] = useState(false)
  const openAcceptance = () =>
    void onAct(async () => {
      if (openingSource) {
        return
      }
      setOpeningSource(true)
      try {
        if (material.draft?.dirty && !(await material.flush())) {
          throw new Error('当前计划修改尚未保存，请处理保存提示后再查看验收依据。')
        }
        if (currentSelection.current !== selectionKey) {
          return
        }
        if (progressSource) {
          if (!scope || !worktreeId || !plan) {
            throw new Error('计划工作区尚未就绪。')
          }
          await openAcceptanceSource(
            scope,
            worktreeId,
            progressSource,
            { version: plan.version, cycleId: plan.cycleId },
            () => currentSelection.current === selectionKey
          )
        } else {
          setCycleView('acceptance')
          useAppStore.getState().openArtifactsPage()
        }
      } finally {
        setOpeningSource(false)
      }
    })
  return { prior, progressSource, priorError, priorLive, openingSource, openAcceptance }
}
