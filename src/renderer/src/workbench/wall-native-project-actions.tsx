import { useAppStore } from '@/store'
import { getRepoOwnerWorktreeVisibilityDefaults } from '@/store/worktree-visibility-defaults-by-host'
import { getProjectGroupHostId } from '@/store/slices/project-group-owner-routing'
import { RepoHeaderProjectActionsMenu } from '@/components/sidebar/worktree-list/rows/repo-header-project-actions'
import { ProjectGroupHeaderMenu } from '@/components/sidebar/worktree-list/rows/project-group-header-actions'
import { useProjectGroupDialogs } from '@/components/sidebar/worktree-list/rows/use-project-group-dialogs'
import { SidebarWorktreeListDialogs } from '@/components/sidebar/worktree-list/rows/ProjectGroupDialogs'
import type { Repo } from '../../../shared/repo-types'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { WallProject } from './workbench-wall-projects'

export function useWallNativeProjectActions(guard: (action: () => void) => void) {
  const repos = useAppStore((s) => s.repos)
  const projectGroups = useAppStore((s) => s.projectGroups)
  const settings = useAppStore((s) => s.settings)
  const defaults = useAppStore((s) => s.worktreeVisibilityDefaultsByHost)
  const dialogs = useProjectGroupDialogs({ repos, projectGroups })
  const settingsFor = (repo: Repo, sectionId?: string) =>
    guard(() => {
      const store = useAppStore.getState()
      store.openSettingsTarget({
        pane: 'repo',
        repoId: repo.id,
        hostId: getRepoExecutionHostId(repo),
        ...(sectionId ? { sectionId } : {})
      })
      store.openSettingsPage()
    })
  const visibilityFor = (repo: Repo) =>
    useAppStore
      .getState()
      .openModal('worktree-visibility', { repoId: repo.id, hostId: getRepoExecutionHostId(repo) })
  const repoMenu = (repo: Repo) => (
    <RepoHeaderProjectActionsMenu
      repo={repo}
      label={repo.displayName}
      projectGroups={projectGroups.filter(
        (group) => getProjectGroupHostId(group) === getRepoExecutionHostId(repo)
      )}
      actions={{
        getWorktreeVisibilityDefaults: (row) =>
          getRepoOwnerWorktreeVisibilityDefaults(row, settings, defaults),
        onOpenRepoSettings: (_id, sectionId) => settingsFor(repo, sectionId),
        onOpenWorktreeVisibility: visibilityFor,
        onCreateGroupFromRepo: (row) => guard(() => dialogs.handleCreateGroupFromRepo(row)),
        onMoveProjectToGroup: (row, groupId) =>
          guard(() => dialogs.handleMoveProjectToGroup(row, groupId)),
        onRemoveProjectFromGroup: (row) => guard(() => dialogs.handleRemoveProjectFromGroup(row)),
        onRemoveProject: (row) =>
          guard(() =>
            useAppStore.getState().openModal('confirm-remove-folder', {
              repoId: row.id,
              displayName: row.displayName,
              hostId: getRepoExecutionHostId(row)
            })
          ),
        onCreateForRepo: (repoId) =>
          guard(() =>
            useAppStore.getState().openModal('new-workspace-composer', {
              initialRepoId: repoId,
              telemetrySource: 'sidebar'
            })
          )
      }}
    />
  )
  return {
    settingsFor,
    repoMenu,
    projectMenu: (project: WallProject) =>
      project.group ? (
        <ProjectGroupHeaderMenu
          groupId={project.group.id}
          hostId={getProjectGroupHostId(project.group)}
          label={project.group.name}
          onRename={(...args) => guard(() => dialogs.handleRenameProjectGroup(...args))}
          onDelete={(...args) => guard(() => dialogs.handleDeleteProjectGroup(...args))}
        />
      ) : (
        repoMenu(project.rows[0])
      ),
    dialogs: (
      <SidebarWorktreeListDialogs
        dialogs={dialogs}
        repos={repos}
        settings={settings}
        suppressExternalWorktreeInboxRepoId={null}
        setSuppressExternalWorktreeInboxRepoId={() => {}}
        newExternalWorktreeInboxActionState={new Map()}
        onConfirmSuppressExternalWorktreeInbox={() => {}}
        onOpenWorktreeVisibility={visibilityFor}
      />
    )
  }
}
