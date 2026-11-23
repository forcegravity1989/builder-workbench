import { useEffect, useMemo, useState } from 'react'
import {
  getFeatureWallSetupSteps,
  getFirstIncompleteFeatureWallSetupStepId
} from '../../../../shared/feature-wall-setup-steps'
import type { FeatureWallSetupStepId } from '../../../../shared/feature-wall-setup-steps'
import { FeatureWallSetupChecklist } from '../feature-wall/FeatureWallSetupChecklist'
import { useSettingsSetupGuideFullProgress } from './settings-setup-guide-progress'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'

export function SettingsSetupGuidePane(): React.JSX.Element {
  const workbenchShell = isWorkbenchShell()
  const setupSteps = useMemo(() => getFeatureWallSetupSteps(workbenchShell), [workbenchShell])
  const [userSelectedStep, setUserSelectedStep] = useState(false)
  const [orchestrationSkillInstalled, setOrchestrationSkillInstalled] = useState(false)
  const [browserUseSkillInstalled, setBrowserUseSkillInstalled] = useState(false)
  const progress = useSettingsSetupGuideFullProgress(
    true,
    orchestrationSkillInstalled,
    browserUseSkillInstalled
  )
  const [activeStepId, setActiveStepId] = useState<FeatureWallSetupStepId>(() =>
    getFirstIncompleteFeatureWallSetupStepId(progress.stepDone, workbenchShell)
  )
  const activeStep = setupSteps.find((step) => step.id === activeStepId) ?? setupSteps[0] ?? null

  useEffect(() => {
    if (userSelectedStep) {
      return
    }
    setActiveStepId(getFirstIncompleteFeatureWallSetupStepId(progress.stepDone, workbenchShell))
  }, [progress.stepDone, userSelectedStep, workbenchShell])

  useEffect(() => {
    if (!activeStep || userSelectedStep || !progress.stepDone[activeStep.id]) {
      return
    }
    const nextUnfinishedStepId = getFirstIncompleteFeatureWallSetupStepId(
      progress.stepDone,
      workbenchShell
    )
    if (nextUnfinishedStepId !== activeStep.id) {
      setActiveStepId(nextUnfinishedStepId)
    }
  }, [activeStep, progress.stepDone, userSelectedStep, workbenchShell])

  const handleSelectStep = (id: FeatureWallSetupStepId): void => {
    setUserSelectedStep(true)
    setActiveStepId(id)
  }

  return (
    <div className="h-[min(740px,calc(100vh-14rem))] min-h-[540px] px-7 py-6">
      <FeatureWallSetupChecklist
        layout="embedded"
        activeStep={activeStep}
        progress={progress}
        onSelectStep={handleSelectStep}
        onOrchestrationSkillInstalledChange={setOrchestrationSkillInstalled}
        onBrowserUseSkillInstalledChange={setBrowserUseSkillInstalled}
      />
    </div>
  )
}
