import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import {
  getFirstIncompleteFeatureWallSetupStepId,
  getFeatureWallSetupSteps
} from '../../../../shared/feature-education/explore/feature-wall-setup-steps'
import type { FeatureWallSetupStepId } from '../../../../shared/feature-education/explore/feature-wall-setup-steps'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/index'
import { FeatureWallSetupChecklist } from '../feature-wall/setup/FeatureWallSetupChecklist'
import { useSetupGuideProgress } from './use-setup-guide-progress'
import { useSetupGuideOpenCloseTelemetry } from './use-setup-guide-telemetry'
import { useTranslate } from '@/i18n/use-translate'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import { showOnboardingFromRenderer } from '../onboarding/show-onboarding-event'
import { SetupGuideProgressRing } from './SetupGuideProgressRing'

const SETUP_GUIDE_CLOSE_LINGER_MS = 300

export default function SetupGuideModal(): JSX.Element | null {
  const open = useAppStore((s) => s.activeModal === 'setup-guide')
  const [lingering, setLingering] = useState(open)
  useEffect(() => {
    if (open) {
      setLingering(true)
      return
    }
    const timer = window.setTimeout(() => setLingering(false), SETUP_GUIDE_CLOSE_LINGER_MS)
    return () => window.clearTimeout(timer)
  }, [open])

  if (!open && !lingering) {
    return null
  }
  return <SetupGuideModalContent open={open} lingering={lingering} />
}

function SetupGuideModalContent({
  open,
  lingering
}: {
  open: boolean
  lingering: boolean
}): JSX.Element {
  const t = useTranslate()
  const workbenchShell = isWorkbenchShell()
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const setSetupGuideSidebarDismissed = useAppStore((s) => s.setSetupGuideSidebarDismissed)
  const setupSteps = useMemo(() => getFeatureWallSetupSteps(workbenchShell), [workbenchShell])
  const [openingInitialSetup, setOpeningInitialSetup] = useState(false)
  const [userSelectedStep, setUserSelectedStep] = useState(false)
  const [orchestrationSkillInstalled, setOrchestrationSkillInstalled] = useState(false)
  const [browserUseSkillInstalled, setBrowserUseSkillInstalled] = useState(false)
  // Keep progress inputs live through the closing fade so completed rows cannot flash incomplete.
  const progressInputsActive = open || lingering
  const progress = useSetupGuideProgress(
    progressInputsActive,
    orchestrationSkillInstalled,
    browserUseSkillInstalled
  )
  const [activeStepId, setActiveStepId] = useState<FeatureWallSetupStepId>(() =>
    getFirstIncompleteFeatureWallSetupStepId(progress.stepDone, workbenchShell)
  )
  const requestedStepId = setupSteps.find((step) => step.id === modalData.setupStepId)?.id ?? null
  const telemetrySource =
    typeof modalData.setupGuideSource === 'string'
      ? modalData.setupGuideSource
      : typeof modalData.telemetrySource === 'string'
        ? modalData.telemetrySource
        : 'unknown'
  const activeStep = setupSteps.find((step) => step.id === activeStepId) ?? setupSteps[0] ?? null

  useSetupGuideOpenCloseTelemetry({
    isOpen: open,
    source: telemetrySource,
    progress,
    activeStepId: activeStep?.id ?? null
  })

  useEffect(() => {
    if (!open) {
      setUserSelectedStep(false)
      return
    }
    if (requestedStepId === null) {
      return
    }
    setUserSelectedStep(false)
    setActiveStepId(requestedStepId)
  }, [open, requestedStepId])

  useEffect(() => {
    if (!open || userSelectedStep || requestedStepId !== null) {
      return
    }
    setActiveStepId(getFirstIncompleteFeatureWallSetupStepId(progress.stepDone, workbenchShell))
  }, [open, progress.stepDone, requestedStepId, userSelectedStep, workbenchShell])

  useEffect(() => {
    if (
      !open ||
      userSelectedStep ||
      requestedStepId === null ||
      activeStep?.id !== requestedStepId ||
      !progress.stepDone[activeStep.id]
    ) {
      return
    }
    const nextUnfinishedCoreStepId = getFirstIncompleteFeatureWallSetupStepId(
      progress.stepDone,
      workbenchShell
    )
    if (nextUnfinishedCoreStepId !== activeStep.id) {
      setActiveStepId(nextUnfinishedCoreStepId)
    }
  }, [activeStep, open, progress.stepDone, requestedStepId, userSelectedStep, workbenchShell])

  const handleSelectStep = (id: FeatureWallSetupStepId): void => {
    setUserSelectedStep(true)
    setActiveStepId(id)
  }

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      closeModal()
    }
  }

  const handleHideFromSidebar = useCallback((): void => {
    setSetupGuideSidebarDismissed(true)
  }, [setSetupGuideSidebarDismissed])

  function closeWorkbenchGuide(): void {
    closeModal()
    toast.success(t('guidance.setupGuideClosed', 'Setup guide closed'), {
      description: t(
        'guidance.setupGuideReopen',
        'You can reopen it from Help → Getting Started with BW.'
      )
    })
  }

  async function openInitialSetup(): Promise<void> {
    setOpeningInitialSetup(true)
    try {
      await showOnboardingFromRenderer()
      closeModal()
    } catch {
      toast.error(
        t('guidance.initialSetupFailed', 'Could not open initial setup. Please try again.')
      )
    } finally {
      setOpeningInitialSetup(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="grid h-[min(780px,calc(100vh-2rem))] w-[min(1080px,calc(100vw-2rem))] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 sm:max-w-none"
        tabIndex={-1}
        showCloseButton={!workbenchShell}
      >
        {workbenchShell ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('guidance.closeSetupGuide', 'Close setup guide')}
            onClick={closeWorkbenchGuide}
            className="absolute right-3 top-3 text-muted-foreground"
          >
            <X className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={handleHideFromSidebar}
            className="absolute right-11 top-3.5 hidden sm:inline-flex"
          >
            {t('auto.components.setup.guide.SetupGuideModal.f3b5ffb2a6', 'Hide checklist')}
          </Button>
        )}
        <DialogHeader className="gap-1 border-b border-border px-7 py-4">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-lg">
              {workbenchShell
                ? t('guidance.gettingStarted', 'Getting Started with BW')
                : t('auto.components.setup.guide.SetupGuideModal.48a9e5ef2d', 'Getting started')}
            </DialogTitle>
            {workbenchShell ? (
              <>
                <SetupGuideProgressRing
                  done={progress.coreDoneCount}
                  total={progress.coreTotal}
                  className="text-green-600 dark:text-green-300"
                  sizeClassName="size-5"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={openingInitialSetup}
                  onClick={openInitialSetup}
                >
                  {t('guidance.initialSetup', 'Initial Setup')}
                </Button>
              </>
            ) : null}
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            {workbenchShell
              ? t(
                  'guidance.setupDescription',
                  'Prepare your environment and configure the capabilities you need. You can start working without completing the entire checklist.'
                )
              : t(
                  'auto.components.setup.guide.SetupGuideModal.3598a3ca0c',
                  'Finish the core workflows that make Orca useful for parallel agent work.'
                )}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-hidden px-7 py-6">
          <FeatureWallSetupChecklist
            activeStep={activeStep}
            progress={progress}
            onSelectStep={handleSelectStep}
            onOrchestrationSkillInstalledChange={setOrchestrationSkillInstalled}
            onBrowserUseSkillInstalledChange={setBrowserUseSkillInstalled}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
