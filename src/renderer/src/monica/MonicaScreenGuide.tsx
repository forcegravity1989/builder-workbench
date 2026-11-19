import { useEffect } from 'react'
import { CircleHelp } from 'lucide-react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { hasContextualTourTarget } from '@/components/contextual-tours/contextual-tour-gate'
import { requestContextualTourWhenReady } from '@/components/contextual-tours/request-contextual-tour-when-ready'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { MonicaIconButton } from './MonicaIconButton'
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
import { normalizeStoredMonicaVersionBinding } from '../../../shared/monica/version-binding'
import { activateVersionWorktree } from './version-worktree-host'

const guideSources = {
  'monica-wall': 'project_wall_visible',
  'monica-overview': 'project_overview_visible',
  'monica-scoreboard': 'project_scoreboard_visible',
  'monica-milestones': 'milestone_planning',
  'monica-plan': 'version_plan_visible',
  'monica-acceptance': 'version_acceptance_visible',
  'monica-version-overview': 'version_overview_visible',
  'monica-versions': 'version_sidebar_visible',
  browser: 'browser_visible',
  'monica-source-control': 'workbench_source_control_visible',
  tasks: 'workbench_tasks_visible'
} as const

export type MonicaGuideId = keyof typeof guideSources
let pendingGuide: MonicaGuideId | null = null
let cancelPendingGuide: (() => void) | undefined

export function useMonicaScreenGuide(id: MonicaGuideId, enabled: boolean, autoStart = true): void {
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
    if (!enabled || !autoStart || !ready || blocked || seen || pendingGuide) {
      return
    }
    return requestContextualTourWhenReady({
      id,
      source,
      shouldContinue: () =>
        !pendingGuide && !useAppStore.getState().contextualToursSeenIds.includes(id)
    })
  }, [id, source, enabled, autoStart, ready, blocked, seen])

  useEffect(() => {
    if (!enabled) {
      useAppStore.getState().suppressContextualTour(id, source)
    }
    return () => useAppStore.getState().suppressContextualTour(id, source)
  }, [enabled, id, source])
}

export function replayMonicaGuide(id: MonicaGuideId): void {
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
      if (id === 'monica-milestones') {
        document
          .querySelector('.monica-ml [data-contextual-tour-target~="milestone-start"]')
          ?.scrollIntoView({ block: 'center' })
      }
      if (id === 'monica-scoreboard') {
        document
          .querySelector('[data-monica-scoreboard-guide]')
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
    if (id === 'monica-milestones') {
      toast('里程碑暂未就绪。等项目规划读完，或从里程碑重试读取后再打开引导。')
    } else if (id === 'monica-scoreboard') {
      toast(
        translate(
          'guidance.outcomes.scoreboardUnavailable',
          'Open a Git project overview to use the scoreboard guide.'
        )
      )
    }
  }, 8000)
}

export function openMonicaGuide(id: MonicaGuideId): void {
  const state = useAppStore.getState()
  const page = getProjectPage()
  const explicit =
    page?.kind === 'project-overview' || page?.kind === 'version-overview' ? page.options : null
  const currentRepo = currentProjectRepo(state)
  const activeRepo = explicit
    ? findRepoForHost(state.repos, explicit.repoId, explicit)
    : currentRepo
  if (id === 'browser') {
    // The Explore dialog makes its underlying surface aria-hidden until it unmounts.
    window.setTimeout(() => {
      if (
        hasContextualTourTarget(
          '[data-contextual-tour-target="browser-annotation-control"]:not(:disabled)'
        )
      ) {
        replayMonicaGuide(id)
      } else {
        toast('请在工作区打开浏览器选项卡并加载页面，再点浏览器工具栏右侧的帮助。')
      }
    }, 0)
    return
  }
  if (id === 'monica-source-control') {
    if (!state.activeWorktreeId) {
      toast('请先打开一个 Git 工作区，再从源代码管理工具栏打开检视引导。')
      return
    }
    closeProjectPage()
    state.setActiveView('terminal')
    state.setRightSidebarOpen(true)
    state.setRightSidebarTab('source-control')
    replayMonicaGuide(id)
    return
  }
  if (id === 'tasks') {
    const eligible = getTaskEligibleRepos(state.repos).find((repo) => repo.id === activeRepo?.id)
    closeProjectPage()
    state.openTaskPage(eligible ? { preselectedRepoId: eligible.id } : {}, {
      recordTasksInteraction: false
    })
    replayMonicaGuide(id)
    return
  }
  if (id === 'monica-plan' || id === 'monica-versions') {
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
    const binding = normalizeStoredMonicaVersionBinding(tree?.workbenchVersionBinding)
    state.setSidebarOpen(true)
    state.setSidebarBody('workspaces')
    if (
      id === 'monica-plan' &&
      !explicit &&
      tree &&
      tree.repoId === activeRepo.id &&
      binding?.workflow === 'plan' &&
      activateVersionWorktree(tree)
    ) {
      replayMonicaGuide('monica-plan')
    } else if (page?.kind === 'version-overview') {
      replayMonicaGuide('monica-versions')
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
      replayMonicaGuide('monica-versions')
    }
    return
  }
  if (id === 'monica-milestones' && activeRepo?.kind === 'folder') {
    openProjectWall()
    toast('打开一个 Git 项目的总览，再从页头帮助选择「里程碑引导」。')
    replayMonicaGuide('monica-wall')
    return
  }
  if (id === 'monica-scoreboard' && (!activeRepo || !isGitRepoKind(activeRepo))) {
    openProjectWall()
    toast(
      translate(
        'guidance.outcomes.scoreboardUnavailable',
        'Open a Git project overview to use the scoreboard guide.'
      )
    )
    return
  }
  if (id === 'monica-wall') {
    openProjectWall()
  } else {
    openProjectOverview(activeRepo ?? undefined)
  }
  replayMonicaGuide(id === 'monica-milestones' && !activeRepo ? 'monica-overview' : id)
}

export function MonicaOverviewHelp({
  milestones,
  scoreboard = false
}: {
  milestones: boolean
  scoreboard?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="monica-btn monica-btn-ghost monica-icon-button"
          aria-label="项目总览帮助"
        >
          <CircleHelp size={16} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => replayMonicaGuide('monica-overview')}>
          项目名片引导
        </DropdownMenuItem>
        {milestones && (
          <DropdownMenuItem onSelect={() => replayMonicaGuide('monica-milestones')}>
            里程碑引导
          </DropdownMenuItem>
        )}
        {scoreboard && (
          <DropdownMenuItem onSelect={() => replayMonicaGuide('monica-scoreboard')}>
            {translate('guidance.outcomes.scoreboardHelp', 'Scoreboard guide')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function MonicaWallGuide({ enabled }: { enabled: boolean }) {
  useMonicaScreenGuide('monica-wall', enabled)
  return (
    <MonicaIconButton
      label="项目墙帮助"
      icon={CircleHelp}
      onClick={() => replayMonicaGuide('monica-wall')}
    />
  )
}

export function MonicaTaskHelp({ enabled }: { enabled: boolean }) {
  useMonicaScreenGuide('tasks', enabled)
  return (
    <MonicaIconButton
      label={translate('guidance.planning.taskHelp', 'Task help')}
      icon={CircleHelp}
      onClick={() => replayMonicaGuide('tasks')}
    />
  )
}

export function MonicaVersionResultHelp({
  screen,
  enabled
}: {
  screen: 'monica-acceptance' | 'monica-version-overview'
  enabled: boolean
}) {
  useMonicaScreenGuide(screen, enabled)
  return (
    <MonicaIconButton
      label={screen === 'monica-acceptance' ? '版本验收帮助' : '版本总览帮助'}
      icon={CircleHelp}
      className="shrink-0"
      disabled={!enabled}
      onClick={() => replayMonicaGuide(screen)}
    />
  )
}
