import type { VersionOverviewMaterials } from '../version-overview-materials'

export const materialCache = new Map<string, VersionOverviewMaterials>()
export const materialGenerations = new Map<string, number>()

/** Only a value from the exact same owner and material revision may survive a failed refresh. */
export function retainMaterialRead(
  value: VersionOverviewMaterials,
  previous?: VersionOverviewMaterials
): VersionOverviewMaterials {
  const errors = [value.plan, value.acceptance].flatMap((doc) =>
    doc.kind === 'error' ? [doc.message] : []
  )
  let pending = false
  value = { ...value, prStatuses: { ...value.prStatuses } }
  for (const kind of ['plan', 'acceptance'] as const) {
    const status = value.prStatuses[kind]
    const document = value[kind]
    pending ||=
      document.kind === 'ready' && Boolean(document.document.workflow?.archivePr) && status === null
    if (status?.state === 'unknown') {
      errors.push(status.reason)
    }
    if (previous && document.kind === 'error' && previous[kind].kind === 'ready') {
      value = { ...value, [kind]: previous[kind] }
    }
    if (previous?.prStatuses[kind] && (!status || status.state === 'unknown')) {
      value.prStatuses[kind] = previous.prStatuses[kind]
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
    readAt: previous && (errors.length || pending) ? previous.readAt : new Date().toISOString(),
    problems: [...new Set(errors)],
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
