import { useEffect, useMemo } from 'react'
import { useAppStore } from '@/store'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import {
  FEATURE_WALL_SETUP_STEPS,
  getFeatureWallSetupSteps,
  type FeatureWallSetupStepId
} from '../../../../shared/feature-wall-setup-steps'
import type { FeatureWallSetupProgress } from '../feature-wall/feature-wall-setup-progress'

export function useSetupGuideBrowserMilestoneProgress(
  rawProgress: FeatureWallSetupProgress,
  historicalSplitTerminalDone: boolean
): FeatureWallSetupProgress {
  const workbenchShell = isWorkbenchShell()
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
        workbenchShell
      ),
    [effectiveLegacyComplete, rawProgress, workbenchShell]
  )
}

export function shouldMarkBrowserMilestoneLegacyComplete(input: {
  stepDone: Partial<Record<FeatureWallSetupStepId, boolean>>
  historicalSplitTerminalDone: boolean
  setupGuideSidebarDismissed: boolean
}): boolean {
  if (input.setupGuideSidebarDismissed) {
    return true
  }
  // Why: browser migration preserves the old pre-browser checklist, which
  // included the now-removed split-terminal milestone.
  return (
    input.historicalSplitTerminalDone &&
    FEATURE_WALL_SETUP_STEPS.every((step) => step.id === 'browser' || input.stepDone[step.id])
  )
}

export function getSetupGuideBrowserMilestoneAwareProgress(
  progress: FeatureWallSetupProgress,
  browserMilestoneLegacyComplete: boolean,
  workbenchShell = false
): FeatureWallSetupProgress {
  if (!browserMilestoneLegacyComplete) {
    return progress
  }
  const setupSteps = getFeatureWallSetupSteps(workbenchShell)
  const stepDone = Object.fromEntries(
    FEATURE_WALL_SETUP_STEPS.map((step) => [
      step.id,
      workbenchShell && (step.id === 'task-sources' || step.id === 'agent-capabilities')
        ? progress.stepDone[step.id]
        : true
    ])
  ) as Record<FeatureWallSetupStepId, boolean>
  // Why: profiles that finished or dismissed the pre-browser checklist keep
  // that prior checklist contract. BW integrations remain live, and its hidden
  // CLI step must not gain completion from this migration.
  return {
    ...progress,
    stepDone,
    coreDoneCount: setupSteps.filter((step) => stepDone[step.id]).length,
    coreTotal: setupSteps.length
  }
}
