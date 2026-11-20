import './annotations.css'

/**
 * Numbered board markers shown in place on annotated objects; numbers match
 * the panel cards (both derived from record order). Clicking a marker reopens
 * the panel — it never deletes or edits the record.
 */
export function AnnotationMarkers({
  numbers,
  label,
  onOpenPanel
}: {
  numbers: number[]
  label: string
  onOpenPanel(): void
}) {
  if (!numbers.length) {
    return null
  }
  return (
    <span className="g3-annot-markers">
      {numbers.map((number) => (
        <button
          key={number}
          type="button"
          className="g3-annot-marker"
          title={`批注 ${number} · 打开板面批注窗`}
          aria-label={`板面批注 ${number}（${label}）`}
          onClick={onOpenPanel}
        >
          {number}
        </button>
      ))}
    </span>
  )
}
