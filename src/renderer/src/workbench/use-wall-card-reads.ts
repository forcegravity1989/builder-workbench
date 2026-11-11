import { useEffect, useMemo } from 'react'
import { forEachWithConcurrency } from '../../../shared/map-with-concurrency'
import { createSnapshotCache, useSnapshotCache, type SnapshotEntry } from './snapshot-cache'

export type WallCardRead<T> = {
  projectKey: string
  sourceKey: string
  revision: number
  load(force: boolean): Promise<T>
}

type WallCardSnapshot<T> = { revision: number; value?: T; failed?: boolean }
type WallCardCache<T> = (key: string) => SnapshotEntry<WallCardSnapshot<T>>

export function createWallCardCache<T>(): WallCardCache<T> {
  return createSnapshotCache<WallCardSnapshot<T>>(() => ({ revision: -1 }), 256)
}

export function useWallCardReads<T>(reads: readonly WallCardRead<T>[], cache: WallCardCache<T>) {
  const sources = useMemo(
    () => reads.map((read) => ({ ...read, entry: cache(read.sourceKey) })),
    [reads, cache]
  )
  const group = useMemo(() => {
    let snapshots = sources.map(({ entry }) => entry.read())
    return {
      read() {
        const next = sources.map(({ entry }) => entry.read())
        if (next.some((snapshot, index) => snapshot !== snapshots[index])) {
          snapshots = next
        }
        return snapshots
      },
      subscribe(listener: () => void) {
        const unsubscribe = sources.map(({ entry }) => entry.subscribe(listener))
        return () => unsubscribe.forEach((dispose) => dispose())
      }
    }
  }, [sources])
  const snapshots = useSnapshotCache(group)

  useEffect(() => {
    let cancelled = false
    const changed = sources.filter(({ entry, revision }) => entry.read().revision < revision)
    void forEachWithConcurrency(changed, 3, async ({ entry, revision, load }) => {
      // A read already in flight may finish after navigation. Reuse it and let
      // a newer explicit refresh run next for this same source.
      while (entry.pending && !cancelled) {
        await entry.pending
      }
      const previous = entry.read()
      if (cancelled || previous.revision >= revision) {
        return
      }
      entry.pending = Promise.resolve()
        .then(() => load(revision > 0))
        .then(
          (value) => entry.publish({ revision, value }),
          () => entry.publish({ ...previous, revision, failed: true })
        )
        .finally(() => {
          entry.pending = null
        })
      await entry.pending
    })
    return () => {
      cancelled = true
    }
  }, [sources])

  return {
    values: Object.fromEntries(
      sources.map(({ projectKey }, index) => [projectKey, snapshots[index].value])
    ) as Record<string, T | undefined>,
    loading: sources.some(({ revision }, index) => snapshots[index].revision < revision),
    failed: snapshots.some((snapshot) => snapshot.failed)
  }
}
