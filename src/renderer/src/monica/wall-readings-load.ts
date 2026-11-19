import { readVersionMembership } from './version-cycle/version-membership'
import { findVersionFlowWorktrees } from '../../../shared/monica/version-workspace-match'
import {
  PlanningMaterialSchema,
  AcceptanceMaterialSchema,
  type PlanningMaterial,
  type AcceptanceMaterial
} from '../../../shared/monica/version-material'
import { nativeWorkspaceScope, type NativeWorkspaceScope } from './version-cycle/native-workspace'
import { nativeVersionMaterialPort } from './version-material-port'
import { nativeVersionHistoryPort } from './version-history-port'
import { nativeArchivePrPort } from './archive-pr-port'
import type { ArchivePrStatusResult } from '../../../shared/monica/archive-pr-status'
import { nativeTaskPort } from './native-task-port'
import { wallTaskCounts, type WallCardReadings } from './wall-card-readings'
import { versionWorkflowProgress, type VersionWorkflowProgress } from './version-workflow-progress'
import type { VersionCatalogState } from './use-version-catalog'

/** Wall-only progress reads use the same catalog and owner as the sidebar. */
export async function readWallReadings(
  state: VersionCatalogState,
  version: string,
  force: boolean
): Promise<WallCardReadings> {
  const { catalog, scope, home, worktrees } = state
  const entry = catalog?.entries.find((candidate) => candidate.version === version)
  const error = state.error ?? state.materialError ?? catalog?.problems[0]?.message
  if (!entry) {
    if (state.loading) {
      return { kind: 'loading' }
    }
    if (error || !state.materialReady) {
      return { kind: 'unknown', reason: error ?? '版本目录尚未就绪' }
    }
    return { kind: 'empty' }
  }
  if (!scope || !home || state.error) {
    const progress = versionWorkflowProgress(
      { kind: 'error', message: error ?? '项目来源尚未就绪' },
      null
    )
    return {
      kind: 'version',
      version: entry.version,
      goals: entry.goals.map((goal) => goal.title),
      plan: progress,
      acceptance: progress,
      tasks: null,
      catalog: state
    }
  }
  try {
    const readFlow = async (
      workflow: 'plan' | 'acceptance'
    ): Promise<{
      document: PlanningMaterial | AcceptanceMaterial | null
      progress: VersionWorkflowProgress
      owner: NativeWorkspaceScope | null
    }> => {
      try {
        const trees = findVersionFlowWorktrees(worktrees, { version: entry.version, workflow })
        if (trees.length > 1) {
          throw new Error('有多个流程工作区，请进入项目核对来源')
        }
        const tree = trees[0]
        const homeScope = { repoId: scope.repoId, worktreeId: home.id, hostId: scope.hostId }
        const treeOwner = tree ? nativeWorkspaceScope(tree) : scope
        const treeScope = tree
          ? { repoId: treeOwner.repoId, worktreeId: tree.id, hostId: treeOwner.hostId }
          : homeScope
        const reference = entry.material[workflow]
        const draft = tree
          ? await nativeVersionMaterialPort(
              { ...treeScope, workflow },
              treeOwner.runtimeOwnerEnvironmentId
            ).read(entry.version)
          : null
        const readCommitted = !tree
        if (readCommitted && (!state.materialReady || state.materialError)) {
          throw new Error(state.materialError ?? '尚未读到主干材料')
        }
        const problem = entry.problems.find((item) => item.workflow === workflow)
        if (readCommitted && !reference && problem) {
          throw new Error(problem.message)
        }
        const snapshot =
          readCommitted && reference
            ? await nativeVersionHistoryPort(scope.runtimeOwnerEnvironmentId).read({
                scope: homeScope,
                source: 'trunk',
                sourceCommit: reference.sourceCommit,
                version: entry.version,
                cycleId: reference.cycleId,
                workflow
              })
            : draft
        const owner = readCommitted ? scope : treeOwner
        const readScope = readCommitted ? homeScope : treeScope
        const document = snapshot
          ? (workflow === 'plan' ? PlanningMaterialSchema : AcceptanceMaterialSchema).parse(
              snapshot.document
            )
          : null
        const pr = document?.workflow?.archivePr
        let status: ArchivePrStatusResult | null = null
        if (pr) {
          try {
            status = await nativeArchivePrPort(owner.runtimeOwnerEnvironmentId).readStatus(
              readScope,
              pr,
              force
            )
          } catch (error) {
            status = { state: 'unknown', reason: String(error) }
          }
        }
        return {
          document,
          progress: versionWorkflowProgress(
            document
              ? { kind: 'ready', document, source: readCommitted ? 'committed' : 'draft' }
              : { kind: 'missing' },
            status
          ),
          owner
        }
      } catch (error) {
        return {
          document: null,
          owner: null,
          progress: versionWorkflowProgress(
            { kind: 'error', message: error instanceof Error ? error.message : String(error) },
            null
          )
        }
      }
    }
    const [planning, acceptance] = await Promise.all([readFlow('plan'), readFlow('acceptance')])
    const plan = planning.document as PlanningMaterial | null
    const readingScope = planning.owner ?? scope
    const taskScope = { ...readingScope, workflow: 'plan' as const }
    const tasks =
      plan && planning.owner
        ? await readVersionMembership(taskScope, plan, force)
            .then((references) =>
              force
                ? nativeTaskPort().refresh(taskScope, references)
                : nativeTaskPort().listVersion(taskScope, references)
            )
            .catch(() => null)
        : null
    return {
      kind: 'version',
      version: entry.version,
      goals: plan?.goals.map((goal) => goal.title) ?? entry.goals.map((goal) => goal.title),
      plan: planning.progress,
      acceptance: acceptance.progress,
      tasks: tasks ? wallTaskCounts(tasks) : null,
      catalog: state
    }
  } catch (error) {
    return { kind: 'unknown', reason: error instanceof Error ? error.message : String(error) }
  }
}
