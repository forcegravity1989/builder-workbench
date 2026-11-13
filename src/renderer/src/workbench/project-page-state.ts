import { useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import type { Repo } from '../../../shared/repo-types'
import { currentProjectRepo, resolveProjectSource } from './project-source-resolution'
import { requestVersionSidebarFocus } from './version-sidebar-state'
import { beginProjectWallVisit } from './wall-refresh'

/** G2（P6）：版本总览页选项——按项目注册行与版本打开，只读派生，无第二份存储。 */
export type VersionOverviewOptions = {
  milestoneOrigin?: { feature: string }
  repoId: string
  /** 点击时解析出的来源主机：版本总览只读这台主机上的登记与材料。 */
  hostId: ExecutionHostId
  version: string
  workflow?: 'plan' | 'acceptance'
}

type ProjectSource = Pick<VersionOverviewOptions, 'repoId' | 'hostId'>
type ProjectPage =
  | { kind: 'wall' }
  | { kind: 'project-overview' | 'knowledge'; options: ProjectSource | null }
  | { kind: 'version-overview'; options: VersionOverviewOptions }
  | { kind: 'cycle'; options: NativeWorkspaceScope }
  | null

let projectPage: ProjectPage = null
const listeners = new Set<() => void>()

function setProjectPage(page: ProjectPage): void {
  projectPage = page
  for (const listener of listeners) {
    listener()
  }
}

export function openProjectWall(): void {
  useAppStore.getState().openActivityPage()
  if (projectPage?.kind !== 'wall') {
    beginProjectWallVisit()
  }
  setProjectPage({ kind: 'wall' })
}

export function openAddProject(): void {
  const state = useAppStore.getState()
  if (projectPage?.kind === 'wall' && state.repos.length === 0) {
    state.openModal('add-repo', { stayOnProjectWall: true })
    return
  }
  state.openModal('add-repo')
}

function projectSource(repo: Repo | null): ProjectSource | null {
  return repo ? { repoId: repo.id, hostId: getRepoExecutionHostId(repo) } : null
}

export function openProjectOverview(repo?: Repo): void {
  const state = useAppStore.getState()
  const current = repo ?? currentProjectRepo(state)
  const source = current && resolveProjectSource(state, current)
  state.openActivityPage()
  setProjectPage({ kind: 'project-overview', options: projectSource(source) })
  if (repo && source) {
    requestVersionSidebarFocus(source.id)
  }
}

export function openKnowledgePage(): void {
  const state = useAppStore.getState()
  const current = currentProjectRepo(state)
  const source = current && resolveProjectSource(state, current, true)
  state.openSpacePage()
  setProjectPage({ kind: 'knowledge', options: projectSource(source) })
}

/** G2（P6）：版本总览（表格周报风格，只读派生自 Git 材料与登记）。 */
export function openVersionOverview(options: VersionOverviewOptions): void {
  useAppStore.getState().openActivityPage()
  setProjectPage({ kind: 'version-overview', options: { ...options } })
}

export function openCycleProject(scope: NativeWorkspaceScope): void {
  useAppStore.getState().openArtifactsPage()
  setProjectPage({ kind: 'cycle', options: scope })
}

export function closeProjectPage(): void {
  if (projectPage) {
    setProjectPage(null)
  }
}

useAppStore.subscribe((state, previous) => {
  if (state.activeView !== previous.activeView) {
    const overviewSettingsRoundTrip =
      projectPage?.kind === 'version-overview' &&
      ((previous.activeView === 'activity' && state.activeView === 'settings') ||
        (previous.activeView === 'settings' && state.activeView === 'activity'))
    if (!overviewSettingsRoundTrip) {
      closeProjectPage()
    }
  }
})

export function useProjectPage(): ProjectPage {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => projectPage,
    () => null
  )
}
