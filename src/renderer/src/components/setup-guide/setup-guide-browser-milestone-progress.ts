import { useEffect, useMemo } from 'react'
import { useAppStore } from '@/store'
import {
  FEATURE_WALL_SETUP_STEPS,
  type FeatureWallSetupStepId
} from '../../../../shared/feature-wall-setup-steps'
import type { FeatureWallSetupProgress } from '../feature-wall/feature-wall-setup-progress'

export function useSetupGuideBrowserMilestoneProgress(
  rawProgress: FeatureWallSetupProgress,
  historicalSplitTerminalDone: boolean,
  orcaCliAvailable: boolean,
  preCliAgentCapabilitiesDone: boolean
): FeatureWallSetupProgress {
  const setupGuideSidebarDismissed = useAppStore((s) => s.setupGuideSidebarDismissed)
  const browserMilestoneMigrated = useAppStore((s) => s.setupGuideBrowserMilestoneMigrated)
  const browserMilestoneLegacyComplete = useAppStore(
    (s) => s.setupGuideBrowserMilestoneLegacyComplete
  )
  const markBrowserMilestoneMigrated = useAppStore((s) => s.markSetupGuideBrowserMilestoneMigrated)
  const pendingLegacyComplete =
    !browserMilestoneMigrated && rawProgress.ready
      ? shouldMarkBrowserMilestoneLegacyComplete({
          stepDone: rawProgress.stepDone,
          preCliAgentCapabilitiesDone,
          historicalSplitTerminalDone,
          setupGuideSidebarDismissed
        })
      : false
  const effectiveLegacyComplete = browserMilestoneLegacyComplete || pendingLegacyComplete

  useEffect(() => {
    if (browserMilestoneMigrated || !rawProgress.ready) {
      return
    }
    markBrowserMilestoneMigrated(pendingLegacyComplete)
  }, [
    browserMilestoneMigrated,
    markBrowserMilestoneMigrated,
    pendingLegacyComplete,
    rawProgress.ready
  ])

  return useMemo(
    () =>
      getSetupGuideBrowserMilestoneAwareProgress(
        rawProgress,
        effectiveLegacyComplete,
        orcaCliAvailable
      ),
    [effectiveLegacyComplete, rawProgress, orcaCliAvailable]
  )
}

export function shouldMarkBrowserMilestoneLegacyComplete(input: {
  stepDone: Partial<Record<FeatureWallSetupStepId, boolean>>
  historicalSplitTerminalDone: boolean
  setupGuideSidebarDismissed: boolean
  preCliAgentCapabilitiesDone?: boolean
}): boolean {
  if (input.setupGuideSidebarDismissed) {
    return true
  }
  // Why: browser migration preserves the old pre-browser checklist, which
  // included the now-removed split-terminal milestone.
  return (
    input.historicalSplitTerminalDone &&
    FEATURE_WALL_SETUP_STEPS.every(
      (step) =>
        step.id === 'browser' ||
        (step.id === 'agent-capabilities'
          ? (input.preCliAgentCapabilitiesDone ?? input.stepDone[step.id])
          : input.stepDone[step.id])
    )
  )
}

export function getSetupGuideBrowserMilestoneAwareProgress(
  progress: FeatureWallSetupProgress,
  browserMilestoneLegacyComplete: boolean,
  orcaCliAvailable: boolean
): FeatureWallSetupProgress {
  if (!browserMilestoneLegacyComplete) {
    return progress
  }
  const stepDone = Object.fromEntries(
    FEATURE_WALL_SETUP_STEPS.map((step) => [
      step.id,
      step.id !== 'agent-capabilities' || orcaCliAvailable
    ])
  ) as Record<FeatureWallSetupStepId, boolean>
  // Why: profiles that finished or dismissed the pre-browser checklist keep
  // that prior checklist contract; historical completion cannot establish current CLI availability.
  return {
    ...progress,
    stepDone,
    coreDoneCount: FEATURE_WALL_SETUP_STEPS.filter((step) => stepDone[step.id]).length,
    coreTotal: FEATURE_WALL_SETUP_STEPS.length
  }
}
