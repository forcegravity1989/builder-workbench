import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { runtimeHostConnectionStateForEntry } from '@/runtime/runtime-host-connection-state'
import {
  getEnvironmentSshTargetConnectionGeneration,
  selectRuntimeAwareSshStatus
} from '@/store/slices/runtime-environment-ssh'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import { versionCatalogSourceKey, versionCatalogSshTargetId } from './version-catalog-source'
import { PrioritySemaphore } from '../../../shared/priority-semaphore'

const discoveryReads = new PrioritySemaphore(8)

/** Orca owns discovery, request coalescing and host-qualified snapshot admission. */
export function useVersionCatalogDiscovery(sources: readonly Repo[], revision: string) {
  const connections = useAppStore((state) =>
    JSON.stringify(
      sources.map((repo) => {
        const host = parseExecutionHostId(getRepoExecutionHostId(repo))
        if (host?.kind === 'runtime') {
          const connection = state.runtimeStatusByEnvironmentId.get(host.environmentId)
          const sshTargetId = versionCatalogSshTargetId(repo)
          return [
            runtimeHostConnectionStateForEntry(connection),
            connection?.connectionGeneration,
            connection?.hostContactEpoch,
            connection?.snapshot?.pairingRevision,
            sshTargetId
              ? [
                  sshTargetId,
                  selectRuntimeAwareSshStatus(state, host.environmentId, sshTargetId),
                  getEnvironmentSshTargetConnectionGeneration(host.environmentId, sshTargetId)
                ]
              : null
          ]
        }
        if (host?.kind === 'ssh') {
          const connection = state.sshConnectionStates.get(host.targetId)
          return [connection?.status, connection?.providerEpoch, connection?.connectionGeneration]
        }
        return 'local'
      })
    )
  )
  const key = JSON.stringify([versionCatalogSourceKey(sources), connections, revision])
  const [result, setResult] = useState<{ key: string; error: string | null } | null>(null)
  useEffect(() => {
    let cancelled = false
    void Promise.all(
      sources.map(async (repo) => {
        const release = await discoveryReads.acquire(0)
        try {
          if (cancelled) {
            return null
          }
          const ready = await useAppStore.getState().fetchWorktrees(repo.id, {
            executionHostId: getRepoExecutionHostId(repo),
            requireAuthoritative: true
          })
          return ready
            ? null
            : `无法读取项目「${repo.displayName}」的工作区，请检查主机连接后重试。`
        } catch (error) {
          return error instanceof Error ? error.message : String(error)
        } finally {
          release()
        }
      })
    ).then((errors) => {
      if (!cancelled) {
        setResult({ key, error: errors.filter(Boolean).join('\n') || null })
      }
    })
    return () => {
      cancelled = true
    }
    // Only source identity, connection transitions and explicit refresh trigger discovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return {
    loading: sources.length > 0 && result?.key !== key,
    error: result?.key === key ? result.error : null,
    key
  }
}
