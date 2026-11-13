import { useEffect } from 'react'
import { CircleHelp } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { requestContextualTourWhenReady } from '@/components/contextual-tours/request-contextual-tour-when-ready'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { WorkbenchIconButton } from './WorkbenchIconButton'
import { closeProjectPage, openProjectWall, subscribeProjectPage } from './project-page-state'
import { findRepoForHost } from '@/store/slices/repo-host-identity'

const guideSources = {
  'workbench-wall': 'project_wall_visible',
  'workbench-overview': 'project_overview_visible',
  'workbench-milestones': 'milestone_planning'
} as const

export type WorkbenchGuideId = keyof typeof guideSources
let pendingGuide: WorkbenchGuideId | null = null
let cancelPendingGuide: (() => void) | undefined

export function useWorkbenchScreenGuide(id: WorkbenchGuideId, enabled: boolean): void {
  const ready = useAppStore((state) => state.persistedUIReady)
  const blocked = useAppStore(
    (state) =>
      state.activeModal !== 'none' ||
      state.contextualToursOnboardingVisible ||
      state.contextualToursBlockingSurfaceVisible ||
      (state.activeContextualTourId !== null && state.activeContextualTourId !== id)
  )
  const seen = useAppStore((state) => state.contextualToursSeenIds.includes(id))
  const source = guideSources[id]

  useEffect(() => {
    if (!enabled || !ready || blocked || seen || pendingGuide) {
      return
    }
    return requestContextualTourWhenReady({
      id,
      source,
      shouldContinue: () =>
        !pendingGuide && !useAppStore.getState().contextualToursSeenIds.includes(id)
    })
  }, [id, source, enabled, ready, blocked, seen])

  useEffect(() => () => useAppStore.getState().suppressContextualTour(id, source), [id, source])
}

export function replayWorkbenchGuide(id: WorkbenchGuideId): void {
  const state = useAppStore.getState()
  cancelPendingGuide?.()
  pendingGuide = id
  if (state.activeContextualTourId) {
    state.cancelContextualTour(state.activeContextualTourId)
  }
  let timer: number | undefined
  let unsubscribe: (() => void) | undefined
  const unsubscribeProjectPage = subscribeProjectPage(() => clearPending())
  const clearPending = () => {
    cancelRequest()
    window.clearTimeout(timer)
    unsubscribe?.()
    unsubscribeProjectPage()
    pendingGuide = null
    cancelPendingGuide = undefined
  }
  const cancelRequest = requestContextualTourWhenReady({
    id,
    source: guideSources[id],
    maxAttempts: 80,
    waitForActiveTourToClear: true,
    shouldContinue: () => {
      if (id === 'workbench-milestones') {
        document
          .querySelector('.wb-ml [data-contextual-tour-target~="milestone-start"]')
          ?.scrollIntoView({ block: 'center' })
      }
      return true
    }
  })
  cancelPendingGuide = clearPending
  unsubscribe = useAppStore.subscribe((next) => {
    if (next.activeContextualTourId === id || next.activeView !== state.activeView) {
      clearPending()
    }
  })
  timer = window.setTimeout(() => {
    clearPending()
    if (id === 'workbench-milestones') {
      toast('里程碑暂未就绪。等项目规划读完，或从里程碑重试读取后再打开引导。')
    }
  }, 8000)
}

export function openWorkbenchGuide(id: WorkbenchGuideId): void {
  const state = useAppStore.getState()
  const activeRepo =
    (state.activeRepoId &&
      findRepoForHost(state.repos, state.activeRepoId, {
        hostId: state.activeWorkspaceExecutionHostId ?? undefined
      })) ||
    state.repos[0]
  if (id === 'workbench-milestones' && activeRepo?.kind === 'folder') {
    openProjectWall()
    toast('打开一个 Git 项目的总览，再从页头帮助选择「里程碑引导」。')
    replayWorkbenchGuide('workbench-wall')
    return
  }
  if (id === 'workbench-wall') {
    openProjectWall()
  } else {
    closeProjectPage()
    state.openActivityPage()
  }
  replayWorkbenchGuide(id === 'workbench-milestones' && !activeRepo ? 'workbench-overview' : id)
}

export function WorkbenchOverviewHelp({ milestones }: { milestones: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="wb-btn wb-btn-ghost wb-icon-button"
          aria-label="项目总览帮助"
        >
          <CircleHelp size={16} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => replayWorkbenchGuide('workbench-overview')}>
          项目名片引导
        </DropdownMenuItem>
        {milestones && (
          <DropdownMenuItem onSelect={() => replayWorkbenchGuide('workbench-milestones')}>
            里程碑引导
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function WorkbenchWallGuide({ enabled }: { enabled: boolean }) {
  useWorkbenchScreenGuide('workbench-wall', enabled)
  return (
    <WorkbenchIconButton
      label="项目墙帮助"
      icon={CircleHelp}
      onClick={() => replayWorkbenchGuide('workbench-wall')}
    />
  )
}
