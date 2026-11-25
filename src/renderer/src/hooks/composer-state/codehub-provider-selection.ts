import type { ComposerModel } from './composer-model'

type CodeHubProviderSelectionInput = Pick<
  ComposerModel,
  | 'branchAutoNameRef'
  | 'lastAutoNameRef'
  | 'name'
  | 'selectedRepoCodeHubSourceContext'
  | 'smartSourceSelectionRef'
  | 'setBaseBranch'
  | 'setBranchNameOverride'
  | 'setBranchNameOverridePreservesNameEdits'
  | 'setCompareBaseRef'
  | 'setForkPushWarning'
  | 'setLinkedGitLabIssue'
  | 'setLinkedGitLabMR'
  | 'setLinkedIssue'
  | 'setLinkedPR'
  | 'setLinkedTaskSourceContext'
  | 'setLinkedWorkItem'
  | 'setName'
  | 'setPushTarget'
>

import { useCallback } from 'react'
import type { CodeHubTaskItem } from '../../../../shared/codehub-tasks'
import type { TaskSourceContext } from '../../../../shared/work-items/task-source-context'
import {
  getLinkedWorkItemSuggestedName,
  getLinkedWorkItemWorkspaceName
} from '../../../../shared/workspace/naming/workspace-name'
import type { LinkedWorkItemSummary } from '@/lib/workspace/creation/new-workspace'
import { shouldApplyWorkspaceSourceAutoName } from '../../../../shared/new-workspace/workspace-source'

// Why: CodeHub links an issue through the generic linkedWorkItem + task-source
// context only — GitHub's linkedIssue/linkedPR and PR base resolution stay untouched.
export function useCodeHubProviderSelection(input: CodeHubProviderSelectionInput) {
  const {
    branchAutoNameRef,
    lastAutoNameRef,
    name,
    selectedRepoCodeHubSourceContext,
    smartSourceSelectionRef,
    setBaseBranch,
    setBranchNameOverride,
    setBranchNameOverridePreservesNameEdits,
    setCompareBaseRef,
    setForkPushWarning,
    setLinkedGitLabIssue,
    setLinkedGitLabMR,
    setLinkedIssue,
    setLinkedPR,
    setLinkedTaskSourceContext,
    setLinkedWorkItem,
    setName,
    setPushTarget
  } = input

  const handleSmartCodeHubIssueSelect = useCallback(
    (item: CodeHubTaskItem, sourceContext: TaskSourceContext | null): void => {
      // Why: invalidate any in-flight GitHub PR start-point resolution so a late
      // result cannot overwrite this CodeHub selection's context/base branch.
      smartSourceSelectionRef.current = null
      const linkedItem: LinkedWorkItemSummary = {
        type: 'issue',
        provider: 'codehub',
        number: item.iid,
        title: item.title,
        url: item.url,
        ...(item.repoId ? { repoId: item.repoId } : {})
      }
      setLinkedIssue('')
      setLinkedPR(null)
      setLinkedGitLabIssue(null)
      setLinkedGitLabMR(null)
      setBaseBranch(undefined)
      setCompareBaseRef(undefined)
      setPushTarget(undefined)
      setBranchNameOverride(undefined)
      setBranchNameOverridePreservesNameEdits(false)
      setForkPushWarning(null)
      branchAutoNameRef.current = ''
      setLinkedWorkItem(linkedItem)
      setLinkedTaskSourceContext(sourceContext ?? selectedRepoCodeHubSourceContext)
      const suggestedName =
        getLinkedWorkItemWorkspaceName(linkedItem)?.seedName ??
        getLinkedWorkItemSuggestedName(linkedItem)
      if (
        suggestedName &&
        shouldApplyWorkspaceSourceAutoName({
          currentName: name,
          lastAutoName: lastAutoNameRef.current
        })
      ) {
        setName(suggestedName)
        lastAutoNameRef.current = suggestedName
      }
    },
    [
      branchAutoNameRef,
      lastAutoNameRef,
      name,
      selectedRepoCodeHubSourceContext,
      smartSourceSelectionRef,
      setBaseBranch,
      setBranchNameOverride,
      setBranchNameOverridePreservesNameEdits,
      setCompareBaseRef,
      setForkPushWarning,
      setLinkedGitLabIssue,
      setLinkedGitLabMR,
      setLinkedIssue,
      setLinkedPR,
      setLinkedTaskSourceContext,
      setLinkedWorkItem,
      setName,
      setPushTarget
    ]
  )

  return { handleSmartCodeHubIssueSelect }
}
