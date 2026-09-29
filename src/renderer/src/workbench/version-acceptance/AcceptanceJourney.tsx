import { GitPullRequest, PackageCheck, Presentation } from 'lucide-react'
import type { JourneySignal } from './acceptance-journey'

const TONES: Record<JourneySignal['kind'], string> = {
  unknown: '',
  pending: 'pending',
  failed: 'failed',
  complete: 'done'
}

/**
 * The rail locates body sections: 准备交付 returns to the collaboration card,
 * 展示验收 to the goal cards. The archive node is the acceptance archive entry
 * and prepares the request in the focused native composer (never sends).
 */
export function AcceptanceJourney({
  preparation,
  decisions,
  archive,
  startRef,
  resultsRef,
  onArchive
}: {
  preparation: JourneySignal
  decisions: JourneySignal
  archive: JourneySignal
  startRef: { current: HTMLElement | null }
  resultsRef: { current: HTMLElement | null }
  onArchive(): void
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
            if (id === 'archive') {
              onArchive()
              return
            }
            const target = id === 'preparation' ? startRef.current : resultsRef.current
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
