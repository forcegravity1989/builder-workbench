import { readVersionMembership } from './version-cycle/version-membership'
import type { Worktree } from '../../../shared/worktree/types'
import { branchName } from '@/lib/git-utils'
import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import { compareVersionDisplayOrder } from '../../../shared/workbench/version-catalog'
import { findVersionFlowWorktrees } from '../../../shared/workbench/version-workspace-match'
import {
  PlanningMaterialSchema,
  AcceptanceMaterialSchema,
  type PlanningMaterial,
  type AcceptanceMaterial
} from '../../../shared/workbench/version-material'
import { loadVersionCatalog } from './version-catalog-load'
import { versionCatalogPlanTrees } from './version-catalog-plan-trees'
import {
  nativeWorkspaceScope,
  nativeWorkspaceScopeKey,
  type NativeWorkspaceScope
} from './version-cycle/native-workspace'
import { cycleBranch } from './version-cycle/native-cycle-workspace'
import { nativeVersionMaterialPort } from './version-material-port'
import { nativeVersionHistoryPort } from './version-history-port'
import { nativeArchivePrPort } from './archive-pr-port'
import { nativeTaskPort } from './native-task-port'
import {
  wallTaskCounts,
  type WallArchiveReading,
  type WallCardReadings
} from './wall-card-readings'
import type { WallProject } from './workbench-wall-projects'
import { wallProjectVersionRows } from './workbench-wall-projects'

export async function selectWallVersion(project: WallProject, worktrees: Worktree[]) {
  if (project.rows[0].kind === 'folder') {
    return { kind: 'empty' } as const
  }
  const home = worktrees.find((tree) => tree.isMainWorktree) ?? worktrees[0]
  if (!home) {
    return { kind: 'unknown', reason: '工作区尚未就绪' } as const
  }
  try {
    const scope = nativeWorkspaceScope(home)
    const planTrees = versionCatalogPlanTrees(worktrees)
    const repoIds = wallProjectVersionRows(project).map((row) => row.id)
    const catalog = await loadVersionCatalog({
      scope,
      homeWorktreeId: home.id,
      homeInstanceId: home.instanceId,
      planTrees,
      worktrees,
      repoIds,
      projectId: scope.projectId
    })
    const entry = [...catalog.entries].sort(compareVersionDisplayOrder)[0]
    if (!entry) {
      if (catalog.history?.error || catalog.problems.length) {
        return {
          kind: 'unknown',
          reason: catalog.history?.error ?? catalog.problems[0].message
        } as const
      }
      return { kind: 'empty' } as const
    }
    return { kind: 'version', entry, catalog, scope, home, planTrees, repoIds, worktrees } as const
  } catch (error) {
    return {
      kind: 'unknown',
      reason: error instanceof Error ? error.message : String(error)
    } as const
  }
}

export type WallVersionSelection = Awaited<ReturnType<typeof selectWallVersion>>

/** Read progress through the existing material/provider ports only on the wall. */
export async function readWallReadings(
  selection: WallVersionSelection,
  force: boolean
): Promise<WallCardReadings> {
  if (selection.kind !== 'version') {
    return selection
  }
  const { entry, catalog, scope, home, planTrees, repoIds, worktrees } = selection
  try {
    const readFlow = async (
      workflow: 'plan' | 'acceptance'
    ): Promise<{
      document: PlanningMaterial | AcceptanceMaterial | null
      archive: WallArchiveReading
      owner: NativeWorkspaceScope | null
    }> => {
      try {
        const bound = findVersionFlowWorktrees(worktrees, { version: entry.version, workflow })
        const trees = bound.length
          ? bound
          : worktrees.filter(
              (tree) =>
                !tree.isArchived &&
                !normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding) &&
                branchName(tree.branch) === cycleBranch({ workflow })
            )
        if (trees.length > 1) {
          throw new Error('有多个流程工作区，请进入项目核对来源')
        }
        const tree = trees[0]
        if (!tree && (!catalog.history?.ready || catalog.history.error)) {
          throw new Error(catalog.history?.error ?? '尚未读到主干材料')
        }
        const owner = tree ? nativeWorkspaceScope(tree) : scope
        const readScope = {
          repoId: owner.repoId,
          worktreeId: tree?.id ?? home.id,
          hostId: owner.hostId
        }
        const reference = entry.material[workflow]
        // A live flow reads its current file, exactly like the plan/acceptance screen.
        // Only a retired flow falls back to the committed record; acceptance never substitutes its pinned plan here.
        const snapshot = tree
          ? await nativeVersionMaterialPort(
              { ...readScope, workflow },
              owner.runtimeOwnerEnvironmentId
            ).read(entry.version)
          : reference
            ? await nativeVersionHistoryPort(owner.runtimeOwnerEnvironmentId).read({
                scope: readScope,
                source: 'trunk',
                sourceCommit: reference.sourceCommit,
                version: entry.version,
                cycleId: reference.cycleId,
                workflow
              })
            : null
        const document = snapshot
          ? (workflow === 'plan' ? PlanningMaterialSchema : AcceptanceMaterialSchema).parse(
              snapshot.document
            )
          : null
        const pr = document?.workflow?.archivePr
        let archive: WallArchiveReading = { kind: 'missing' }
        if (pr) {
          try {
            archive = {
              kind: 'status',
              status: await nativeArchivePrPort(owner.runtimeOwnerEnvironmentId).readStatus(
                readScope,
                pr,
                force
              )
            }
          } catch (error) {
            archive = { kind: 'status', status: { state: 'unknown', reason: String(error) } }
          }
        }
        return {
          document,
          archive,
          owner
        }
      } catch (error) {
        return {
          document: null,
          owner: null,
          archive: {
            kind: 'status',
            status: {
              state: 'unknown',
              reason: error instanceof Error ? error.message : String(error)
            }
          }
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
    const readingHome =
      worktrees.find(
        (tree) =>
          tree.isMainWorktree &&
          tree.repoId === readingScope.repoId &&
          nativeWorkspaceScopeKey(nativeWorkspaceScope(tree)) ===
            nativeWorkspaceScopeKey(readingScope)
      ) ?? home
    return {
      kind: 'version',
      version: entry.version,
      goals: plan?.goals.map((goal) => goal.title) ?? [],
      plan: planning.archive,
      acceptance: acceptance.archive,
      tasks: tasks ? wallTaskCounts(tasks) : null,
      catalog: {
        scope: readingScope,
        home: readingHome,
        worktrees,
        repoIds,
        planTrees,
        catalog,
        loading: false,
        error: null,
        materialReady: catalog.history?.ready ?? false,
        materialError: catalog.history?.error ?? null,
        reload: () => {}
      }
    }
  } catch (error) {
    return { kind: 'unknown', reason: error instanceof Error ? error.message : String(error) }
  }
}
