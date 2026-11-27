import React, { useEffect, useMemo } from 'react'
import { useAppStore } from '@/store'
import type { VersionTreeDisplayInput } from './VersionNativeTrees'
import { WorkbenchVersionNav } from './WorkbenchVersionNav'
import { WORKTREE_SIDEBAR_VIRTUAL_ROW_GAP } from '@/components/sidebar/worktree-list/viewport/virtual-rows'
import { publishVersionSidebarProjection } from './version-sidebar-state'
import {
  isWorkbenchBotWorkspace,
  resolveProjectSource,
  workbenchSidebarProjectRepo
} from './project-source-resolution'
import { findRepoForHost } from '@/store/repos/repo-host-identity'
import { useProjectPage } from './project-page-state'
import { toRuntimeExecutionHostId } from '../../../shared/execution-host/execution-host'
import { parseWorkspaceKey } from '../../../shared/workspace/identity/workspace-scope'

/**
 * Project identity stays beside the native toolbar, outside the tree scroller.
 */
export function WorkbenchSidebarNav(): React.JSX.Element {
  const projectName = useAppStore(
    (s) => workbenchSidebarProjectRepo(s)?.displayName?.trim() || null
  )

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-2"
      data-workbench-nav
      data-workbench-project
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent)] text-xs font-semibold text-white">
        {(projectName ?? '项目墙').slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[13px] font-semibold tracking-tight text-worktree-sidebar-foreground"
          title={projectName ?? undefined}
        >
          {projectName ?? '项目墙'}
        </span>
        <span className="block truncate text-[10px] tracking-tight text-worktree-sidebar-foreground/55">
          当前项目
        </span>
      </span>
    </div>
  )
}

/**
 * Only the business directory is inserted between native Pinned and native project groups.
 */
export function WorkbenchSidebarVersions({
  visibleWorktrees
}: VersionTreeDisplayInput): React.JSX.Element {
  const page = useProjectPage()
  const versionRepo = useAppStore((s) => {
    if (page?.kind === 'version-overview' || page?.kind === 'project-overview') {
      return page.options ? findRepoForHost(s.repos, page.options.repoId, page.options) : null
    }
    if (page?.kind === 'cycle') {
      const { scope } = page.options
      const hostId = scope.runtimeOwnerEnvironmentId
        ? toRuntimeExecutionHostId(scope.runtimeOwnerEnvironmentId)
        : scope.hostId
      return findRepoForHost(s.repos, scope.repoId, { hostId })
    }
    if (s.activeView === 'tasks' && s.taskPageData.preselectedRepoId) {
      const scope = s.taskPageData.workbenchTaskScope
      const hostId = scope?.runtimeOwnerEnvironmentId
        ? toRuntimeExecutionHostId(scope.runtimeOwnerEnvironmentId)
        : scope?.homeHostId
      const repo = findRepoForHost(s.repos, s.taskPageData.preselectedRepoId, { hostId })
      if (repo) {
        return resolveProjectSource(s, repo)
      }
    }
    if (
      s.activeWorkspaceKey &&
      parseWorkspaceKey(s.activeWorkspaceKey)?.type === 'folder' &&
      !isWorkbenchBotWorkspace(s.activeWorkspaceKey)
    ) {
      return null
    }
    const repo = workbenchSidebarProjectRepo(s)
    return repo && repo.kind !== 'folder' ? resolveProjectSource(s, repo) : null
  })
  const versionRepoId = versionRepo?.id ?? null
  useEffect(() => {
    if (!versionRepoId) {
      publishVersionSidebarProjection({ repoId: null, worktreeIdentities: new Set() })
    }
  }, [versionRepoId])
  const display = useMemo(() => ({ visibleWorktrees }), [visibleWorktrees])
  return (
    <div
      className="flex min-w-0 flex-col pt-2"
      style={{ rowGap: WORKTREE_SIDEBAR_VIRTUAL_ROW_GAP }}
      data-workbench-version-section
    >
      {versionRepo && <WorkbenchVersionNav nativeDisplay={display} repo={versionRepo} />}
      {/* Why: the native flat "All" group now renders as the 工作区 section header;
          this spacer keeps the Codex-style blank line between 版本 rows and it. */}
      <div className="h-3 shrink-0" aria-hidden />
    </div>
  )
}
