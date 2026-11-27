import { useEffect, useMemo } from 'react'
import { useAppStore } from '@/store/index'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import {
  FEATURE_WALL_SETUP_STEPS,
  getFeatureWallSetupSteps,
  type FeatureWallSetupStepId
} from '../../../../shared/feature-education/explore/feature-wall-setup-steps'
import type { FeatureWallSetupProgress } from '../feature-wall/setup/feature-wall-setup-progress'

export function useSetupGuideBrowserMilestoneProgress(
  rawProgress: FeatureWallSetupProgress,
  preBrowserSetupComplete: boolean
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
          preBrowserSetupComplete,
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
  preBrowserSetupComplete: boolean
  setupGuideSidebarDismissed: boolean
}): boolean {
  return input.setupGuideSidebarDismissed || input.preBrowserSetupComplete
}

export function getSetupGuideBrowserMilestoneAwareProgress(
  progress: FeatureWallSetupProgress,
  browserMilestoneLegacyComplete: boolean,
  workbenchShell = false
): FeatureWallSetupProgress {
  if (!browserMilestoneLegacyComplete) {
    return progress
  }
  const stepDone = Object.fromEntries(
    FEATURE_WALL_SETUP_STEPS.map((step) => [
      step.id,
      workbenchShell && (step.id === 'task-sources' || step.id === 'agent-capabilities')
        ? progress.stepDone[step.id]
        : true
    ])
  ) as Record<FeatureWallSetupStepId, boolean>
  const setupSteps = getFeatureWallSetupSteps(workbenchShell)
  // Preserve the checklist contract for profiles that completed or dismissed it before the browser milestone.
  return {
    ...progress,
    stepDone,
    coreDoneCount: setupSteps.filter((step) => stepDone[step.id]).length,
    coreTotal: setupSteps.length
  }
}
