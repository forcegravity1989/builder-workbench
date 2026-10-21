import { useState } from 'react'
import type { GoalResult } from './acceptance-model'

export function AcceptanceDeliveryDetails({
  result,
  onOpenMaterial
}: {
  result: GoalResult
  onOpenMaterial(location: string): Promise<void>
}) {
  const [openError, setOpenError] = useState<string | null>(null)
  return (
    <details className="va-delivery-details">
      <summary>
        材料 / 来源{result.deliveries.length > 1 ? ` · ${result.deliveries.length} 项交付` : ''}
      </summary>
      {result.deliveries.map((delivery, index) => (
        // These are controlled inputs without per-row state; the schema has no delivery identity.
        // oxlint-disable-next-line react-doctor/no-array-index-as-key
        <div className="va-delivery" key={index}>
          <span>
            <span className="va-label">实际交付</span>
            {delivery.title || 'Unknown'}
          </span>
          <span>
            <span className="va-label">材料位置</span>
            {delivery.location || 'Unknown'}
          </span>
          <button
            className="wb-btn wb-btn-ghost wb-btn-sm"
            disabled={!delivery.location.trim()}
            onClick={() =>
              void onOpenMaterial(delivery.location).catch((reason) =>
                setOpenError(reason instanceof Error ? reason.message : String(reason))
              )
            }
          >
            打开
          </button>
        </div>
      ))}
      {openError && (
        <p role="alert" className="va-error">
          {openError}
        </p>
      )}
      {result.decision && (
        <p className="va-muted">
          来源：{result.decision.source} · {result.decision.recordedAt}
        </p>
      )}
    </details>
  )
}
