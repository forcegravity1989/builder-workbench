import type { Worktree } from '../../../../shared/worktree/types'
import type { Repo } from '../../../../shared/repository/repo-types'
import type { VersionCatalogEntry } from '../../../../shared/workbench/version-catalog'
import { getRepoExecutionHostId } from '../../../../shared/execution-host/execution-host'
import { findVersionFlowWorktrees } from '../../../../shared/workbench/version-workspace-match'
import { notifyWorkbenchError } from '../error-feedback'
import { openVersionOverview } from '../project-page-state'
import { versionMaterialSelection } from '../version-material-selection'
import { openWorkbenchWorkspaceChoice } from '../version-workspace-choice-state'

export function openOverviewFromWorktree(
  tree: Worktree,
  version: string,
  onOpened?: () => void
): void {
  try {
    const selection = versionMaterialSelection(tree)
    if (!selection) {
      throw new Error('该流程工作区已变化')
    }
    openVersionOverview({ ...selection, version })
    onOpened?.()
  } catch (error) {
    notifyWorkbenchError('无法打开版本总览', error, '请刷新登记后重新选择工作区。')
  }
}

export function openOverviewFromCatalog(
  repo: Repo,
  worktrees: readonly Worktree[],
  entry: VersionCatalogEntry,
  onOpened?: () => void
): void {
  for (const workflow of ['plan', 'acceptance'] as const) {
    const candidates = findVersionFlowWorktrees(worktrees, { version: entry.version, workflow })
    if (candidates.length > 1 && !entry.material[workflow]) {
      openWorkbenchWorkspaceChoice({
        title: `${entry.version} · 选择总览的${workflow === 'plan' ? '计划' : '验收'}工作区`,
        candidates,
        onChoose: (tree) => openOverviewFromWorktree(tree, entry.version, onOpened)
      })
      return
    }
  }
  openVersionOverview({
    repoId: repo.id,
    hostId: getRepoExecutionHostId(repo),
    version: entry.version
  })
  onOpened?.()
}
