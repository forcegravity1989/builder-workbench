import { useMemo } from 'react'
import {
  getFeatureWallSetupSteps,
  getFirstIncompleteFeatureWallSetupStepId,
  type FeatureWallSetupStepId
} from '../../../../../shared/feature-education/explore/feature-wall-setup-steps'
import { useSetupGuideProgress } from '../../setup-guide/use-setup-guide-progress'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'

export type SettingsSetupGuideProgress = {
  ready: boolean
  doneCount: number
  total: number
  firstIncompleteStepId: FeatureWallSetupStepId | null
}

export function getSettingsSetupGuideProgress(
  progress: {
    ready: boolean
    stepDone: Partial<Record<FeatureWallSetupStepId, boolean>>
  },
  workbenchShell = false
): SettingsSetupGuideProgress {
  const setupSteps = getFeatureWallSetupSteps(workbenchShell)
  const doneCount = setupSteps.filter((step) => progress.stepDone[step.id]).length
  const firstIncompleteStepId =
    doneCount === setupSteps.length
      ? null
      : getFirstIncompleteFeatureWallSetupStepId(progress.stepDone, workbenchShell)

  return {
    ready: progress.ready,
    doneCount,
    total: setupSteps.length,
    firstIncompleteStepId
  }
}

export function useSettingsSetupGuideProgress(
  shouldRefreshCoreState: boolean
): SettingsSetupGuideProgress {
  const fullProgress = useSetupGuideProgress(shouldRefreshCoreState, false, false)

  return useMemo(
    () => getSettingsSetupGuideProgress(fullProgress, isWorkbenchShell()),
    [fullProgress]
  )
}
