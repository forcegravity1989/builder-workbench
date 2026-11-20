import { translate } from '@/i18n/i18n'
import { JourneyPlayer, type JourneyStep } from './JourneyPlayer'
import {
  AcceptanceArchiveDemo,
  AcceptanceDecisionDemo,
  AcceptanceEvidenceDemo,
  AcceptanceMinutesDemo,
  AcceptanceReadbackDemo
} from './AcceptanceDemoScenes'

function steps(): JourneyStep[] {
  return [
    {
      title: translate('guidance.acceptance.evidence.title', 'Check the evidence'),
      action: translate(
        'guidance.acceptance.evidence.body',
        'Start this version’s acceptance and open the evidence report. Keep missing evidence visible for follow-up.'
      ),
      duration: 8500,
      cues: [
        [1350, '[data-demo-action="start-acceptance"]'],
        [2800, '.acc-prepare-row .g3-action-button'],
        [6400, '.acc-prepare-row .acc-link']
      ],
      Scene: AcceptanceEvidenceDemo
    },
    {
      title: translate('guidance.acceptance.decision.title', 'Decide each goal'),
      action: translate(
        'guidance.acceptance.decision.body',
        'Open the goal and compare the fixed criteria with the evidence. Record your decision and any next step.'
      ),
      duration: 6800,
      cues: [
        [1100, '.acc-goal-toggle'],
        [4100, '.acc-verdict-select'],
        [5500, '.acc-field textarea']
      ],
      Scene: AcceptanceDecisionDemo
    },
    {
      title: translate('guidance.acceptance.minutes.title', 'Confirm the minutes'),
      action: translate(
        'guidance.acceptance.minutes.body',
        'Record the agreement and how to follow up. Read the minutes before confirming them.'
      ),
      duration: 4800,
      cues: [[1800, '.acc-minutes-foot > button']],
      Scene: AcceptanceMinutesDemo
    },
    {
      title: translate('guidance.acceptance.archive.title', 'Submit for archiving'),
      action: translate(
        'guidance.acceptance.archive.body',
        'Ask the acceptance assistant to prepare an archive PR. Review its sources and decisions before merging.'
      ),
      duration: 6800,
      cues: [
        [1600, '.acc-archive-actions .g3-action-button'],
        [4600, '.acc-archive-link']
      ],
      Scene: AcceptanceArchiveDemo
    },
    {
      title: translate('guidance.acceptance.readback.title', 'Read the archived result'),
      action: translate(
        'guidance.acceptance.readback.body',
        'Once the archive is merged and project code is up to date, refresh the version overview and check the decision and PR.'
      ),
      duration: 4600,
      cues: [[1350, '[data-demo-action="refresh-acceptance"]']],
      Scene: AcceptanceReadbackDemo
    }
  ]
}

export function AcceptanceJourney() {
  return <JourneyPlayer steps={steps()} />
}

export function AcceptanceFeature() {
  return <JourneyPlayer steps={steps().slice(0, 4)} />
}

export function AcceptanceOverviewFeature() {
  return <JourneyPlayer steps={steps().slice(-1)} />
}
