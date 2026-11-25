import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  getFirstIncompleteFeatureWallSetupStepId,
  getFeatureWallSetupSteps,
  type FeatureWallSetupStepId
} from '../../../../shared/feature-education/explore/feature-wall-setup-steps'
import type { SetupGuideSource } from '../../../../shared/feature-education/feature-education-telemetry'
import type { FeatureWallSetupProgress } from '../feature-wall/setup/feature-wall-setup-progress'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import {
  persistEmittedSetupGuideStepId,
  readEmittedSetupGuideStepIds,
  trackSetupGuideClosed,
  trackSetupGuideOpened,
  trackSetupGuideStepCompleted
} from '@/diagnostics/telemetry/feature-education-telemetry'

type SetupGuideTelemetrySession = {
  source: SetupGuideSource
  initialCompletedCount: number
}

type SetupGuideTelemetrySnapshot = {
  completedCount: number
  totalSteps: number
  activeStepId: FeatureWallSetupStepId | 'none'
}

type SetupGuideStepCompletionTelemetryState = {
  previousDone: Record<FeatureWallSetupStepId, boolean> | null
  emitted: Set<FeatureWallSetupStepId> | null
}

export function useSetupGuideOpenCloseTelemetry(args: {
  isOpen: boolean
  source: string | null | undefined
  progress: FeatureWallSetupProgress
  activeStepId: FeatureWallSetupStepId | null
}): void {
  const workbenchShell = isWorkbenchShell()
  const setupSteps = useMemo(() => getFeatureWallSetupSteps(workbenchShell), [workbenchShell])
  const sessionRef = useRef<SetupGuideTelemetrySession | null>(null)
  const snapshotRef = useRef<SetupGuideTelemetrySnapshot>({
    completedCount: 0,
    totalSteps: setupSteps.length,
    activeStepId: 'none'
  })

  const completedCount = setupSteps.filter((step) => args.progress.stepDone[step.id]).length
  const firstIncompleteStepId = getSetupGuideTelemetryFirstIncompleteStepId(
    args.progress,
    workbenchShell
  )

  snapshotRef.current = {
    completedCount,
    totalSteps: setupSteps.length,
    activeStepId: args.activeStepId ?? 'none'
  }

  const closeSession = useCallback((outcome: 'completed' | 'dismissed' | 'interrupted'): void => {
    const session = sessionRef.current
    if (!session) {
      return
    }
    sessionRef.current = null
    const snapshot = snapshotRef.current
    trackSetupGuideClosed({
      source: session.source,
      outcome: snapshot.completedCount >= snapshot.totalSteps ? 'completed' : outcome,
      initialCompletedCount: session.initialCompletedCount,
      finalCompletedCount: snapshot.completedCount,
      totalSteps: snapshot.totalSteps,
      activeStepId: snapshot.activeStepId
    })
  }, [])

  useEffect(() => {
    if (args.isOpen && !sessionRef.current) {
      const source = trackSetupGuideOpened({
        source: args.source,
        initialCompletedCount: completedCount,
        totalSteps: setupSteps.length,
        firstIncompleteStepId
      })
      sessionRef.current = { source, initialCompletedCount: completedCount }
      return
    }
    if (!args.isOpen && sessionRef.current) {
      closeSession('dismissed')
    }
  }, [
    args.isOpen,
    args.source,
    closeSession,
    completedCount,
    firstIncompleteStepId,
    setupSteps.length
  ])

  useEffect(() => {
    return () => {
      closeSession('interrupted')
    }
  }, [closeSession])
}

export function getSetupGuideTelemetryFirstIncompleteStepId(
  progress: FeatureWallSetupProgress,
  workbenchShell = false
): FeatureWallSetupStepId | 'none' {
  const setupSteps = getFeatureWallSetupSteps(workbenchShell)
  return setupSteps.every((step) => progress.stepDone[step.id])
    ? 'none'
    : getFirstIncompleteFeatureWallSetupStepId(progress.stepDone, workbenchShell)
}

export function useSetupGuideStepCompletionTelemetry(args: {
  progress: FeatureWallSetupProgress
  setupGuideVisible: boolean
}): void {
  const stateRef = useRef<SetupGuideStepCompletionTelemetryState | null>(null)
  if (!stateRef.current) {
    stateRef.current = createSetupGuideStepCompletionTelemetryState()
  }

  useEffect(() => {
    recordSetupGuideStepCompletionTelemetry({
      state: stateRef.current!,
      progress: args.progress,
      setupGuideVisible: args.setupGuideVisible,
      workbenchShell: isWorkbenchShell()
    })
  }, [args.progress, args.progress.stepDone, args.setupGuideVisible])
}

export function createSetupGuideStepCompletionTelemetryState(): SetupGuideStepCompletionTelemetryState {
  return {
    previousDone: null,
    emitted: null
  }
}

export function recordSetupGuideStepCompletionTelemetry(args: {
  state: SetupGuideStepCompletionTelemetryState
  progress: FeatureWallSetupProgress
  setupGuideVisible: boolean
  workbenchShell?: boolean
}): void {
  if (!args.state.emitted) {
    args.state.emitted = readEmittedSetupGuideStepIds()
  }
  const previousDone = args.state.previousDone
  args.state.previousDone = { ...args.progress.stepDone }
  const emitted = args.state.emitted
  const setupSteps = getFeatureWallSetupSteps(args.workbenchShell)
  if (!previousDone || !args.setupGuideVisible) {
    // Hidden refreshes cannot be attributed to guide actions; update baselines without emitting completion.
    for (const { id } of setupSteps) {
      if (args.progress.stepDone[id] && !emitted.has(id)) {
        emitted.add(id)
        persistEmittedSetupGuideStepId(id)
      }
    }
    return
  }

  const completedCount = setupSteps.filter((step) => args.progress.stepDone[step.id]).length
  for (const { id: stepId } of setupSteps) {
    if (!args.progress.stepDone[stepId] || previousDone[stepId] || emitted.has(stepId)) {
      continue
    }
    emitted.add(stepId)
    persistEmittedSetupGuideStepId(stepId)
    trackSetupGuideStepCompleted({
      stepId,
      completedCount,
      totalSteps: setupSteps.length,
      setupGuideVisible: args.setupGuideVisible
    })
  }
}
