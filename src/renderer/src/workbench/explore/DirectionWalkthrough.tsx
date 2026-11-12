import type { JSX } from 'react'
import { translate } from '@/i18n/i18n'
import wallImage from '../../../../../docs/03-guide/project-direction/screens/01-project-wall.jpg'
import cardImage from '../../../../../docs/03-guide/project-direction/screens/02-project-card.jpg'
import draftImage from '../../../../../docs/03-guide/project-direction/screens/03-milestone-draft.jpg'
import reviewImage from '../../../../../docs/03-guide/project-direction/screens/04-review-summary.jpg'

type DirectionStep = 'wall' | 'card' | 'draft' | 'review'

function getSteps() {
  return {
    wall: {
      title: translate('guidance.direction.wall.title', 'Find the project'),
      body: translate(
        'guidance.direction.wall.body',
        'Find an added project on the Project wall. Select its name to continue working, or choose Project overview on its card to open the project’s direction and milestones.'
      ),
      image: wallImage
    },
    card: {
      title: translate('guidance.direction.card.title', 'Record the shared direction'),
      body: translate(
        'guidance.direction.card.body',
        'Expand the project card to see the owner, what you want to do, and the vision. Use Edit project information to revise them. The scoreboard below shows actual metrics.'
      ),
      image: cardImage
    },
    draft: {
      title: translate('guidance.direction.draft.title', 'Plan outcomes and dates'),
      body: translate(
        'guidance.direction.draft.body',
        'In Plan milestones, add an expected outcome and date. Add a feature and adjust its schedule. When the local draft is saved, you can leave and return via Continue planning.'
      ),
      image: draftImage
    },
    review: {
      title: translate('guidance.direction.review.title', 'Review the changes and update'),
      body: translate(
        'guidance.direction.review.body',
        'With a connected repository, check the changes and submit them. While the review is open, use View review. The overview still shows the formal schedule. After a teammate merges, update the project information or formal schedule.'
      ),
      image: reviewImage
    }
  }
}

function DirectionSteps({ steps }: { steps: readonly DirectionStep[] }): JSX.Element {
  const content = getSteps()
  return (
    <ol className="mx-auto flex w-full max-w-[940px] flex-col gap-5 px-8 pb-5 pt-4">
      {steps.map((id) => {
        const step = content[id]
        return (
          <li key={id}>
            <figure className="overflow-hidden rounded-lg border border-border bg-card">
              <figcaption className="space-y-1 px-4 py-3">
                <h4 className="text-sm font-semibold">{step.title}</h4>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </figcaption>
              <img
                src={step.image}
                alt={step.title}
                className="block max-h-[440px] w-full border-t border-border object-contain"
              />
            </figure>
          </li>
        )
      })}
    </ol>
  )
}

export function DirectionJourney(): JSX.Element {
  return <DirectionSteps steps={['wall', 'card', 'draft', 'review']} />
}

export function DirectionWall(): JSX.Element {
  return <DirectionSteps steps={['wall']} />
}

export function DirectionOverview(): JSX.Element {
  return <DirectionSteps steps={['card']} />
}

export function DirectionMilestones(): JSX.Element {
  return <DirectionSteps steps={['draft', 'review']} />
}
