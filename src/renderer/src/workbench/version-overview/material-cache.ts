import type { VersionOverviewMaterials } from '../version-overview-materials'
import type { Worktree } from '../../../../shared/worktree/types'
import type { VersionCatalogPlanTree } from '../version-catalog-load'
import { normalizeStoredWorkbenchVersionBinding } from '../../../../shared/workbench/version-binding'

/** Unbound task discovery cannot invalidate a version's plan/acceptance read. */
export function materialSourceInputs(
  trees: readonly Pick<
    Worktree,
    | 'id'
    | 'repoId'
    | 'hostId'
    | 'runtimeOwnerEnvironmentId'
    | 'workbenchVersionBinding'
    | 'isArchived'
  >[],
  planTrees: readonly VersionCatalogPlanTree[],
  version: string,
  formal: boolean
) {
  const workflows = trees.flatMap((tree) => {
    const binding = normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding)
    return !tree.isArchived &&
      binding?.version === version &&
      ['plan', 'acceptance'].includes(binding.workflow)
      ? [[tree.id, tree.repoId, tree.hostId, tree.runtimeOwnerEnvironmentId, binding]]
      : []
  })
  const plans = formal
    ? []
    : planTrees.filter((tree) => tree.version === version || tree.version === null)
  return JSON.stringify([
    plans.map((tree) => JSON.stringify(tree)).sort(),
    workflows.map((tree) => JSON.stringify(tree)).sort()
  ])
}

/** Keep a failed refresh's material pair together; PR facts belong to their recorded reference. */
export function retainMaterialRead(
  value: VersionOverviewMaterials,
  previous?: VersionOverviewMaterials
): VersionOverviewMaterials {
  const errors = [value.plan, value.acceptance].flatMap((doc) =>
    doc.kind === 'error' ? [doc.message] : []
  )
  const keepMaterials = Boolean(
    errors.length &&
    previous &&
    ((!previous.problems?.length && !previous.refreshing) || previous.stale) &&
    [previous.plan, previous.acceptance].every(
      (doc) => doc.kind === 'ready' || doc.kind === 'missing'
    )
  )
  let retained = keepMaterials
  let pending = false
  value = keepMaterials ? { ...previous! } : { ...value }
  value.prStatuses = { ...value.prStatuses }
  for (const kind of ['plan', 'acceptance'] as const) {
    const status = value.prStatuses[kind]
    const document = value[kind]
    pending ||=
      document.kind === 'ready' && Boolean(document.document.workflow?.archivePr) && status === null
    if (status?.state === 'unknown') {
      errors.push(status.reason)
    }
    const prior = previous?.[kind]
    const reference = document.kind === 'ready' ? document.document.workflow?.archivePr : null
    const priorReference = prior?.kind === 'ready' ? prior.document.workflow?.archivePr : null
    const priorStatus = previous?.prStatuses[kind]
    if (
      !keepMaterials &&
      status?.state === 'unknown' &&
      priorStatus &&
      priorStatus.state !== 'unknown' &&
      reference &&
      priorReference &&
      reference.provider === priorReference.provider &&
      reference.repository === priorReference.repository &&
      reference.number === priorReference.number
    ) {
      value.prStatuses[kind] = priorStatus
      retained = true
    }
  }
  const acceptanceStatus = value.prStatuses.acceptance
  if (
    value.acceptance.kind === 'ready' &&
    acceptanceStatus?.state === 'merged' &&
    acceptanceStatus.mergedAt
  ) {
    value = { ...value, acceptance: { ...value.acceptance, acceptedAt: acceptanceStatus.mergedAt } }
  }
  return {
    ...value,
    readAt: retained ? previous?.readAt : new Date().toISOString(),
    problems: [...new Set(errors)],
    stale: Boolean(retained && previous?.readAt),
    refreshing: pending
  }
}

export const materialReadMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error)
  try {
    const issues = JSON.parse(raw)
    if (Array.isArray(issues) && issues.some((issue) => typeof issue?.code === 'string')) {
      return '材料结构无效，请通过对应计划或验收入口核对来源。'
    }
  } catch {
    // Non-schema failures retain the native source's explanation.
  }
  return raw
}
