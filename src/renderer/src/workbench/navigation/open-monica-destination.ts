import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { getRepoRowIdentity } from '@/store/repos/repo-host-identity'
import { isSettingsNavigationTarget } from '@/components/settings/navigation/settings-navigation-types'
import { getRepoExecutionHostId } from '../../../../shared/execution-host/execution-host'
import type { Repo } from '../../../../shared/repository/repo-types'
import catalog from '../../../../shared/workbench/monica-navigation.json'
import { isWorkbenchShell } from '../is-workbench-shell'
import {
  openAddProject,
  openProjectWall,
  openKnowledgePage,
  openProjectOverviewSource,
  getProjectPage,
  subscribeProjectPage
} from '../project-page-state'
import { replayWorkbenchGuide, type WorkbenchGuideId } from '../WorkbenchScreenGuide'
import { isVersionHostDisconnected } from '../version-worktree-host'
import { getTaskEligibleRepos } from '../../../../shared/work-items/task-repo-selection'

const guideIds: Partial<Record<string, WorkbenchGuideId>> = {
  'project-wall': 'workbench-wall',
  'project-overview': 'workbench-overview',
  milestones: 'workbench-milestones',
  scoreboard: 'workbench-scoreboard',
  tasks: 'tasks',
  'version-workspace': 'workbench-versions',
  'version-overview': 'workbench-version-overview',
  'version-plan': 'workbench-plan',
  'version-acceptance': 'workbench-acceptance'
}

export function followMonicaGuide(page: string): void {
  const guide = guideIds[page]
  if (guide) {
    replayWorkbenchGuide(guide)
  }
}

function revealOverviewSection(id: string): void {
  const selector = id === 'milestones' ? '.wb-ml' : '[data-workbench-scoreboard-guide]'
  const page = getProjectPage()
  const observer = new MutationObserver(reveal)
  const unsubscribe = subscribeProjectPage(() => {
    if (getProjectPage() !== page) {
      stop()
    }
  })
  const timer = window.setTimeout(() => {
    stop()
    toast('此项目暂时无法显示该区域。')
  }, 8000)
  function stop(): void {
    window.clearTimeout(timer)
    unsubscribe()
    observer.disconnect()
  }
  function reveal(): void {
    const element = document.querySelector(selector)
    if (element) {
      element.scrollIntoView({ block: 'center' })
      stop()
    }
  }
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-workbench-scoreboard-guide']
  })
  window.requestAnimationFrame(() => {
    if (getProjectPage() === page) {
      reveal()
    }
  })
}

export function openMonicaProjectPage(
  page: string,
  guide: boolean,
  repo: Repo,
  version?: string
): void {
  const state = useAppStore.getState()
  const hostId = getRepoExecutionHostId(repo)
  if (
    state.repos.some(
      (other) => other !== repo && other.id === repo.id && getRepoExecutionHostId(other) === hostId
    )
  ) {
    toast.error('这个主机上有多个同一项目登记，页面无法区分，请从相应工作区打开。')
    return
  }
  if (
    repo.kind === 'folder' &&
    (page === 'milestones' || page === 'scoreboard' || page.startsWith('version-'))
  ) {
    toast.error('请先选择一个 Git 项目。')
    state.openModal('monica-navigation', { page, guide, version, gitOnly: true })
    return
  }
  if (isVersionHostDisconnected({ repoId: repo.id, hostId })) {
    toast.error('项目所在主机已断开，请连接后重试。')
    return
  }
  if (page.startsWith('version-')) {
    state.openModal('monica-navigation', {
      page,
      guide,
      projectRow: getRepoRowIdentity(repo),
      version
    })
    return
  }
  if (page === 'settings-repo') {
    state.openSettingsTarget({ pane: 'repo', repoId: repo.id, hostId })
    state.openSettingsPage()
  } else if (page === 'knowledge') {
    if (hostId !== 'local') {
      state.openModal('monica-navigation', { page, guide, localOnly: true })
      return
    }
    openKnowledgePage(repo)
  } else if (page === 'tasks') {
    if (
      !getTaskEligibleRepos(state.repos).some(
        (row) => getRepoRowIdentity(row) === getRepoRowIdentity(repo)
      ) ||
      state.repos.some((other) => other !== repo && other.id === repo.id)
    ) {
      toast.error('无法在任务页唯一定位该项目，请从项目工作区进入。')
      return
    }
    state.openTaskPage({ preselectedRepoId: repo.id })
  } else {
    openProjectOverviewSource(repo)
    if (!guide && (page === 'milestones' || page === 'scoreboard')) {
      revealOverviewSection(page)
    }
  }
  if (guide) {
    followMonicaGuide(page)
  }
}

export function openMonicaDestination(target: string, project?: string, version?: string): void {
  if (!isWorkbenchShell()) {
    return
  }
  const state = useAppStore.getState()
  for (const [prefix, entries] of [
    ['journey-', catalog.journeys],
    ['feature-', catalog.features],
    ['settings-', catalog.settings]
  ] as const) {
    if (!target.startsWith(prefix) || target === 'settings-repo') {
      continue
    }
    const id = target.slice(prefix.length)
    if (!Object.hasOwn(entries, id)) {
      break
    }
    if (prefix === 'settings-') {
      const destination = { pane: id, repoId: null }
      if (isSettingsNavigationTarget(destination)) {
        state.openSettingsTarget(destination)
        state.openSettingsPage()
      }
    } else {
      state.openModal('feature-wall', {
        source: 'help_menu',
        [prefix === 'journey-' ? 'journey' : 'feature']: id
      })
    }
    return
  }
  const guide = target.startsWith('guide-')
  const page = guide ? target.slice(6) : target
  if (
    !(page === 'settings-repo' && !guide && Object.hasOwn(catalog.settings, 'repo')) &&
    !Object.hasOwn(guide ? catalog.guides : catalog.pages, page)
  ) {
    toast.error('当前版本尚不支持这个入口，请参照回复中的文字路径。')
    return
  }
  switch (page) {
    case 'project-wall':
      openProjectWall()
      if (guide) {
        followMonicaGuide(page)
      }
      return
    case 'add-project':
      openAddProject()
      return
    case 'setup':
      state.openModal('setup-guide', { telemetrySource: 'help_menu' })
      return
    case 'explore':
      state.openModal('feature-wall', { source: 'help_menu' })
      return
    case 'settings':
      state.openSettingsPage()
      return
    case 'automations':
      state.openAutomationsPage()
      return
  }
  const repos = state.repos.filter((repo) => !repo.hiddenAt)
  const explicit = project
    ? repos.filter((repo) => getRepoRowIdentity(repo) === project || repo.displayName === project)
    : []
  const candidates = project ? explicit : repos
  const repo = candidates.length === 1 ? candidates[0] : undefined
  if (repo) {
    openMonicaProjectPage(page, guide, repo, version)
  } else {
    state.openModal('monica-navigation', { page, guide, project, version })
  }
}
