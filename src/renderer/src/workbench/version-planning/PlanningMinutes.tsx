export function PlanningMinutes({
  minutes,
  onClose,
  onCopy
}: {
  minutes: string
  onClose(): void
  onCopy(): Promise<void>
}) {
  return (
    <div className="vp-modal-backdrop">
      <section role="dialog" aria-modal="true" aria-label="计划评审纪要" className="vp-modal">
        <header>
          <h2>计划评审纪要</h2>
          <button className="wb-btn wb-btn-sm" onClick={onClose}>
            关闭
          </button>
        </header>
        <pre>{minutes}</pre>
        <button className="wb-btn wb-btn-primary" onClick={() => void onCopy()}>
          复制纪要
        </button>
      </section>
    </div>
  )
}
