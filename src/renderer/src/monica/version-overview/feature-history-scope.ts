import type { CycleTaskReference, CycleTaskSnapshot } from '../version-cycle/ports'
import { featureNumber, taskKey, validTime } from './feature-model'
import type { OverviewVersionPlan } from './version-evidence'

const taskRepositoryKey = (ref: CycleTaskReference) => taskKey({ ...ref, number: 1 })

type FeatureHistoryScope = {
  byVersion: Map<string, Set<string>>
  complete: boolean
}

/** Fixed snapshots identify history; only live reads may supply a native execution source. */
export function featureHistoryScopes(
  entries: readonly OverviewVersionPlan[],
  roots: readonly CycleTaskReference[],
  currentVersion: string,
  live: ReadonlyMap<string, CycleTaskSnapshot>,
  before?: string
) {
  const scopes = new Map<string, FeatureHistoryScope>(
    roots.map((root) => [taskKey(root), { byVersion: new Map(), complete: true }])
  )
  const candidates = new Map<string, CycleTaskReference>()
  for (const entry of entries) {
    if (
      entry.version !== currentVersion &&
      validTime(before) &&
      validTime(entry.confirmation?.at) &&
      Date.parse(entry.confirmation.at) > Date.parse(before)
    ) {
      continue
    }
    for (const ref of entry.tasks) {
      const key = taskKey(ref)
      const sameRepo = roots.filter((root) => taskRepositoryKey(root) === taskRepositoryKey(ref))
      if (!sameRepo.length) {
        continue
      }
      const snapshots =
        entry.taskSnapshot?.filter((snapshot) => taskKey(snapshot.reference) === key) ?? []
      const snapshot = snapshots.length === 1 ? snapshots[0] : undefined
      const identity = (snapshot?.kind === 'ready' ? snapshot : undefined) ?? live.get(key)
      const number = identity ? featureNumber(identity) : null
      const rootKey = scopes.has(key) ? key : number === null ? null : taskKey({ ...ref, number })
      const scope = rootKey ? scopes.get(rootKey) : undefined
      if (scope) {
        const refs = scope.byVersion.get(entry.version) ?? new Set<string>()
        refs.add(key)
        scope.byVersion.set(entry.version, refs)
        if (!live.has(key)) {
          candidates.set(key, ref)
        }
      } else if (!identity || (number === null && identity.title.includes('【特性#'))) {
        // Legacy materials without an identity snapshot still need same-repository discovery.
        // An unreadable candidate is not evidence that this feature has a broken planned Issue.
        if (entry.source === 'committed') {
          for (const root of sameRepo) {
            scopes.get(taskKey(root))!.complete = false
          }
        }
        if (!live.has(key)) {
          candidates.set(key, ref)
        }
      }
    }
  }
  return { scopes, candidates: [...candidates.values()] }
}
