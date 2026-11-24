import type { TaskPageSearchActionsModel } from './use-task-page-search-actions'
import { useCallback } from 'react'
import type { GitHubWorkItem } from '../../../../shared/github/work-items/work-item-types'
import type { GitLabWorkItem } from '../../../../shared/gitlab/gitlab-types'
import type { LinkedWorkItemSummary } from '@/lib/workspace/creation/new-workspace'
import { useAppStore } from '@/store'
import {
  matchScopedTaskWorkspaces,
  notifyScopedWorkspaceUnavailable,
  resolveScopedComposerAdditions
} from '@/workbench/scoped-task-workspace'
import { dispatchScopedWorktrees } from '@/workbench/version-workspace-choice-state'
import { track } from '@/diagnostics/telemetry/telemetry'
import { getWorkItemRepo } from '@/lib/work-items/work-item-repo-row'
import { findGithubWorkItemWorkspaceAttachment } from '@/lib/work-items/github/github-work-item-workspace-attachment'
import { activateAndRevealWorktree } from '@/lib/workspace/activation/worktree-activation'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import {
  getGitHubWorkItemWorkspaceSeed,
  getGitLabWorkItemWorkspaceSeed
} from './task-page-source-context'
import { getTaskPageRepoSourceContext } from '../../lib/work-items/task-repo-source-context'
type TaskPageWorkspaceActionsInput = Pick<TaskPageSearchActionsModel, 'repos' | 'openModal'> &
  Partial<Pick<TaskPageSearchActionsModel, 'workbenchScope' | 'repoMap'>>

export function useTaskPageWorkspaceActions<Model extends TaskPageWorkspaceActionsInput>(
  model: Model
) {
  const { repos, openModal, workbenchScope = null, repoMap } = model
  const openComposerForItem = useCallback(
    (item: GitHubWorkItem): void => {
      const linkedWorkItem: LinkedWorkItemSummary = {
        provider: 'github',
        type: item.type,
        number: item.number,
        title: item.title,
        url: item.url,
        ...(item.repoId
          ? {
              repoId: item.repoId
            }
          : {})
      }
      const repo = getWorkItemRepo(repos, item)
      const sourceContext = getTaskPageRepoSourceContext(repo, 'github')
      const scopedAdditions =
        workbenchScope && repoMap
          ? resolveScopedComposerAdditions({
              scope: workbenchScope,
              repoMap: repo ? new Map(repoMap).set(repo.id, repo) : repoMap,
              item: { ...item, provider: 'github' }
            })
          : {}
      openModal('new-workspace-composer', {
        linkedWorkItem,
        initialGitHubWorkItem: item,
        taskSourceContext: sourceContext,
        ...(workbenchScope && sourceContext
          ? {
              initialWorkspaceTarget: {
                projectId: sourceContext.projectId,
                hostId: sourceContext.hostId,
                projectHostSetupId: sourceContext.projectHostSetupId
              }
            }
          : {}),
        prefilledName: getGitHubWorkItemWorkspaceSeed(item),
        initialRepoId: item.repoId,
        enableIssueAutomation: item.type === 'issue',
        telemetrySource: 'sidebar',
        ...scopedAdditions
      })
    },
    [openModal, repos, repoMap, workbenchScope]
  )
  const handleUseWorkItem = useCallback(
    (item: GitHubWorkItem): void => {
      useAppStore.getState().recordFeatureInteraction('github-tasks')
      openComposerForItem(item)
    },
    [openComposerForItem]
  )
  const handleOpenOrUseGitHubWorkItem = useCallback(
    (item: GitHubWorkItem): void => {
      const worktrees = useAppStore.getState().allWorktrees()
      if (workbenchScope && item.type === 'issue') {
        const match = matchScopedTaskWorkspaces({
          scope: workbenchScope,
          worktrees,
          provider: 'github',
          number: item.number,
          sourceContext: getTaskPageRepoSourceContext(getWorkItemRepo(repos, item), 'github'),
          repoId: item.repoId
        })
        if (match) {
          const outcome = dispatchScopedWorktrees({
            candidates: match.candidates,
            choiceTitle: '#' + item.number + ' ' + item.title,
            onUnavailable: notifyScopedWorkspaceUnavailable
          })
          track('bw_task_start', {
            outcome: outcome === 'none' ? 'composer-opened' : outcome,
            source: 'task-screen'
          })
          if (outcome === 'none') {
            handleUseWorkItem(item)
          } else if (outcome === 'opened') {
            useAppStore.getState().recordFeatureInteraction('github-tasks')
          }
          return
        }
      }
      const currentAttached = findGithubWorkItemWorkspaceAttachment(
        worktrees,
        item.repoId,
        item.type,
        item.number,
        item.url
      )
      if (!currentAttached) {
        handleUseWorkItem(item)
        return
      }
      const result = activateAndRevealWorktree(currentAttached.id, {
        navigationIntent: 'user-open'
      })
      if (result === false) {
        toast.error(
          item.type === 'pr'
            ? translate(
                'auto.components.TaskPage.534a9c6017',
                'Unable to open the workspace attached to this pull request.'
              )
            : translate(
                'auto.components.TaskPage.585dba2989',
                'Unable to open the workspace attached to this issue.'
              )
        )
        return
      }
      useAppStore.getState().recordFeatureInteraction('github-tasks')
    },
    [handleUseWorkItem, repos, workbenchScope]
  )
  const openComposerForGitLabItem = useCallback(
    (item: GitLabWorkItem): void => {
      const linkedWorkItem: LinkedWorkItemSummary = {
        provider: 'gitlab',
        type: item.type,
        number: item.number,
        title: item.title,
        url: item.url,
        ...(item.repoId
          ? {
              repoId: item.repoId
            }
          : {})
      }
      openModal('new-workspace-composer', {
        linkedWorkItem,
        taskSourceContext: getTaskPageRepoSourceContext(
          getWorkItemRepo(repos, item),
          'gitlab',
          item.projectRef
        ),
        prefilledName: getGitLabWorkItemWorkspaceSeed(item),
        initialRepoId: item.repoId,
        telemetrySource: 'sidebar'
      })
    },
    [openModal, repos]
  )
  const handleUseGitLabItem = useCallback(
    (item: GitLabWorkItem): void => {
      useAppStore.getState().recordFeatureInteraction('gitlab-tasks')
      openComposerForGitLabItem(item)
    },
    [openComposerForGitLabItem]
  )
  const nextModel = model as typeof model & {
    openComposerForItem: typeof openComposerForItem
    handleUseWorkItem: typeof handleUseWorkItem
    handleOpenOrUseGitHubWorkItem: typeof handleOpenOrUseGitHubWorkItem
    openComposerForGitLabItem: typeof openComposerForGitLabItem
    handleUseGitLabItem: typeof handleUseGitLabItem
  }
  nextModel.openComposerForItem = openComposerForItem
  nextModel.handleUseWorkItem = handleUseWorkItem
  nextModel.handleOpenOrUseGitHubWorkItem = handleOpenOrUseGitHubWorkItem
  nextModel.openComposerForGitLabItem = openComposerForGitLabItem
  nextModel.handleUseGitLabItem = handleUseGitLabItem
  return nextModel
}
export type TaskPageWorkspaceActionsModel = ReturnType<
  typeof useTaskPageWorkspaceActions<TaskPageSearchActionsModel>
>
