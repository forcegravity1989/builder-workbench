import type { RefObject } from 'react'
import { GitPullRequest, PackageCheck, Presentation } from 'lucide-react'
import type { JourneySignal } from './acceptance-journey'

const TONES: Record<JourneySignal['kind'], string> = {
  unknown: '',
  pending: 'pending',
  failed: 'failed',
  complete: 'done'
}

/**
 * The rail locates body sections, including the archive footer. The archive
 * request itself is the button in that footer, same as the plan board.
 */
export function AcceptanceJourney({
  preparation,
  decisions,
  archive,
  startRef,
  resultsRef,
  archiveRef
}: {
  preparation: JourneySignal
  decisions: JourneySignal
  archive: JourneySignal
  startRef: RefObject<HTMLElement | null>
  resultsRef: RefObject<HTMLElement | null>
  archiveRef: RefObject<HTMLElement | null>
}) {
  const steps = [
    { id: 'preparation', title: '准备交付', Icon: PackageCheck, signal: preparation },
    { id: 'results', title: '展示验收', Icon: Presentation, signal: decisions },
    { id: 'archive', title: '归档', Icon: GitPullRequest, signal: archive }
  ]
  return (
    <nav className="va-journey" aria-label="验收流程">
      {steps.map(({ id, title, Icon, signal }) => (
        <button
          key={id}
          type="button"
          title={`${title} · ${signal.label}`}
          onClick={() => {
            const target =
              id === 'archive'
                ? archiveRef.current
                : id === 'preparation'
                  ? startRef.current
                  : resultsRef.current
            target?.scrollIntoView({ block: 'start', behavior: 'smooth' })
          }}
        >
          <span className={`va-step-icon ${TONES[signal.kind]}`}>
            <Icon size={16} aria-hidden="true" />
          </span>
          <span>{title}</span>
        </button>
      ))}
    </nav>
  )
}
