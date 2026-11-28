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
  | { kind: 'choose-issue'; items: LinkedTreeIssue[] }
  | { kind: 'manual' }

export function linkedTreeIssueKey(item: LinkedTreeIssue): string {
  return [item.provider, item.repoId ?? '', String(item.number), item.url ?? ''].join(':')
}

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

function asLinkedTreeIssue(item: {
  provider: 'github' | 'codehub'
  number: number
  title?: string
  url?: string
  repoId?: string
}): LinkedTreeIssue {
  return {
    provider: item.provider,
    type: 'issue',
    number: item.number,
    ...(item.title ? { title: item.title } : {}),
    ...(item.url ? { url: item.url } : {}),
    ...(item.repoId ? { repoId: item.repoId } : {})
  }
}

function isBindableIssue(item: {
  provider: string
  type: string
  number: number
}): item is {
  provider: 'github' | 'codehub'
  type: 'issue'
  number: number
  title?: string
  url?: string
  repoId?: string
} {
  return (
    (item.provider === 'github' || item.provider === 'codehub') &&
    item.type === 'issue' &&
    Number.isInteger(item.number) &&
    item.number > 0
  )
}

export function treeBindMode(tree: Worktree): TreeBindMode {
  const parsed = parseVersionFlowBranch(tree.branch)
  if (parsed) {
    return { kind: 'flow', workflow: parsed.workflow }
  }
  const selected = tree.linkedWorkItem
  if (selected && isBindableIssue(selected)) {
    return { kind: 'linked-issue', item: asLinkedTreeIssue(selected) }
  }
  const issues: LinkedTreeIssue[] = []
  const seen = new Set<string>()
  for (const item of getWorkspaceAttachments(tree)) {
    if (!isBindableIssue(item)) {
      continue
    }
    const linked = asLinkedTreeIssue(item)
    const key = linkedTreeIssueKey(linked)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    issues.push(linked)
  }
  const only = issues[0]
  if (issues.length === 1 && only) {
    return { kind: 'linked-issue', item: only }
  }
  if (issues.length > 1) {
    return { kind: 'choose-issue', items: issues }
  }
  return { kind: 'manual' }
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
