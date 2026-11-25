import { useMemo, useState } from 'react'
import {
  getFeatureWallSetupSteps,
  getFirstIncompleteFeatureWallSetupStepId
} from '../../../../../shared/feature-education/explore/feature-wall-setup-steps'
import type { FeatureWallSetupStepId } from '../../../../../shared/feature-education/explore/feature-wall-setup-steps'
import { FeatureWallSetupChecklist } from '../../feature-wall/setup/FeatureWallSetupChecklist'
import { useSetupGuideProgress } from '../../setup-guide/use-setup-guide-progress'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'

export function SettingsSetupGuidePane(): React.JSX.Element {
  const workbenchShell = isWorkbenchShell()
  const setupSteps = useMemo(() => getFeatureWallSetupSteps(workbenchShell), [workbenchShell])
  const [orchestrationSkillInstalled, setOrchestrationSkillInstalled] = useState(false)
  const [browserUseSkillInstalled, setBrowserUseSkillInstalled] = useState(false)
  const progress = useSetupGuideProgress(
    true,
    orchestrationSkillInstalled,
    browserUseSkillInstalled
  )
  const [userSelectedStepId, setUserSelectedStepId] = useState<FeatureWallSetupStepId | null>(null)
  // Follow the first unfinished step until the user picks one.
  const activeStepId =
    userSelectedStepId ??
    getFirstIncompleteFeatureWallSetupStepId(progress.stepDone, workbenchShell)
  const activeStep = setupSteps.find((step) => step.id === activeStepId) ?? setupSteps[0] ?? null

  const handleSelectStep = (id: FeatureWallSetupStepId): void => {
    setUserSelectedStepId(id)
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
