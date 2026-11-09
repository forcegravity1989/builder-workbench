import type { PublicKnownRuntimeEnvironment } from '../../../../shared/runtime-environments'

type CatalogEnvironment = Pick<
  PublicKnownRuntimeEnvironment,
  'id' | 'createdAt' | 'pairingRevision' | 'hostKeyFingerprint'
>

export type SameHostPairingRotation = { id: string; fromRevision: number; toRevision: number }

/** Hand-paired replacement needs both saved host keys; same id alone cannot prove the machine. */
export function classifyPeerReplacements(
  previous: readonly CatalogEnvironment[],
  next: readonly CatalogEnvironment[],
  replacedIds: readonly string[]
): { retired: string[]; sameHost: SameHostPairingRotation[] } {
  const nextById = new Map(next.map((environment) => [environment.id, environment]))
  const retired: string[] = []
  const sameHost: SameHostPairingRotation[] = []
  for (const id of replacedIds) {
    const before = previous.find((environment) => environment.id === id)
    const after = nextById.get(id)
    if (
      !before?.hostKeyFingerprint ||
      !after?.hostKeyFingerprint ||
      before.hostKeyFingerprint !== after.hostKeyFingerprint
    ) {
      retired.push(id)
      continue
    }
    sameHost.push({
      id,
      fromRevision: before.pairingRevision ?? before.createdAt,
      toRevision: after.pairingRevision ?? after.createdAt
    })
  }
  return { retired, sameHost }
}
