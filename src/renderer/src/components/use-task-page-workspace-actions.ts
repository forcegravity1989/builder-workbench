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
  notifyScopedWorkspaceUnavailable,
  resolveScopedComposerAdditions
} from '@/workbench/scoped-task-workspace'
import { dispatchScopedWorktrees } from '@/workbench/version-workspace-choice-state'
import { findCodeHubTaskRepo } from '@/lib/codehub-task-repo'
export function useTaskPageWorkspaceActions(model: TaskPageSearchActionsModel) {
  const { repoMap, openModal } = model
  // G2 (BW)：范围视图的 Issue 开工把版本归属上下文与目标树父级建议带进同一
  // 原生创建器（解析住在 workbench/scoped-task-workspace，原生文件保持薄挂载
  // 并在行数上限内）；无范围时返回空对象，原生预填逐字不变。
  const scopedComposerAdditions = useCallback(
    (item: {
      repoId?: string | null
      type: string
      number: number
      provider: 'github' | 'codehub'
    }) => resolveScopedComposerAdditions({ scope: model.workbenchScope, repoMap, item }),
    [model.workbenchScope, repoMap]
  )
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
        telemetrySource: 'sidebar',
        ...scopedComposerAdditions({
          repoId: item.repoId,
          type: item.type,
          number: item.number,
          provider: 'github'
        })
      })
    },
    [openModal, repoMap, scopedComposerAdditions]
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
      if (model.workbenchScope && item.type === 'issue') {
        const scoped = matchScopedTaskWorkspaces({
          scope: model.workbenchScope,
          worktrees,
          provider: 'github',
          number: item.number,
          sourceContext: getTaskPageRepoSourceContext(repoMap.get(item.repoId), 'github'),
          repoId: item.repoId
        })
        if (scoped) {
          const outcome = dispatchScopedWorktrees({
            candidates: scoped.candidates,
            choiceTitle: `#${item.number} ${item.title}`,
            onUnavailable: notifyScopedWorkspaceUnavailable
          })
          if (outcome === 'opened') {
            useAppStore.getState().recordFeatureInteraction('github-tasks')
            return
          }
          if (outcome !== 'none') {
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
    [handleUseWorkItem, model.workbenchScope, repoMap]
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
      getTaskPageRepoSourceContext(findCodeHubTaskRepo(model.repos, item), 'codehub'),
    [model.repos]
  )
  const openComposerForCodeHubItem = useCallback(
    (item: CodeHubTaskItem): void => {
      if (!item.repoId) {
        return
      }
      const sourceContext = codeHubSourceContextFor(item)
      if (item.executionHostId && !sourceContext) {
        toast.error(
          translate(
            'auto.components.task.project.source.combobox.sourceUnavailable',
            'Selected project source is unavailable'
          )
        )
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
        taskSourceContext: sourceContext,
        prefilledName: getLinkedWorkItemSuggestedName({ title: item.title }),
        initialRepoId: item.repoId,
        enableIssueAutomation: item.type === 'issue',
        telemetrySource: 'sidebar',
        ...scopedComposerAdditions({
          repoId: item.repoId,
          type: item.type === 'mr' ? 'pr' : 'issue',
          number: item.iid,
          provider: 'codehub'
        })
      })
    },
    [codeHubSourceContextFor, openModal, scopedComposerAdditions]
  )
  const handleUseCodeHubItem = useCallback(
    (item: CodeHubTaskItem): void => {
      // G2 (BW)：范围视图的 CodeHub Issue 同样按明确绑定解析；无范围或 MR 行
      // 保持原生语义（直接进创建器）逐字不变。
      if (model.workbenchScope && item.type === 'issue') {
        const scoped = matchScopedTaskWorkspaces({
          scope: model.workbenchScope,
          worktrees: useAppStore.getState().allWorktrees(),
          provider: 'codehub',
          number: item.iid,
          sourceContext: codeHubSourceContextFor(item),
          repoId: item.repoId
        })
        if (scoped) {
          const outcome = dispatchScopedWorktrees({
            candidates: scoped.candidates,
            choiceTitle: `#${item.iid} ${item.title}`,
            onUnavailable: notifyScopedWorkspaceUnavailable
          })
          if (outcome !== 'none') {
            return
          }
        }
      }
      openComposerForCodeHubItem(item)
    },
    [codeHubSourceContextFor, model.workbenchScope, openComposerForCodeHubItem]
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
