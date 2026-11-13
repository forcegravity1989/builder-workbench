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
import {
  closeProjectPage,
  getProjectPage,
  openProjectOverview,
  openProjectWall,
  subscribeProjectPage
} from './project-page-state'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import { getTaskEligibleRepos } from '@/components/task-page-default-repo-selection'
import { isGitRepoKind } from '../../../shared/repo-kind'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import { currentProjectRepo } from './project-source-resolution'
import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import { activateVersionWorktree } from './version-worktree-host'

const guideSources = {
  'workbench-wall': 'project_wall_visible',
  'workbench-overview': 'project_overview_visible',
  'workbench-milestones': 'milestone_planning',
  'workbench-plan': 'version_plan_visible',
  'workbench-versions': 'version_sidebar_visible',
  tasks: 'tasks_open'
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

  useEffect(() => {
    if (!enabled) {
      useAppStore.getState().suppressContextualTour(id, source)
    }
    return () => useAppStore.getState().suppressContextualTour(id, source)
  }, [enabled, id, source])
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
  const page = getProjectPage()
  const explicit =
    page?.kind === 'project-overview' || page?.kind === 'version-overview' ? page.options : null
  const currentRepo = currentProjectRepo(state)
  const activeRepo = explicit
    ? findRepoForHost(state.repos, explicit.repoId, explicit)
    : currentRepo
  if (id === 'tasks') {
    const eligible = getTaskEligibleRepos(state.repos).find((repo) => repo.id === activeRepo?.id)
    closeProjectPage()
    state.openTaskPage(eligible ? { preselectedRepoId: eligible.id } : {}, {
      recordTasksInteraction: false
    })
    replayWorkbenchGuide(id)
    return
  }
  if (id === 'workbench-plan' || id === 'workbench-versions') {
    if (!activeRepo || !isGitRepoKind(activeRepo)) {
      openProjectWall()
      toast('请先打开一个 Git 项目，再进入侧栏「版本工作区」。')
      return
    }
    const tree = state.activeWorktreeId
      ? state.getKnownWorktreeById(
          state.activeWorktreeId,
          state.activeWorkspaceExecutionHostId ?? undefined
        )
      : null
    const binding = normalizeStoredWorkbenchVersionBinding(tree?.workbenchVersionBinding)
    state.setSidebarOpen(true)
    state.setSidebarBody('workspaces')
    if (
      id === 'workbench-plan' &&
      !explicit &&
      tree &&
      tree.repoId === activeRepo.id &&
      binding?.workflow === 'plan' &&
      activateVersionWorktree(tree)
    ) {
      replayWorkbenchGuide('workbench-plan')
    } else if (page?.kind === 'version-overview') {
      replayWorkbenchGuide('workbench-versions')
    } else if (
      explicit &&
      (!currentRepo ||
        activeRepo.id !== currentRepo.id ||
        getRepoExecutionHostId(activeRepo) !== getRepoExecutionHostId(currentRepo))
    ) {
      openProjectWall()
      toast('请从项目墙点击要规划的项目名称，再到「版本工作区」选择版本。')
    } else {
      closeProjectPage()
      state.setActiveView('terminal')
      replayWorkbenchGuide('workbench-versions')
    }
    return
  }
  if (id === 'workbench-milestones' && activeRepo?.kind === 'folder') {
    openProjectWall()
    toast('打开一个 Git 项目的总览，再从页头帮助选择「里程碑引导」。')
    replayWorkbenchGuide('workbench-wall')
    return
  }
  if (id === 'workbench-wall') {
    openProjectWall()
  } else {
    openProjectOverview(activeRepo ?? undefined)
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
