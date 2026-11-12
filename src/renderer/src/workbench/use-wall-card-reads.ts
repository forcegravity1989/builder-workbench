import { useEffect, useMemo, useRef } from 'react'
import { forEachWithConcurrency } from '../../../shared/map-with-concurrency'
import { createSnapshotCache, useSnapshotCache, type SnapshotEntry } from './snapshot-cache'

export type WallCardRead<T> = {
  projectKey: string
  sourceKey: string
  revision: number
  ready?: boolean
  forceAtRevision?: number
  load(force: boolean): Promise<T>
}

type WallCardSnapshot<T> = { revision: number; value?: T; failed?: boolean }
type WallCardCache<T> = (key: string) => SnapshotEntry<WallCardSnapshot<T>>

export function createWallCardCache<T>(): WallCardCache<T> {
  return createSnapshotCache<WallCardSnapshot<T>>(() => ({ revision: -1 }), 256)
}

export async function loadWallCardRead<T>(
  entry: SnapshotEntry<WallCardSnapshot<T>>,
  {
    revision,
    forceAtRevision = revision,
    load
  }: Pick<WallCardRead<T>, 'revision' | 'forceAtRevision' | 'load'>,
  cancelled = () => false
) {
  while (entry.pending && !cancelled()) {
    await entry.pending
  }
  const previous = entry.read()
  if (!cancelled() && previous.revision < revision) {
    const force = forceAtRevision > 0 && previous.revision < forceAtRevision
    entry.pending = Promise.resolve()
      .then(() => load(force))
      .then(
        (value) => entry.publish({ revision, value }),
        () => entry.publish({ ...previous, revision, failed: true })
      )
      .finally(() => {
        entry.pending = null
      })
    await entry.pending
  }
  return entry.read().value
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
  const latestSources = useRef(sources)
  latestSources.current = sources
  const requestKey = JSON.stringify(
    sources.map(({ sourceKey, revision, ready, forceAtRevision }) => [
      sourceKey,
      revision,
      ready,
      forceAtRevision
    ])
  )

  useEffect(() => {
    let cancelled = false
    const changed = latestSources.current.filter(
      ({ entry, revision, ready }) => ready !== false && entry.read().revision < revision
    )
    void forEachWithConcurrency(changed, 3, async (source) => {
      await loadWallCardRead(source.entry, source, () => cancelled)
    })
    return () => {
      cancelled = true
    }
  }, [requestKey])

  return {
    values: Object.fromEntries(
      sources.map(({ projectKey }, index) => [projectKey, snapshots[index].value])
    ) as Record<string, T | undefined>,
    refreshing: sources.some(
      ({ revision, ready, forceAtRevision = revision }, index) =>
        ready !== false && forceAtRevision > 0 && snapshots[index].revision < forceAtRevision
    ),
    failed: snapshots.some((snapshot) => snapshot.failed)
  }
}
