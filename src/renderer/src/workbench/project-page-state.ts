import { useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { WallProjectFilters } from './use-wall-projects'
import { beginProjectWallVisit } from './wall-refresh'

/** G2（P6）：版本总览页选项——按项目注册行与版本打开，只读派生，无第二份存储。 */
export type VersionOverviewOptions = {
  milestoneOrigin?: { feature: string }
  repoId: string
  version: string
}

type ProjectPage =
  | { kind: 'wall' }
  | {
      kind: 'project-overview'
      options: { repoId: string; hostId: ExecutionHostId; filters: WallProjectFilters }
    }
  | { kind: 'version-overview'; options: VersionOverviewOptions }
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

export function openFilteredProjectOverview(
  repoId: string,
  hostId: ExecutionHostId,
  filters: WallProjectFilters
): void {
  useAppStore.getState().openActivityPage()
  setProjectPage({ kind: 'project-overview', options: { repoId, hostId, filters } })
}

/** G2（P6）：版本总览（表格周报风格，只读派生自 Git 材料与登记）。 */
export function openVersionOverview(options: VersionOverviewOptions): void {
  useAppStore.getState().openActivityPage()
  setProjectPage({ kind: 'version-overview', options: { ...options } })
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
