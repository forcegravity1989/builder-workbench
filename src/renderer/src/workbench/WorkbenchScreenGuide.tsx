import { useEffect } from 'react'
import { CircleHelp } from 'lucide-react'
import { useAppStore } from '@/store'
import { requestContextualTourWhenReady } from '@/components/contextual-tours/request-contextual-tour-when-ready'
import { WorkbenchIconButton } from './WorkbenchIconButton'

export function WorkbenchScreenGuide({
  id,
  label,
  enabled = true
}: {
  id: 'workbench-wall' | 'workbench-overview' | 'workbench-milestones'
  label: string
  enabled?: boolean
}) {
  const ready = useAppStore((state) => state.persistedUIReady)
  const blocked = useAppStore(
    (state) =>
      state.activeModal !== 'none' ||
      state.contextualToursOnboardingVisible ||
      state.contextualToursBlockingSurfaceVisible ||
      (state.activeContextualTourId !== null && state.activeContextualTourId !== id)
  )
  const seen = useAppStore((state) => state.contextualToursSeenIds.includes(id))
  const source =
    id === 'workbench-milestones'
      ? 'milestone_planning'
      : id === 'workbench-wall'
        ? 'project_wall_visible'
        : 'project_overview_visible'

  useEffect(() => {
    if (!enabled || !ready || blocked || seen) {
      return
    }
    return requestContextualTourWhenReady({
      id,
      source,
      shouldContinue: () => !useAppStore.getState().contextualToursSeenIds.includes(id)
    })
  }, [id, source, enabled, ready, blocked, seen])

  useEffect(() => () => useAppStore.getState().suppressContextualTour(id, source), [id, source])

  return (
    <WorkbenchIconButton
      label={label}
      icon={CircleHelp}
      onClick={() => {
        const state = useAppStore.getState()
        if (state.activeContextualTourId) {
          state.cancelContextualTour(state.activeContextualTourId)
        }
        state.requestContextualTour(id, source, undefined, { force: true })
      }}
    />
  )
}
