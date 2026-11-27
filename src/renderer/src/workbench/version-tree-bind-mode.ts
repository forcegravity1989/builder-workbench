import { branchName } from '@/lib/source-control/branches/branch-name'
import type { Worktree, WorkspaceLinkedItem } from '../../../shared/worktree/types'
import { validatePlanningVersion } from '../../../shared/workbench/version-document'
import {
  versionFlowBranch,
  type VersionFlowWorkflow
} from '../../../shared/workbench/version-workspace-prepare'

export type BindWorkflow = 'plan' | 'acceptance' | 'goal' | 'issue'

export type TreeBindMode =
  | { kind: 'flow'; workflow: VersionFlowWorkflow }
  | {
      kind: 'linked-issue'
      item: WorkspaceLinkedItem & { type: 'issue'; provider: 'github' | 'codehub' }
    }
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
  const linked = tree.linkedWorkItem
  if (linked?.type !== 'issue') {
    return { kind: 'manual' }
  }
  const provider = linked.provider
  if (provider !== 'github' && provider !== 'codehub') {
    return { kind: 'manual' }
  }
  return {
    kind: 'linked-issue',
    item: { ...linked, type: 'issue', provider }
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
