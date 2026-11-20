import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  getFeatureWallSetupStepIds,
  getFirstIncompleteFeatureWallSetupStepId,
  getFeatureWallSetupSteps,
  type FeatureWallSetupStepId
} from '../../../../shared/feature-wall-setup-steps'
import type { SetupGuideSource } from '../../../../shared/feature-education-telemetry'
import type { FeatureWallSetupProgress } from '../feature-wall/feature-wall-setup-progress'
import {
  persistEmittedSetupGuideStepId,
  readEmittedSetupGuideStepIds,
  trackSetupGuideClosed,
  trackSetupGuideOpened,
  trackSetupGuideStepCompleted
} from '@/lib/feature-education-telemetry'
import { isMonicaShell } from '@/monica/is-monica-shell'

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
  const monicaShell = isMonicaShell()
  const setupSteps = useMemo(() => getFeatureWallSetupSteps(monicaShell), [monicaShell])
  const sessionRef = useRef<SetupGuideTelemetrySession | null>(null)
  const snapshotRef = useRef<SetupGuideTelemetrySnapshot>({
    completedCount: 0,
    totalSteps: setupSteps.length,
    activeStepId: 'none'
  })

  const completedCount = countCompletedSetupSteps(args.progress.stepDone, monicaShell)
  const firstIncompleteStepId = getSetupGuideTelemetryFirstIncompleteStepId(
    args.progress,
    monicaShell
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
  monicaShell = false
): FeatureWallSetupStepId | 'none' {
  return countCompletedSetupSteps(progress.stepDone, monicaShell) >=
    getFeatureWallSetupStepIds(monicaShell).length
    ? 'none'
    : getFirstIncompleteFeatureWallSetupStepId(progress.stepDone, monicaShell)
}

export function useSetupGuideStepCompletionTelemetry(args: {
  progress: FeatureWallSetupProgress
  setupGuideVisible: boolean
}): void {
  const monicaShell = isMonicaShell()
  const stateRef = useRef<SetupGuideStepCompletionTelemetryState | null>(null)
  if (!stateRef.current) {
    stateRef.current = createSetupGuideStepCompletionTelemetryState()
  }

  useEffect(() => {
    recordSetupGuideStepCompletionTelemetry({
      state: stateRef.current!,
      progress: args.progress,
      setupGuideVisible: args.setupGuideVisible,
      monicaShell
    })
  }, [args.progress, args.progress.stepDone, args.setupGuideVisible, monicaShell])
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
  monicaShell?: boolean
}): void {
  if (!args.state.emitted) {
    args.state.emitted = readEmittedSetupGuideStepIds()
  }
  const previousDone = args.state.previousDone
  args.state.previousDone = { ...args.progress.stepDone }
  const emitted = args.state.emitted
  if (!previousDone || !args.setupGuideVisible) {
    // Why: hidden async refresh can flip already-complete setup state from false
    // to true; only visible guide actions are attributable enough to event.
    persistCompletedSetupGuideStepBaselines(args.progress.stepDone, emitted, args.monicaShell)
    return
  }

  const completedCount = countCompletedSetupSteps(args.progress.stepDone, args.monicaShell)
  const stepIds = getFeatureWallSetupStepIds(args.monicaShell)
  for (const stepId of stepIds) {
    if (!args.progress.stepDone[stepId] || previousDone[stepId] || emitted.has(stepId)) {
      continue
    }
    emitted.add(stepId)
    persistEmittedSetupGuideStepId(stepId)
    trackSetupGuideStepCompleted({
      stepId,
      completedCount,
      totalSteps: stepIds.length,
      setupGuideVisible: args.setupGuideVisible
    })
  }
}

function countCompletedSetupSteps(
  done: Record<FeatureWallSetupStepId, boolean>,
  monicaShell = false
): number {
  return getFeatureWallSetupStepIds(monicaShell).filter((stepId) => done[stepId]).length
}

function persistCompletedSetupGuideStepBaselines(
  done: Record<FeatureWallSetupStepId, boolean>,
  emitted: Set<FeatureWallSetupStepId>,
  monicaShell = false
): void {
  for (const stepId of getFeatureWallSetupStepIds(monicaShell)) {
    if (!done[stepId] || emitted.has(stepId)) {
      continue
    }
    emitted.add(stepId)
    persistEmittedSetupGuideStepId(stepId)
  }
}
