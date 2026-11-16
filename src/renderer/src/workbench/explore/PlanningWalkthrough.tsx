import { translate } from '@/i18n/i18n'
import { JourneyPlayer, type JourneyStep } from './JourneyPlayer'
import {
  PlanningEntryDemo,
  PlanningGoalDemo,
  PlanningReviewDemo,
  PlanningStartIssueDemo,
  PlanningTasksDemo
} from './PlanningDemoScenes'

function steps(): JourneyStep[] {
  return [
    {
      title: translate('guidance.planning.version.title', 'Choose the version'),
      action: translate(
        'guidance.planning.version.body',
        'Start the plan and review any carryovers. The first version has no prior results.'
      ),
      duration: 6400,
      cues: [
        [1200, '[data-demo-action="open-plan"]'],
        [3350, '.vc-start-card button']
      ],
      Scene: PlanningEntryDemo
    },
    {
      title: translate('guidance.planning.goals.title', 'Define goals and criteria'),
      action: translate(
        'guidance.planning.goals.body',
        'Write the outcome and how the team will check it. Edits save as a draft.'
      ),
      duration: 6300,
      cues: [
        [800, '[aria-label="编辑目标"]'],
        [2050, '.g3-acceptance textarea'],
        [4650, '[aria-label="结束编辑目标"]']
      ],
      Scene: PlanningGoalDemo
    },
    {
      title: translate('guidance.planning.tasks.title', 'Link work to goals'),
      action: translate(
        'guidance.planning.tasks.body',
        'Check existing issues with the planning assistant and confirm the tasks to include.'
      ),
      duration: 5500,
      cues: [
        [1500, '[data-contextual-tour-target="workbench-plan-issues"]'],
        [3700, '.g3-task-link']
      ],
      Scene: PlanningTasksDemo
    },
    {
      title: translate('guidance.planning.review.title', 'Review and archive'),
      action: translate(
        'guidance.planning.review.body',
        'Annotate the plan, confirm the notes if used, then archive through a reviewed PR.'
      ),
      duration: 13900,
      cues: [
        [900, '.g3-annotate-entry'],
        [2000, '.g3-acceptance'],
        [4000, '.g3-annot-pop .primary'],
        [8100, '.g3-minutes-foot button'],
        [10700, '.g3-archive-link']
      ],
      Scene: PlanningReviewDemo
    },
    {
      title: translate('guidance.planning.start.title', 'Start an issue'),
      action: translate(
        'guidance.planning.start.body',
        'Start an issue from the plan. Open its existing workspace or create one with the issue prefilled.'
      ),
      duration: 6800,
      cues: [
        [1750, '[aria-label^="开工 #"]'],
        [4750, '.planning-demo-composer button']
      ],
      Scene: PlanningStartIssueDemo
    }
  ]
}

export function PlanningJourney() {
  return <JourneyPlayer steps={steps()} />
}

export function PlanningFeature() {
  return <JourneyPlayer steps={steps().slice(1, 4)} />
}

export function PlanningTaskFeature() {
  const clips = steps()
  return <JourneyPlayer steps={[clips[2], clips[4]]} />
}

export function PlanningWorkspaceFeature() {
  const clips = steps()
  return <JourneyPlayer steps={[clips[0], clips[4]]} />
}
