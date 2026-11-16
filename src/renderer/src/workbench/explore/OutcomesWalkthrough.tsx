import { translate } from '@/i18n/i18n'
import { JourneyPlayer, type JourneyStep } from './JourneyPlayer'
import {
  OutcomesFactsDemo,
  OutcomesPlanDemo,
  OutcomesRecoveryDemo,
  OutcomesScoreboardDemo
} from './OutcomesDemoScenes'

function steps(): JourneyStep[] {
  return [
    {
      title: translate('guidance.outcomes.facts.title', 'Check delivery'),
      action: translate(
        'guidance.outcomes.facts.body',
        'Open the version overview. Check its goals and the recorded acceptance decision.'
      ),
      duration: 4900,
      cues: [[1200, '[data-demo-action="version-overview"]']],
      Scene: OutcomesFactsDemo
    },
    {
      title: translate('guidance.outcomes.read.title', 'Read the metrics'),
      action: translate(
        'guidance.outcomes.read.body',
        'In the project overview, select a scoreboard tab. Compare the recent reading with the plan’s target and check which week it covers.'
      ),
      duration: 6600,
      cues: [
        [1200, '[data-demo-action="booking-tab"]'],
        [4200, '.wb-sb-measure:first-child .wb-sb-bar:last-child']
      ],
      Scene: OutcomesScoreboardDemo
    },
    {
      title: translate('guidance.outcomes.recovery.title', 'Handle missing readings'),
      action: translate(
        'guidance.outcomes.recovery.body',
        'Refresh to collect again. If the source needs work, use Configure metrics to open a draft session. You can keep working without readings.'
      ),
      duration: 8400,
      cues: [
        [1250, '[aria-label="刷新"]'],
        [3900, '.outcomes-metric-problem summary'],
        [5400, '[data-demo-action="configure-metrics"]']
      ],
      Scene: OutcomesRecoveryDemo
    },
    {
      title: translate('guidance.outcomes.followup.title', 'Plan the follow-up'),
      action: translate(
        'guidance.outcomes.followup.body',
        'Decide what to investigate or improve, then record it in the next plan or an existing task.'
      ),
      duration: 7300,
      cues: [
        [1000, '[data-demo-action="next-plan"]'],
        [3000, '[aria-label="编辑目标"]'],
        [5700, '[aria-label="结束编辑目标"]']
      ],
      Scene: OutcomesPlanDemo
    }
  ]
}

export function OutcomesJourney() {
  return <JourneyPlayer steps={steps()} />
}

export function OutcomesMetricsFeature() {
  return <JourneyPlayer steps={steps().slice(1, 3)} />
}
