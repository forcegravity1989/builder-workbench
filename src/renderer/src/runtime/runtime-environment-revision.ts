const revisionByEnvironmentId = new Map<string, number>()
// Pairings proven to continue the same machine: old revision → the revision that replaced it.
const continuedRevisionsByEnvironmentId = new Map<string, Map<number, number>>()
export type RuntimeEnvironmentContinuity = {
  /** Ids now naming a different machine. */
  retired: readonly string[]
  /** Re-pairs proven to be the same machine (same registration and host key). */
  sameHost: readonly { id: string; fromRevision: number; toRevision: number }[]
}

export function replaceRuntimeEnvironmentRevisions(
  environments: readonly { id: string; createdAt: number; pairingRevision?: number }[],
  continuity: RuntimeEnvironmentContinuity = { retired: [], sameHost: [] }
): void {
  const previous = new Map(revisionByEnvironmentId)
  const nextIds = new Set(environments.map((environment) => environment.id))
  const retired = new Set([
    ...continuity.retired,
    ...[...previous.keys()].filter((id) => !nextIds.has(id))
  ])
  for (const id of retired) {
    continuedRevisionsByEnvironmentId.delete(id)
  }
  for (const { id, fromRevision, toRevision } of continuity.sameHost) {
    if (fromRevision === toRevision || retired.has(id)) {
      continue
    }
    const continued = continuedRevisionsByEnvironmentId.get(id) ?? new Map<number, number>()
    continued.set(fromRevision, toRevision)
    continuedRevisionsByEnvironmentId.set(id, continued)
  }
  revisionByEnvironmentId.clear()
  for (const environment of environments) {
    revisionByEnvironmentId.set(
      environment.id,
      environment.pairingRevision ?? environment.createdAt
    )
  }
}

export function getRuntimeEnvironmentRevision(environmentId: string): number | undefined {
  return revisionByEnvironmentId.get(environmentId)
}

/**
 * The newest pairing proven to be the same machine as `revision`. A holder of an older pairing may
 * follow a same-host rotation, but never a re-pair whose host identity is different or unresolved.
 */
export function resolveContinuedRuntimeEnvironmentRevision(
  environmentId: string,
  revision: number | undefined
): number | undefined {
  if (revision === undefined) {
    return getRuntimeEnvironmentRevision(environmentId)
  }
  const continued = continuedRevisionsByEnvironmentId.get(environmentId)
  let current = revision
  const seen = new Set<number>()
  while (continued?.has(current) && !seen.has(current)) {
    seen.add(current)
    current = continued.get(current) ?? current
  }
  return current
}

export function captureRuntimeEnvironmentRequestRevision(
  environmentId: string,
  expectedRevision?: number
): number | undefined {
  // Why: callers capture before awaits so a same-id re-pair cannot retarget their request.
  return expectedRevision ?? getRuntimeEnvironmentRevision(environmentId)
}
