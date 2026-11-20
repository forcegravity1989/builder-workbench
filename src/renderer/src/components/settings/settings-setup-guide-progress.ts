import { useMemo } from 'react'
import {
  getFeatureWallSetupSteps,
  getFirstIncompleteFeatureWallSetupStepId,
  type FeatureWallSetupStepId
} from '../../../../shared/feature-wall-setup-steps'
import type { FeatureWallSetupProgress } from '../feature-wall/feature-wall-setup-progress'
import { useSetupGuideProgress } from '../setup-guide/use-setup-guide-progress'
import { isMonicaShell } from '@/monica/is-monica-shell'

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
  monicaShell = false
): SettingsSetupGuideProgress {
  const setupSteps = getFeatureWallSetupSteps(monicaShell)
  const doneCount = setupSteps.filter((step) => progress.stepDone[step.id]).length
  const firstIncompleteStepId =
    doneCount === setupSteps.length
      ? null
      : getFirstIncompleteFeatureWallSetupStepId(progress.stepDone, monicaShell)

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
  const monicaShell = isMonicaShell()
  const fullProgress = useSettingsSetupGuideFullProgress(shouldRefreshCoreState, false, false)

  return useMemo(
    () => getSettingsSetupGuideProgress(fullProgress, monicaShell),
    [fullProgress, monicaShell]
  )
}

export function useSettingsSetupGuideFullProgress(
  shouldRefreshCoreState: boolean,
  orchestrationSkillInstalled: boolean,
  browserUseSkillInstalled: boolean
): FeatureWallSetupProgress {
  return useSetupGuideProgress(
    shouldRefreshCoreState,
    orchestrationSkillInstalled,
    browserUseSkillInstalled
  )
}
