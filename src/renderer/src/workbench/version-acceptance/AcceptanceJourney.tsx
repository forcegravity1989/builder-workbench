import type { JourneySignal } from './acceptance-journey'

export function AcceptanceJourney({
  preparation,
  decisions,
  archive
}: {
  preparation: JourneySignal
  decisions: JourneySignal
  archive: JourneySignal
}) {
  const steps = [
    { id: 'preparation', title: '准备交付', signal: preparation },
    { id: 'results', title: 'Showcase 与验收', signal: decisions },
    { id: 'archive', title: '归档', signal: archive }
  ]
  return (
    <nav className="va-journey" aria-label="验收流程">
      {steps.map(({ id, title, signal }) => (
        <a key={id} href={`#acceptance-${id}`} className={`va-signal-${signal.kind}`}>
          <span>{title}</span>
          <small>{signal.label}</small>
        </a>
      ))}
    </nav>
  )
}
