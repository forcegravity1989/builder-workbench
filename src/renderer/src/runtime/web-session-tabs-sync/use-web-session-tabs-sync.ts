import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '../../store'
import { getExplicitRuntimeEnvironmentIdForWorktree } from '../../lib/worktree-runtime-owner'
import { lastVerifiedRuntimeStatus } from '../../../../shared/runtime-host-status'
import type { WindowVisibilitySubscriptionParking } from '../window-visibility-subscription-parking'
import { useRuntimeSessionMirrorEnvironmentKeys } from '../use-runtime-session-mirror-environment-key'
import { sessionTabsFreshnessKey } from './tracking'
import { clearWebSessionTabsTrackingForEnvironment } from './tracking-lifecycle'
import {
  installGlobalSessionTabsSubscriptions,
  type GlobalSubscriptionRefs
} from './global-session-subscription'
import { installActiveSessionTabsSubscription } from './active-session-subscription'

/** Mount the paired-runtime tab mirrors and the selected-worktree stream. */
export function useWebSessionTabsSync(): void {
  const globalsRef = useRef<WindowVisibilitySubscriptionParking | undefined>(undefined)
  const activeRef = useRef<WindowVisibilitySubscriptionParking | undefined>(undefined)
  const activeRuntimeEnvironmentIdRef = useRef<string | null>(null)
  const activeRuntimeWorktreeKeyRef = useRef<string | null>(null)
  const visibilityResumeOmissionsRef = useRef<
    GlobalSubscriptionRefs['visibilityResumeOmissions']['current']
  >(new Map())
  const ownerRevisionsRef = useRef<GlobalSubscriptionRefs['ownerRevisions']['current']>(new Map())
  const visibilitySnapshotReceiptRef = useRef<GlobalSubscriptionRefs['snapshotReceipt']['current']>(
    () => {}
  )
  const visibilitySnapshotApplyRef = useRef<GlobalSubscriptionRefs['snapshotApply']['current']>(
    () => true
  )
  const visibilitySnapshotAcceptedRef = useRef<
    GlobalSubscriptionRefs['snapshotAccepted']['current']
  >(() => {})

  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const workspaceSessionReady = useAppStore((state) => state.workspaceSessionReady)
  const { environmentKey: runtimeSessionMirrorEnvironmentKey, resubscribeSignal } =
    useRuntimeSessionMirrorEnvironmentKeys()
  const activeWorktreeRuntimeEnvironmentId = useAppStore((state) =>
    getExplicitRuntimeEnvironmentIdForWorktree(state, state.activeWorktreeId)
  )
  // Keep this subscription dependency: a runtime reconnect can retain the same environment id
  // while replacing its runtime instance, which must restart the scoped stream.
  const activeWorktreeRuntimeId = useAppStore((state) => {
    const environmentId = getExplicitRuntimeEnvironmentIdForWorktree(state, state.activeWorktreeId)
    return environmentId
      ? (lastVerifiedRuntimeStatus(state.runtimeStatusByEnvironmentId.get(environmentId))?.runtimeId ?? null)
      : null
  })
  const activeWorktreeRuntimeConnectionGeneration = useAppStore((state) => {
    const environmentId = getExplicitRuntimeEnvironmentIdForWorktree(state, state.activeWorktreeId)
    return environmentId
      ? (state.runtimeStatusByEnvironmentId.get(environmentId)?.connectionGeneration ?? 0)
      : 0
  })
  const activeWorktreeHostContactEpoch = useAppStore((state) => {
    const environmentId = getExplicitRuntimeEnvironmentIdForWorktree(state, state.activeWorktreeId)
    return environmentId
      ? (state.runtimeStatusByEnvironmentId.get(environmentId)?.hostContactEpoch ?? 0)
      : 0
  })
  const activeWorktreeRuntimePairingRevision = useAppStore((state) => {
    const environmentId = getExplicitRuntimeEnvironmentIdForWorktree(state, state.activeWorktreeId)
    const environment = state.runtimeEnvironments.find(
      (candidate) => candidate.id === environmentId
    )
    return environment ? (environment.pairingRevision ?? environment.createdAt) : undefined
  })

  useLayoutEffect(() => {
    const environmentId = activeWorktreeRuntimeEnvironmentId?.trim() || null
    activeRuntimeEnvironmentIdRef.current = environmentId
    activeRuntimeWorktreeKeyRef.current =
      environmentId && activeWorktreeId
        ? sessionTabsFreshnessKey(environmentId, activeWorktreeId)
        : null
  }, [activeWorktreeId, activeWorktreeRuntimeEnvironmentId])

  useEffect(
    () => () => {
      for (const environmentId of ownerRevisionsRef.current.keys()) {
        clearWebSessionTabsTrackingForEnvironment(environmentId)
      }
      ownerRevisionsRef.current.clear()
      visibilityResumeOmissionsRef.current.clear()
    },
    []
  )

  useEffect(() => {
    const dispose = installGlobalSessionTabsSubscriptions({
      runtimeSessionMirrorEnvironmentKey,
      workspaceSessionReady,
      refs: {
        activeRuntimeEnvironmentId: activeRuntimeEnvironmentIdRef,
        activeRuntimeWorktreeKey: activeRuntimeWorktreeKeyRef,
        visibilityResumeOmissions: visibilityResumeOmissionsRef,
        snapshotReceipt: visibilitySnapshotReceiptRef,
        snapshotApply: visibilitySnapshotApplyRef,
        snapshotAccepted: visibilitySnapshotAcceptedRef,
        ownerRevisions: ownerRevisionsRef
      }
    })
    globalsRef.current = dispose
    return () => {
      globalsRef.current = undefined
      dispose?.()
    }
  }, [runtimeSessionMirrorEnvironmentKey, workspaceSessionReady])

  useEffect(() => {
    globalsRef.current?.restartEnded()
  }, [resubscribeSignal])

  useEffect(() => {
    const dispose = installActiveSessionTabsSubscription({
      activeWorktreeId,
      activeWorktreeRuntimeEnvironmentId,
      activeWorktreeRuntimeConnectionGeneration,
      activeWorktreeRuntimePairingRevision,
      workspaceSessionReady,
      visibilitySnapshotReceipt: visibilitySnapshotReceiptRef,
      visibilitySnapshotApply: visibilitySnapshotApplyRef,
      visibilitySnapshotAccepted: visibilitySnapshotAcceptedRef
    })
    activeRef.current = dispose
    return () => {
      activeRef.current = undefined
      dispose?.()
    }
  }, [
    activeWorktreeId,
    activeWorktreeRuntimeEnvironmentId,
    activeWorktreeRuntimeConnectionGeneration,
    activeWorktreeRuntimePairingRevision,
    activeWorktreeRuntimeId,
    workspaceSessionReady
  ])

  useEffect(() => {
    activeRef.current?.restartEnded()
  }, [activeWorktreeHostContactEpoch])
}
