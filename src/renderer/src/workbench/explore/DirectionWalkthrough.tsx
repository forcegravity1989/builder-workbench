import { translate } from '@/i18n/i18n'
import { DirectionWallDemo } from './DirectionWallDemo'
import { DirectionCharterDemo } from './DirectionCharterDemo'
import { DirectionMilestoneDemo } from './DirectionMilestoneDemo'
import { JourneyPlayer, type JourneyStep } from './JourneyPlayer'

const durations = [5700, 9800, 8300, 9550] as const

function getCopy() {
  return [
    {
      title: translate('guidance.direction.wall.title', 'Find the project'),
      action: translate(
        'guidance.direction.wall.body',
        'Open the project overview from the project wall.'
      )
    },
    {
      title: translate('guidance.direction.card.title', 'Agree on the direction'),
      action: translate(
        'guidance.direction.card.body',
        'Edit the vision and check the review summary.'
      )
    },
    {
      title: translate('guidance.direction.draft.title', 'Plan milestone outcomes'),
      action: translate('guidance.direction.draft.body', 'Add an outcome and adjust its schedule.')
    },
    {
      title: translate('guidance.direction.review.title', 'Review and update'),
      action: translate(
        'guidance.direction.review.body',
        'After review and merge, update the formal schedule.'
      )
    }
  ]
}

const scenes = [
  DirectionWallDemo,
  DirectionCharterDemo,
  ({ time }: { time: number }) => <DirectionMilestoneDemo time={time} review={false} />,
  ({ time }: { time: number }) => <DirectionMilestoneDemo time={time} review />
] as const
const pointerCues: readonly (readonly [at: number, target: string][])[] = [
  [
    [750, 'input'],
    [3700, '[data-workbench-open-overview]']
  ],
  [
    [790, '.card-toggle'],
    [2320, '[data-contextual-tour-target="workbench-overview-edit"]'],
    [3960, '#direction-demo-opportunity'],
    [7090, '[data-demo-action="review"]']
  ],
  [
    [790, '[data-demo-action="plan"]'],
    [2040, '[data-contextual-tour-target~="milestone-start"]'],
    [2500, '.direction-milestone-form textarea'],
    [3950, '.direction-milestone-form button[type="submit"]'],
    [4900, '[aria-label="添加特性"]'],
    [6300, '.wb-ml-resize.end']
  ],
  [
    [1050, '[data-contextual-tour-target="milestone-submit"]'],
    [3500, '[data-demo-action="confirm"]'],
    [5100, '[data-contextual-tour-target="milestone-submit"]'],
    [7660, '[data-contextual-tour-target="milestone-submit"]']
  ]
]

function getSteps(): JourneyStep[] {
  return getCopy().map((copy, index) => ({
    ...copy,
    duration: durations[index],
    cues: pointerCues[index],
    Scene: scenes[index]
  }))
}

export function DirectionJourney() {
  return <JourneyPlayer steps={getSteps()} />
}
export function DirectionWall() {
  return <JourneyPlayer steps={getSteps().slice(0, 1)} />
}
export function DirectionOverview() {
  return <JourneyPlayer steps={getSteps().slice(1, 2)} />
}
export function DirectionMilestones() {
  return <JourneyPlayer steps={getSteps().slice(2)} />
}
