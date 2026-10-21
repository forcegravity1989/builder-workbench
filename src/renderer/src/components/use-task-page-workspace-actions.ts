import type { TaskPageSearchActionsModel } from './use-task-page-search-actions'
import { useCallback } from 'react'
import type { GitHubWorkItem } from '../../../shared/github/work-item-types'
import type { GitLabWorkItem } from '../../../shared/gitlab-types'
import type { LinkedWorkItemSummary } from '@/lib/new-workspace'
import { useAppStore } from '@/store'
import { findGithubWorkItemWorkspaceAttachment } from '@/lib/github-work-item-workspace-attachment'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import {
  getGitHubWorkItemWorkspaceSeed,
  getGitLabWorkItemWorkspaceSeed,
  getTaskPageRepoSourceContext
} from './task-page-source-context'
import type { CodeHubTaskItem } from '../../../shared/codehub-tasks'
import { getLinkedWorkItemSuggestedName } from '../../../shared/workspace-name'
import {
  matchScopedTaskWorkspaces,
  codeHubTaskSourceContext
} from '@/workbench/scoped-task-workspace'
import { openWorkbenchWorkspaceChoice } from '@/workbench/version-workspace-choice-state'
export function useTaskPageWorkspaceActions(model: TaskPageSearchActionsModel) {
  const { repoMap, openModal } = model
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
      openModal('new-workspace-composer', {
        linkedWorkItem,
        initialGitHubWorkItem: item,
        taskSourceContext: getTaskPageRepoSourceContext(repoMap.get(item.repoId), 'github'),
        prefilledName: getGitHubWorkItemWorkspaceSeed(item),
        initialRepoId: item.repoId,
        enableIssueAutomation: item.type === 'issue',
        telemetrySource: 'sidebar'
      })
    },
    [openModal, repoMap]
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
      // G2 (BW)：范围视图的 Issue 按明确版本绑定解析——唯一 → 直开；多候选 →
      // 选择器（绝不取数组第一棵）；无 → Start。PR 行与无范围视图保持原生
      // 「首个未归档树」语义逐字不变。
      if (model.workbenchScopeActive && item.type === 'issue') {
        const scoped = matchScopedTaskWorkspaces({
          scope: model.workbenchScope,
          worktrees,
          provider: 'github',
          number: item.number,
          sourceContext: getTaskPageRepoSourceContext(repoMap.get(item.repoId), 'github')
        })
        if (scoped) {
          if (scoped.kind === 'unique') {
            const opened = activateAndRevealWorktree(scoped.candidates[0].id)
            if (opened === false) {
              toast.error('无法打开本版绑定的工作区，请在原生项目工作区中核对。')
              return
            }
            useAppStore.getState().recordFeatureInteraction('github-tasks')
            return
          }
          if (scoped.kind === 'choice') {
            openWorkbenchWorkspaceChoice({
              title: `#${item.number} ${item.title}`,
              candidates: [...scoped.candidates]
            })
            return
          }
          handleUseWorkItem(item)
          return
        }
      }
      const currentAttached = findGithubWorkItemWorkspaceAttachment(
        worktrees,
        item.repoId,
        item.type,
        item.number
      )
      if (!currentAttached) {
        handleUseWorkItem(item)
        return
      }
      const result = activateAndRevealWorktree(currentAttached.id)
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
    [handleUseWorkItem, model.workbenchScope, model.workbenchScopeActive, repoMap]
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
          repoMap.get(item.repoId),
          'gitlab',
          item.projectRef
        ),
        prefilledName: getGitLabWorkItemWorkspaceSeed(item),
        initialRepoId: item.repoId,
        telemetrySource: 'sidebar'
      })
    },
    [openModal, repoMap]
  )
  const handleUseGitLabItem = useCallback(
    (item: GitLabWorkItem): void => {
      useAppStore.getState().recordFeatureInteraction('gitlab-tasks')
      openComposerForGitLabItem(item)
    },
    [openComposerForGitLabItem]
  )
  const codeHubSourceContextFor = useCallback(
    (item: CodeHubTaskItem) =>
      codeHubTaskSourceContext(item.repoId ? repoMap.get(item.repoId) : null, item),
    [repoMap]
  )
  const openComposerForCodeHubItem = useCallback(
    (item: CodeHubTaskItem): void => {
      if (!item.repoId) {
        return
      }
      const linkedWorkItem: LinkedWorkItemSummary = {
        provider: 'codehub',
        type: item.type === 'mr' ? 'mr' : 'issue',
        number: item.iid,
        title: item.title,
        url: item.url,
        repoId: item.repoId
      }
      openModal('new-workspace-composer', {
        linkedWorkItem,
        taskSourceContext: codeHubSourceContextFor(item),
        prefilledName: getLinkedWorkItemSuggestedName({ title: item.title }),
        initialRepoId: item.repoId,
        enableIssueAutomation: item.type === 'issue',
        telemetrySource: 'sidebar'
      })
    },
    [codeHubSourceContextFor, openModal]
  )
  const handleUseCodeHubItem = useCallback(
    (item: CodeHubTaskItem): void => {
      // G2 (BW)：范围视图的 CodeHub Issue 同样按明确绑定解析；无范围或 MR 行
      // 保持原生语义（直接进创建器）逐字不变。
      if (model.workbenchScopeActive && item.type === 'issue') {
        const scoped = matchScopedTaskWorkspaces({
          scope: model.workbenchScope,
          worktrees: useAppStore.getState().allWorktrees(),
          provider: 'codehub',
          number: item.iid,
          sourceContext: codeHubSourceContextFor(item)
        })
        if (scoped && scoped.kind === 'unique') {
          const opened = activateAndRevealWorktree(scoped.candidates[0].id)
          if (opened === false) {
            toast.error('无法打开本版绑定的工作区，请在原生项目工作区中核对。')
          }
          return
        }
        if (scoped && scoped.kind === 'choice') {
          openWorkbenchWorkspaceChoice({
            title: `#${item.iid} ${item.title}`,
            candidates: [...scoped.candidates]
          })
          return
        }
      }
      openComposerForCodeHubItem(item)
    },
    [
      codeHubSourceContextFor,
      model.workbenchScope,
      model.workbenchScopeActive,
      openComposerForCodeHubItem
    ]
  )
  const nextModel = model as typeof model & {
    openComposerForItem: typeof openComposerForItem
    handleUseWorkItem: typeof handleUseWorkItem
    handleOpenOrUseGitHubWorkItem: typeof handleOpenOrUseGitHubWorkItem
    openComposerForGitLabItem: typeof openComposerForGitLabItem
    handleUseGitLabItem: typeof handleUseGitLabItem
    openComposerForCodeHubItem: typeof openComposerForCodeHubItem
    handleUseCodeHubItem: typeof handleUseCodeHubItem
  }
  nextModel.openComposerForItem = openComposerForItem
  nextModel.handleUseWorkItem = handleUseWorkItem
  nextModel.handleOpenOrUseGitHubWorkItem = handleOpenOrUseGitHubWorkItem
  nextModel.openComposerForGitLabItem = openComposerForGitLabItem
  nextModel.handleUseGitLabItem = handleUseGitLabItem
  nextModel.openComposerForCodeHubItem = openComposerForCodeHubItem
  nextModel.handleUseCodeHubItem = handleUseCodeHubItem
  return nextModel
}
export type TaskPageWorkspaceActionsModel = ReturnType<typeof useTaskPageWorkspaceActions>
