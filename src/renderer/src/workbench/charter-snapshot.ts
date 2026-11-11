import { useEffect } from 'react'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import type { CharterReadResult } from '../../../shared/workbench/charter'
import { readRepoCharter } from './charter-port'
import { createSnapshotCache, useSnapshotCache } from './snapshot-cache'

type CharterSnapshot = {
  revision: number
  value: CharterReadResult | null
  lastRead: CharterReadResult | null
}

const cache = createSnapshotCache<CharterSnapshot>(
  () => ({ revision: 0, value: null, lastRead: null }),
  256
)

export function charterSourceKey(repo: Repo) {
  return JSON.stringify([getRepoExecutionHostId(repo), repo.id, repo.path, repo.connectionId])
}

export function getRepoCharterSnapshot(repo: Repo) {
  return cache(charterSourceKey(repo)).read().value
}

export async function loadRepoCharter(repo: Repo, refresh = false): Promise<CharterReadResult> {
  const entry = cache(charterSourceKey(repo))
  const previous = entry.read()
  if (!refresh && previous.lastRead && !previous.lastRead.error) {
    return previous.lastRead
  }
  // A refresh after saving must read after any request started before the write.
  const revision = previous.revision + (refresh && entry.pending ? 2 : 1)
  while (entry.pending) {
    await entry.pending
    const snapshot = entry.read()
    if (!refresh || snapshot.revision >= revision) {
      return snapshot.lastRead!
    }
  }
  entry.pending = readRepoCharter(repo)
    .catch((cause: unknown): CharterReadResult => ({
      charter: null,
      existed: false,
      error: cause instanceof Error ? cause.message : String(cause)
    }))
    .then((lastRead) => {
      const current = entry.read()
      entry.publish({
        revision: current.revision + 1,
        lastRead,
        value: lastRead.error ? current.value : lastRead
      })
    })
    .finally(() => {
      entry.pending = null
    })
  await entry.pending
  return entry.read().lastRead!
}

export function useRepoCharterSnapshot(repo: Repo | undefined) {
  const snapshot = useSnapshotCache(cache(repo ? charterSourceKey(repo) : 'none'))
  useEffect(() => {
    if (repo && repo.kind !== 'folder') {
      void loadRepoCharter(repo)
    }
  }, [repo])
  return snapshot.value
}
