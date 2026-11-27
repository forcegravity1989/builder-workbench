import { branchName } from '@/lib/source-control/branches/branch-name'
import type { Worktree } from '../../../shared/worktree/types'
import { getWorkspaceAttachments } from '../../../shared/workspace-attachments/workspace-attachments'
import { validatePlanningVersion } from '../../../shared/workbench/version-document'
import {
  versionFlowBranch,
  type VersionFlowWorkflow
} from '../../../shared/workbench/version-workspace-prepare'

export type BindWorkflow = 'plan' | 'acceptance' | 'goal' | 'issue'

export type LinkedTreeIssue = {
  provider: 'github' | 'codehub'
  type: 'issue'
  number: number
  title?: string
  url?: string
  repoId?: string
}

export type TreeBindMode =
  | { kind: 'flow'; workflow: VersionFlowWorkflow }
  | { kind: 'linked-issue'; item: LinkedTreeIssue }
  | { kind: 'manual' }

const FLOW_BRANCH = /^bw\/([^/]+)\/(plan|acceptance)$/

/** 流程树分支 `bw/<版本>/plan|acceptance`。对不上就不是流程树，不拿分支名猜版本归属。 */
export function parseVersionFlowBranch(
  branch: string | null | undefined
): { version: string; workflow: VersionFlowWorkflow } | null {
  if (!branch) {
    return null
  }
  const name = branchName(branch)
  const match = FLOW_BRANCH.exec(name)
  const version = match?.[1]
  const workflow = match?.[2]
  if (!version || (workflow !== 'plan' && workflow !== 'acceptance')) {
    return null
  }
  try {
    validatePlanningVersion(version)
  } catch {
    return null
  }
  return versionFlowBranch(version, workflow) === name ? { version, workflow } : null
}

export function treeBindMode(tree: Worktree): TreeBindMode {
  const parsed = parseVersionFlowBranch(tree.branch)
  if (parsed) {
    return { kind: 'flow', workflow: parsed.workflow }
  }
  const linked = getWorkspaceAttachments(tree).find(
    (item) =>
      (item.provider === 'github' || item.provider === 'codehub') &&
      item.type === 'issue' &&
      item.number > 0
  )
  if (!linked || (linked.provider !== 'github' && linked.provider !== 'codehub')) {
    return { kind: 'manual' }
  }
  return {
    kind: 'linked-issue',
    item: {
      provider: linked.provider,
      type: 'issue',
      number: linked.number,
      ...(linked.title ? { title: linked.title } : {}),
      ...(linked.url ? { url: linked.url } : {}),
      ...(linked.repoId ? { repoId: linked.repoId } : {})
    }
  }
}

export function suggestedBindWorkflow(tree: Worktree, version: string): BindWorkflow | null {
  const branch = tree.branch ? branchName(tree.branch) : null
  if (branch && branch === versionFlowBranch(version, 'plan')) {
    return 'plan'
  }
  if (branch && branch === versionFlowBranch(version, 'acceptance')) {
    return 'acceptance'
  }
  return null
}
