import { z } from 'zod'
import type { Worktree } from '../worktree/types'
import { Id, MaterialVersion } from './version-material-common'
import {
  legacyFlowBranch,
  versionFlowBranch,
  versionFlowTreeName
} from './version-workspace-prepare'

export const FixedWorkspaceEnsureSchema = z
  .strictObject({
    repoId: Id,
    hostId: Id,
    kind: z.enum(['project', 'metrics', 'plan', 'acceptance']),
    version: MaterialVersion.optional(),
    setupDecision: z.enum(['skip', 'inherit']).default('inherit')
  })
  .superRefine((request, ctx) => {
    if (request.version && (request.kind === 'project' || request.kind === 'metrics')) {
      ctx.addIssue({ code: 'custom', message: 'Project and metrics workspaces have no version' })
    }
  })

export type FixedWorkspaceEnsureRequest = z.input<typeof FixedWorkspaceEnsureSchema>
export type FixedWorkspaceEnsureResult = { worktree: Worktree; state: 'created' | 'existing' }

export function fixedWorkspaceDefinition(
  request: Pick<FixedWorkspaceEnsureRequest, 'kind' | 'version'>
) {
  if (request.kind === 'project') {
    return { branch: 'bw/project', name: 'project' }
  }
  if (request.kind === 'metrics') {
    return { branch: 'bw/metrics-refresh', name: 'metrics-refresh' }
  }
  if (request.version) {
    const branch = versionFlowBranch(request.version, request.kind)
    if (!branch) {
      throw new Error('版本名不能组成合法的流程分支名')
    }
    return { branch, name: versionFlowTreeName(request.version, request.kind) }
  }
  return {
    branch: legacyFlowBranch(request.kind),
    name: request.kind === 'plan' ? 'week-plan' : 'week-acceptance'
  }
}

export function fixedWorkspaceRequestForBranch(
  branch: string
): Pick<FixedWorkspaceEnsureRequest, 'kind' | 'version'> {
  if (branch === 'bw/project') {
    return { kind: 'project' }
  }
  if (branch === 'bw/metrics-refresh') {
    return { kind: 'metrics' }
  }
  if (branch === legacyFlowBranch('plan')) {
    return { kind: 'plan' }
  }
  if (branch === legacyFlowBranch('acceptance')) {
    return { kind: 'acceptance' }
  }
  const match = /^bw\/([^/]+)\/(plan|acceptance)$/.exec(branch)
  if (match) {
    return { kind: match[2] as 'plan' | 'acceptance', version: match[1] }
  }
  throw new Error(`不支持的固定工作区分支：${branch}`)
}
