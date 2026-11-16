import { translate } from '@/i18n/i18n'
import { JourneyPlayer, type JourneyStep } from './JourneyPlayer'
import { DeliveryBrowserDemo } from './DeliveryBrowserDemo'
import { DeliveryFindDemo, DeliveryReadbackDemo, DeliveryWorkspaceDemo } from './DeliveryTaskScenes'
import {
  DeliveryNotifyDemo,
  DeliveryPrepareDemo,
  DeliveryReceiveReviewDemo,
  DeliveryReviewDemo
} from './DeliveryReviewScenes'

function deliverySteps(): JourneyStep[] {
  return [
    {
      title: translate('guidance.delivery.find.title', 'Find the goal’s tasks'),
      action: translate(
        'guidance.delivery.find.action',
        'Check the version on the project wall and open the goal’s issues.'
      ),
      duration: 4800,
      Scene: DeliveryFindDemo,
      cues: [
        [1450, '[data-delivery-action="wall-tasks"] .pcard-stages button:nth-child(2)'],
        [3150, '[data-delivery-action="goal"]']
      ]
    },
    {
      title: translate('guidance.delivery.work.title', 'Work in parallel'),
      action: translate(
        'guidance.delivery.work.action',
        'Start each issue in its own workspace. Switch sessions and return to the same work.'
      ),
      duration: 11800,
      Scene: DeliveryWorkspaceDemo,
      cues: [
        [950, '[data-delivery-action="start-booking"]'],
        [2700, '[data-delivery-action="create-workspace"] button'],
        [3980, '[data-delivery-action="start-location"]'],
        [5700, '[data-delivery-action="create-workspace"] button'],
        [7450, '[data-delivery-action="location-session"]'],
        [9300, '[data-delivery-action="booking-session"]']
      ]
    },
    {
      title: translate('guidance.delivery.browser.title', 'Review a prototype'),
      action: translate(
        'guidance.delivery.browser.action',
        'For new interactions, open the prototype, annotate an element, and choose the session that should receive the feedback.'
      ),
      duration: 15800,
      Scene: DeliveryBrowserDemo,
      cues: [
        [800, '[data-delivery-action="tab-menu"]'],
        [1830, '[data-delivery-action="browser-tab"]'],
        [3080, '[data-delivery-action="prototype-url"]'],
        [
          4480,
          '[data-delivery-browser] [data-contextual-tour-target="browser-annotation-control"]'
        ],
        [5580, '[data-delivery-action="prototype-element"]'],
        [7060, '[data-delivery-action="add-annotation"]'],
        [8310, '[data-delivery-action="annotation-tray"]'],
        [9830, '[data-delivery-action="annotation-tray"]'],
        [11000, '[data-delivery-action="edit-annotation"]'],
        [12520, '[data-delivery-action="save-annotation"]'],
        [14030, '[data-delivery-action="send-annotation"]']
      ]
    },
    {
      title: translate('guidance.delivery.prepare.title', 'Verify and prepare a PR'),
      action: translate(
        'guidance.delivery.prepare.action',
        'Inspect the diff, run the project’s checks, and review the pull request form.'
      ),
      duration: 11900,
      Scene: DeliveryPrepareDemo,
      cues: [
        [1150, '[data-delivery-action="file"]'],
        [3370, '[data-delivery-action="verify"]'],
        [5300, '[data-delivery-action="stage"]'],
        [6350, '[data-delivery-action="commit-message"] textarea'],
        [7420, '[data-delivery-action="commit"]'],
        [9180, '[data-delivery-action="push"]']
      ]
    },
    {
      title: translate('guidance.delivery.review.title', 'Review and revise'),
      action: translate(
        'guidance.delivery.review.action',
        'Open the same PR, read checks, comment on a line, and verify the author’s new revision.'
      ),
      duration: 16400,
      Scene: DeliveryReviewDemo,
      cues: [
        [1300, '[data-delivery-action="open-pr"]'],
        [2490, '[data-delivery-action="checks"]'],
        [4030, '[data-delivery-action="files"]'],
        [5650, '[data-delivery-action="line-comment"]'],
        [7380, '[data-delivery-action="post-comment"]'],
        [8080, '[data-delivery-action="conversation"]'],
        [9970, '[data-delivery-action="resume-edit"]'],
        [13800, '[data-delivery-action="push-revision"]']
      ]
    },
    {
      title: translate('guidance.delivery.readback.title', 'Confirm and check progress'),
      action: translate(
        'guidance.delivery.readback.action',
        'Confirm the merge, close the completed sample issue, and reread the goal and version counts.'
      ),
      duration: 8800,
      Scene: DeliveryReadbackDemo,
      cues: [
        [760, '[data-delivery-action="merge-pr"]'],
        [1850, '[data-delivery-action="read-issue"]'],
        [3180, '[data-delivery-action="close-issue"]'],
        [4840, '[data-delivery-action="return-wall"]'],
        [7240, '[data-delivery-action="wall-tasks"] .pcard-stages button:nth-child(2)']
      ]
    }
  ]
}

export function DeliveryJourney() {
  return <JourneyPlayer steps={deliverySteps()} />
}

export function DeliveryTasksFeature() {
  const steps = deliverySteps()
  return <JourneyPlayer steps={[steps[0], steps[5]]} />
}

export function DeliveryWorkspaceFeature() {
  return <JourneyPlayer steps={deliverySteps().slice(1, 2)} />
}

export function DeliveryBrowserFeature() {
  return <JourneyPlayer steps={deliverySteps().slice(2, 3)} />
}

export function DeliveryReviewFeature() {
  return <JourneyPlayer steps={deliverySteps().slice(3, 5)} />
}

export function DeliveryNotificationFeature() {
  return (
    <JourneyPlayer
      steps={[
        {
          title: translate('guidance.delivery.notify.title', 'Request a review'),
          action: translate(
            'guidance.delivery.notify.action',
            'With a PR open, choose connected hosts. A reviewer can also open the PR directly.'
          ),
          duration: 6600,
          Scene: DeliveryNotifyDemo,
          cues: [
            [1200, '[data-delivery-action="pair-host"]'],
            [3210, '[data-delivery-action="review-notify"]'],
            [4530, '[data-delivery-action="review-host"]']
          ]
        },
        {
          title: translate('guidance.delivery.inbox.title', 'Open a review request'),
          action: translate(
            'guidance.delivery.inbox.action',
            'Open the existing sample request. If the project is temporarily unavailable, reconnect to its host and open it again.'
          ),
          duration: 7600,
          Scene: DeliveryReceiveReviewDemo,
          cues: [
            [3250, '[data-delivery-action="resume-host"]'],
            [5440, '[data-delivery-action="open-notification"] button']
          ]
        }
      ]}
    />
  )
}
