import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  projectGroupRemovalKeys,
  selectProjectGroupRemovalTargets
} from '@/store/slices/project-group-removal-targets'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import { selectRepoRemovalHostLabel } from '@/store/repos/repo-removal-registration'
import { getProjectGroupHostId } from '@/store/slices/project-group-owner-routing'
import type { ProjectGroup } from '../../../../../../shared/project-group-types'
import type { Repo } from '../../../../../../shared/repo-types'
import {
  getRepoExecutionHostId,
  getSshTargetIdForExecutionHost,
  isRuntimeOwnedSshTargetId,
  type ExecutionHostId
} from '../../../../../../shared/execution-host'

export type ProjectGroupNameDialogState =
  | { type: 'create-from-repo'; repo: Repo }
  // hostId is the group row's owner host, so the mutation is not routed to whichever host has focus.
  | { type: 'rename'; groupId: string; currentName: string; hostId?: ExecutionHostId }

export type ProjectGroupDeleteDialogState = {
  groupId: string
  groupName: string
  confirmedProjectKeys?: readonly string[]
  expectedEnvironmentPairingRevision?: number
  hostId: ExecutionHostId
}

export type ProjectGroupDialogs = ReturnType<typeof useProjectGroupDialogs>

function reportProjectGroupDeleteFailures(result: {
  status: string
  failedProjectRemovals: readonly unknown[]
  requestedProjectIds: readonly unknown[]
  error?: string
}): void {
  // Why: a missing group is already the desired end state, so only a real delete failure warrants a toast.
  if (result.status === 'group-delete-failed') {
    toast.error(
      translate('auto.components.sidebar.WorktreeList.groupDeleteFailed', 'Failed to delete group'),
      {
        description:
          result.error ??
          translate(
            'auto.components.sidebar.WorktreeList.groupDeleteFailedDesc',
            'Something went wrong while deleting the group. No projects were removed.'
          )
      }
    )
    return
  }
  if (result.status === 'deleted-group' && result.failedProjectRemovals.length > 0) {
    const requestedCount = result.requestedProjectIds.length
    toast.error(
      translate(
        'auto.components.sidebar.WorktreeList.b667b59632',
        'Some projects could not be removed from Orca'
      ),
      {
        description: translate(
          'auto.components.sidebar.WorktreeList.f94466bc39',
          '{{value0}} of {{value1}} contained project{{value2}} remained after deleting the group.',
          {
            value0: result.failedProjectRemovals.length,
            value1: requestedCount,
            value2: requestedCount === 1 ? '' : 's'
          }
        )
      }
    )
  }
}

// Create/rename/delete flows for project groups, including the contained-project fan-out.
export function useProjectGroupDialogs(args: {
  repos: readonly Repo[]
  projectGroups: readonly ProjectGroup[]
}) {
  const { repos, projectGroups } = args
  const moveProjectToGroup = useAppStore((s) => s.moveProjectToGroup)
  const createProjectGroup = useAppStore((s) => s.createProjectGroup)
  const updateProjectGroup = useAppStore((s) => s.updateProjectGroup)
  const deleteProjectGroupWithContainedProjects = useAppStore(
    (s) => s.deleteProjectGroupWithContainedProjects
  )
  const [nameDialog, setNameDialog] = useState<ProjectGroupNameDialogState | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<ProjectGroupDeleteDialogState | null>(null)

  const handleCreateGroupFromRepo = useCallback((repo: Repo) => {
    setNameDialog({ type: 'create-from-repo', repo })
  }, [])

  const handleMoveProjectToGroup = useCallback(
    (repo: Repo, groupId: string) => {
      if (repo.projectGroupId === groupId) {
        return
      }
      void moveProjectToGroup(repo.id, groupId, undefined, { hostId: getRepoExecutionHostId(repo) })
    },
    [moveProjectToGroup]
  )

  const handleRemoveProjectFromGroup = useCallback(
    (repo: Repo) => {
      void moveProjectToGroup(repo.id, null, undefined, { hostId: getRepoExecutionHostId(repo) })
    },
    [moveProjectToGroup]
  )

  const handleRenameProjectGroup = useCallback(
    (groupId: string, currentName: string, hostId?: ExecutionHostId) => {
      setNameDialog({ type: 'rename', groupId, currentName, hostId })
    },
    []
  )

  const handleSubmitProjectGroupName = useCallback(
    async (name: string) => {
      if (!nameDialog) {
        return
      }
      if (nameDialog.type === 'create-from-repo') {
        const owner = { hostId: getRepoExecutionHostId(nameDialog.repo) }
        const group = await createProjectGroup(name, owner)
        if (group) {
          await moveProjectToGroup(nameDialog.repo.id, group.id, undefined, owner)
        }
        return
      }
      const renamed = await updateProjectGroup(
        nameDialog.groupId,
        { name },
        { hostId: nameDialog.hostId }
      )
      if (!renamed) {
        toast.error(
          translate(
            'auto.components.sidebar.WorktreeList.groupRenameFailed',
            'Failed to rename group'
          ),
          {
            description: translate(
              'auto.components.sidebar.WorktreeList.groupRenameFailedDesc',
              // Why: a falsy result also covers RPC timeout/disconnect, so the copy must not assert the host refused.
              "Orca could not confirm the new name with the group's host. Recheck the group after reconnecting."
            )
          }
        )
      }
    },
    [createProjectGroup, moveProjectToGroup, nameDialog, updateProjectGroup]
  )

  const deleteTargets = useMemo(() => {
    if (!deleteDialog) {
      return null
    }
    return selectProjectGroupRemovalTargets(
      projectGroups,
      repos,
      deleteDialog.groupId,
      deleteDialog.hostId
    )
  }, [deleteDialog, projectGroups, repos])
  const groupHostId = deleteTargets?.ownerHostId
  const deleteGroupHostLabel = useAppStore((s) =>
    groupHostId ? selectExecutionHostDisplayLabel(s, groupHostId) : null
  )
  const deleteProjectNames = useMemo(() => {
    if (!deleteTargets) {
      return []
    }
    const state = useAppStore.getState()
    return deleteTargets.projects.map((repo) => {
      const host = selectRepoRemovalHostLabel(state, repo)
      return `${repo.displayName} · ${host} · ${repo.path}`
    })
  }, [deleteTargets])
  const deleteProjectCount = deleteProjectNames.length
  const removesVirtualMachine =
    deleteTargets?.projects.some((repo) =>
      isRuntimeOwnedSshTargetId(getSshTargetIdForExecutionHost(getRepoExecutionHostId(repo)))
    ) ?? false
  const projectKeys = useMemo(
    () => projectGroupRemovalKeys(deleteTargets?.projects ?? []),
    [deleteTargets]
  )
  const confirmedKeys = deleteDialog?.confirmedProjectKeys
  const removeContainedProjects = confirmedKeys !== undefined

  const setRemoveContainedProjects = (checked: boolean) => {
    setDeleteDialog((current) =>
      current ? { ...current, confirmedProjectKeys: checked ? projectKeys : undefined } : current
    )
  }

  const handleDeleteProjectGroup = useCallback(
    (groupId: string, groupName: string, hostId?: ExecutionHostId) => {
      const ownerHostId =
        hostId ?? selectProjectGroupRemovalTargets(projectGroups, [], groupId).ownerHostId
      if (ownerHostId) {
        const revision = projectGroups.find(
          (group) => group.id === groupId && getProjectGroupHostId(group) === ownerHostId
        )?.pairedCatalogRevision
        setDeleteDialog({
          groupId,
          groupName,
          hostId: ownerHostId,
          ...(revision !== undefined ? { expectedEnvironmentPairingRevision: revision } : {})
        })
      }
    },
    [projectGroups]
  )

  const handleConfirmDeleteProjectGroup = useCallback(async () => {
    if (!deleteDialog || !deleteTargets?.ownerHostId) {
      return false
    }
    const result = await deleteProjectGroupWithContainedProjects(deleteDialog.groupId, {
      removeContainedProjects,
      hostId: deleteTargets.ownerHostId,
      ...(confirmedKeys ? { confirmedProjectKeys: confirmedKeys } : {}),
      ...(deleteDialog.expectedEnvironmentPairingRevision !== undefined
        ? { expectedEnvironmentPairingRevision: deleteDialog.expectedEnvironmentPairingRevision }
        : {})
    })
    if (result.status === 'group-members-changed') {
      setDeleteDialog((current) =>
        current ? { ...current, confirmedProjectKeys: undefined } : current
      )
      toast.error(
        translate(
          'auto.components.sidebar.WorktreeList.groupDeleteMembersChanged',
          'Group membership changed. Review the project list and confirm again.'
        )
      )
      return false
    }
    reportProjectGroupDeleteFailures(result)
    setDeleteDialog(null)
    return true
  }, [
    deleteProjectGroupWithContainedProjects,
    removeContainedProjects,
    deleteDialog,
    deleteTargets,
    confirmedKeys
  ])

  return {
    nameDialog,
    setNameDialog,
    deleteDialog,
    setDeleteDialog,
    deleteGroupHostLabel,
    deleteProjectCount,
    deleteProjectNames,
    removesVirtualMachine,
    removeContainedProjects,
    setRemoveContainedProjects,
    handleCreateGroupFromRepo,
    handleMoveProjectToGroup,
    handleRemoveProjectFromGroup,
    handleRenameProjectGroup,
    handleSubmitProjectGroupName,
    handleDeleteProjectGroup,
    handleConfirmDeleteProjectGroup
  }
}
