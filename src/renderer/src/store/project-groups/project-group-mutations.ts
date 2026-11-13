import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { ProjectGroup } from '../../../../shared/project-group-types'
import type { Repo } from '../../../../shared/repo-types'
import {
  projectGroupRemovalKeys,
  selectProjectGroupRemovalTargets
} from '../slices/project-group-removal-targets'
import {
  getProjectGroupHostId,
  projectGroupMatchesOwnerHost,
  resolveProjectGroupOwnerHostId,
  settingsForProjectGroupOwner
} from '../slices/project-group-owner-routing'
import { findRepoForHost, repoMatchesHostIdentity } from '../slices/repo-host-identity'
import { callRuntimeRpc, getActiveRuntimeTarget } from '../../runtime/runtime-rpc-client'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../../shared/execution-host'
import { WORKBENCH_REPO_REMOVAL_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import { getRuntimeEnvironmentRevision } from '../../runtime/runtime-environment-revision'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import { translate } from '@/i18n/i18n'
import { repoMatchesRemovalRegistration } from '../repos/repo-removal-registration'
import type { ProjectRemovalFailure, RepoSlice } from '../repos/repo-state'
import { mergeProjectCompatibilityForHostRepoChange } from '../repos/repo-catalog-identity'
import { applyProjectGroupDeleteCascade } from './project-group-removal-state'
import { repoWithFetchedOwner, settingsForRepoOwner } from '../repos/owner-routing'
import { projectGroupWithFetchedOwner } from './project-group-owner-stamping'

export function createProjectGroupMutationActions(
  set: Parameters<StateCreator<AppState>>[0],
  get: Parameters<StateCreator<AppState>>[1]
): Pick<
  RepoSlice,
  | 'createProjectGroup'
  | 'updateProjectGroup'
  | 'deleteProjectGroup'
  | 'deleteProjectGroupWithContainedProjects'
  | 'moveProjectToGroup'
> {
  return {
    createProjectGroup: async (name, options) => {
      try {
        const owner = parseExecutionHostId(options?.hostId)
        const target = getActiveRuntimeTarget(
          owner
            ? {
                ...get().settings,
                activeRuntimeEnvironmentId: owner.kind === 'runtime' ? owner.environmentId : null
              }
            : get().settings
        )
        const group =
          target.kind === 'local'
            ? await window.api.projectGroups.create({
                name,
                createdFrom: 'manual',
                ...(owner?.kind === 'ssh' ? { connectionId: owner.targetId } : {})
              })
            : (
                await callRuntimeRpc<{ group: ProjectGroup }>(
                  target,
                  'projectGroup.create',
                  { name, createdFrom: 'manual' },
                  { timeoutMs: 15_000 }
                )
              ).group
        const ownedGroup = projectGroupWithFetchedOwner(group, target)
        const ownerHostId = getProjectGroupHostId(ownedGroup)
        set((s) => {
          // An overlapping catalog refresh may have already inserted a newer copy.
          if (
            s.projectGroups.some(
              (existing) =>
                existing.id === ownedGroup.id && getProjectGroupHostId(existing) === ownerHostId
            )
          ) {
            return s
          }
          return {
            projectGroups: [...s.projectGroups, ownedGroup],
            folderWorkspacePathStatuses: {}
          }
        })
        return ownedGroup
      } catch (err) {
        console.error('Failed to create project group:', err)
        return null
      }
    },

    updateProjectGroup: async (groupId, updates, options) => {
      try {
        // Why: the sidebar lists groups from every host, so the mutation follows the group's owner, not the focused host.
        const ownerHostId = resolveProjectGroupOwnerHostId(get(), groupId, options?.hostId)
        const target = getActiveRuntimeTarget(
          settingsForProjectGroupOwner(get(), groupId, options?.hostId)
        )
        const updated =
          target.kind === 'local'
            ? await window.api.projectGroups.update({ groupId, updates })
            : (
                await callRuntimeRpc<{ group: ProjectGroup | null }>(
                  target,
                  'projectGroup.update',
                  { groupId, updates },
                  { timeoutMs: 15_000 }
                )
              ).group
        if (!updated) {
          return false
        }
        const ownedGroup = projectGroupWithFetchedOwner(updated, target)
        set((s) => ({
          projectGroups: s.projectGroups.map((group) =>
            projectGroupMatchesOwnerHost(group, groupId, ownerHostId) ? ownedGroup : group
          ),
          folderWorkspacePathStatuses: {}
        }))
        return true
      } catch (err) {
        console.error('Failed to update project group:', err)
        return false
      }
    },

    deleteProjectGroup: async (groupId, options) => {
      try {
        // Why: deletion targets the group's owner host (see updateProjectGroup); focus may be elsewhere.
        const ownerHostId = resolveProjectGroupOwnerHostId(get(), groupId, options?.hostId)
        if (options?.hostId && !ownerHostId) {
          return false
        }
        const target = getActiveRuntimeTarget(
          settingsForProjectGroupOwner(get(), groupId, options?.hostId)
        )
        const members = options?.confirmedMembers
        const params = { groupId, ...(members ? { members } : {}) }
        const deleted =
          target.kind === 'local'
            ? await window.api.projectGroups.delete(params)
            : (
                await callRuntimeRpc<{ deleted: boolean }>(
                  target,
                  members ? 'workbench.repo.deleteGroup' : 'projectGroup.delete',
                  params,
                  {
                    timeoutMs: 15_000,
                    expectedEnvironmentPairingRevision: options?.expectedEnvironmentPairingRevision,
                    expectedEnvironmentRuntimeId: options?.expectedEnvironmentRuntimeId
                  }
                )
              ).deleted
        if (!deleted) {
          return false
        }
        if (
          target.kind === 'environment' &&
          options?.expectedEnvironmentPairingRevision !== undefined &&
          getRuntimeEnvironmentRevision(target.environmentId) !==
            options.expectedEnvironmentPairingRevision
        ) {
          return false
        }
        set((s) => applyProjectGroupDeleteCascade(s, groupId, ownerHostId))
        return true
      } catch (err) {
        console.error('Failed to delete project group:', err)
        return false
      }
    },

    deleteProjectGroupWithContainedProjects: async (groupId, options) => {
      const { repos, projectGroups } = get()
      const { ownerHostId, projects } = selectProjectGroupRemovalTargets(
        projectGroups,
        repos,
        groupId,
        options.hostId
      )
      const selectedProjects = options.removeContainedProjects ? projects : []
      const requestedProjectIds = selectedProjects.map((repo) => repo.id)
      if (!ownerHostId) {
        return {
          status: 'missing-group',
          groupId,
          requestedProjectIds,
          removedProjectIds: [],
          failedProjectRemovals: []
        }
      }

      if (
        options.removeContainedProjects &&
        options.confirmedProjectKeys &&
        JSON.stringify(options.confirmedProjectKeys) !==
          JSON.stringify(projectGroupRemovalKeys(selectedProjects))
      ) {
        return {
          status: 'group-members-changed',
          groupId,
          requestedProjectIds,
          removedProjectIds: [],
          failedProjectRemovals: []
        }
      }

      const workbench = isWorkbenchShell()
      const groupHost = parseExecutionHostId(ownerHostId)
      const revision = options.expectedEnvironmentPairingRevision
      let runtimeId: string | undefined
      if (workbench && groupHost?.kind === 'runtime') {
        const target = { kind: 'environment' as const, environmentId: groupHost.environmentId }
        try {
          if (
            revision === undefined ||
            getRuntimeEnvironmentRevision(target.environmentId) !== revision ||
            selectedProjects.some((repo) => repo.pairedRegistration?.pairingRevision !== revision)
          ) {
            throw new Error(
              translate(
                'auto.components.sidebar.RemoveFolderDialog.registrationUnavailable',
                'This project registration is no longer available. Check the project list.'
              )
            )
          }
          if (options.removeContainedProjects) {
            const status = await callRuntimeRpc<{ runtimeId: string; capabilities?: string[] }>(
              target,
              'status.get',
              undefined,
              { timeoutMs: 15_000, expectedEnvironmentPairingRevision: revision }
            )
            if (
              !status.runtimeId ||
              !status.capabilities?.includes(WORKBENCH_REPO_REMOVAL_RUNTIME_CAPABILITY)
            ) {
              throw new Error(
                translate(
                  'auto.components.sidebar.RemoveFolderDialog.updatePairedHost',
                  'Update Workbench on the paired host before removing a project registration.'
                )
              )
            }
            runtimeId = status.runtimeId
            const current = get()
            const currentTargets = selectProjectGroupRemovalTargets(
              current.projectGroups,
              current.repos,
              groupId,
              ownerHostId
            )
            if (
              !currentTargets.ownerHostId ||
              JSON.stringify(projectGroupRemovalKeys(currentTargets.projects)) !==
                JSON.stringify(projectGroupRemovalKeys(selectedProjects))
            ) {
              return {
                status: 'group-members-changed',
                groupId,
                requestedProjectIds,
                removedProjectIds: [],
                failedProjectRemovals: []
              }
            }
          }
        } catch (error) {
          return {
            status: 'group-delete-failed',
            groupId,
            requestedProjectIds,
            removedProjectIds: [],
            failedProjectRemovals: [],
            error: error instanceof Error ? error.message : String(error)
          }
        }
      }
      const confirmedMembers =
        workbench && options.removeContainedProjects
          ? selectedProjects.map((repo) => ({
              repoId: repo.id,
              hostId: repo.pairedRegistration?.hostId ?? getRepoExecutionHostId(repo),
              path: repo.path,
              addedAt: repo.addedAt
            }))
          : undefined
      const deleted = await get().deleteProjectGroup(groupId, {
        hostId: ownerHostId,
        ...(confirmedMembers === undefined ? {} : { confirmedMembers }),
        ...(revision === undefined ? {} : { expectedEnvironmentPairingRevision: revision }),
        ...(runtimeId === undefined ? {} : { expectedEnvironmentRuntimeId: runtimeId })
      })
      if (!deleted) {
        return {
          status: 'group-delete-failed',
          groupId,
          requestedProjectIds,
          removedProjectIds: [],
          failedProjectRemovals: []
        }
      }

      if (!options.removeContainedProjects) {
        return {
          status: 'deleted-group',
          groupId,
          requestedProjectIds,
          removedProjectIds: [],
          failedProjectRemovals: []
        }
      }

      const removedProjectIds: string[] = []
      const failedProjectRemovals: ProjectRemovalFailure[] = []
      // The group delete clears membership. Keep the exact registrations selected before it.
      for (const project of selectedProjects) {
        const projectId = project.id
        const hostId = getRepoExecutionHostId(project)
        const findProject = () =>
          get().repos.find(
            (repo) =>
              repoMatchesHostIdentity(repo, projectId, hostId) &&
              (workbench
                ? repoMatchesRemovalRegistration(repo, project)
                : repo.path === project.path)
          )
        try {
          if (findProject()) {
            await get().removeProject(projectId, {
              hostId,
              ...(workbench ? { expectedRegistration: project } : {}),
              ...(runtimeId === undefined ? {} : { expectedEnvironmentRuntimeId: runtimeId })
            })
          }
        } catch (err) {
          console.error('Failed to remove contained project:', err)
        }
        const stillExists = Boolean(findProject())
        if (stillExists) {
          failedProjectRemovals.push({
            projectId,
            reason: 'Project remained in Orca after removeProject completed.'
          })
        } else {
          removedProjectIds.push(projectId)
        }
      }

      return {
        status: 'deleted-group',
        groupId,
        requestedProjectIds,
        removedProjectIds,
        failedProjectRemovals
      }
    },

    moveProjectToGroup: async (projectId, groupId, order, options) => {
      try {
        if (
          !findRepoForHost(get().repos, projectId, {
            settings: get().settings,
            hostId: options?.hostId
          })
        ) {
          return false
        }
        const owner = parseExecutionHostId(options?.hostId)
        const target = getActiveRuntimeTarget(
          owner
            ? {
                ...get().settings,
                activeRuntimeEnvironmentId: owner.kind === 'runtime' ? owner.environmentId : null
              }
            : settingsForRepoOwner(get(), projectId)
        )
        const moved =
          target.kind === 'local'
            ? await window.api.projectGroups.moveProject({
                projectId,
                groupId,
                order
              })
            : (
                await callRuntimeRpc<{ repo: Repo | null }>(
                  target,
                  'projectGroup.moveProject',
                  { repo: projectId, groupId, order },
                  { timeoutMs: 15_000 }
                )
              ).repo
        if (!moved) {
          return false
        }
        const ownedMoved = repoWithFetchedOwner(moved, target)
        const movedHostId = getRepoExecutionHostId(ownedMoved)
        set((s) => {
          const nextRepos = s.repos.map((repo) =>
            repoMatchesHostIdentity(repo, projectId, movedHostId) ? ownedMoved : repo
          )
          return {
            repos: nextRepos,
            ...mergeProjectCompatibilityForHostRepoChange({
              previous: { projects: s.projects, projectHostSetups: s.projectHostSetups },
              nextRepos,
              hostId: movedHostId
            }),
            folderWorkspacePathStatuses: {}
          }
        })
        return true
      } catch (err) {
        console.error('Failed to move repo to group:', err)
        return false
      }
    }
  }
}
