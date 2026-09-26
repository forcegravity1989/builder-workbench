import type { GoalResult } from './acceptance-model'

export function AcceptanceDeliveryDetails({
  title,
  result,
  onChange
}: {
  title: string
  result: GoalResult
  onChange(deliveries: GoalResult['deliveries']): void
}) {
  return (
    <details className="va-delivery-details">
      <summary>
        材料 / 来源{result.deliveries.length > 1 ? ` · ${result.deliveries.length} 项交付` : ''}
      </summary>
      {result.deliveries.map((delivery, index) => (
        // These are controlled inputs without per-row state; the schema has no delivery identity.
        // oxlint-disable-next-line react-doctor/no-array-index-as-key
        <div className="va-delivery" key={index}>
          {index > 0 && (
            <label>
              实际交付
              <input
                aria-label={`${title} 实际交付 ${index + 1}`}
                value={delivery.title}
                onChange={(event) =>
                  onChange(
                    result.deliveries.map((item, i) =>
                      i === index ? { ...item, title: event.target.value } : item
                    )
                  )
                }
              />
            </label>
          )}
          <label>
            材料位置
            <input
              aria-label={`${title} 材料位置 ${index + 1}`}
              value={delivery.location}
              placeholder="可选，引用准备区材料位置"
              onChange={(event) =>
                onChange(
                  result.deliveries.map((item, i) =>
                    i === index ? { ...item, location: event.target.value } : item
                  )
                )
              }
            />
          </label>
          <button
            className="wb-btn wb-btn-ghost wb-btn-sm"
            onClick={() => onChange(result.deliveries.filter((_, i) => i !== index))}
          >
            移除
          </button>
        </div>
      ))}
      <button
        className="wb-btn wb-btn-ghost wb-btn-sm"
        onClick={() => onChange([...result.deliveries, { title: '', location: '' }])}
      >
        添加实际交付
      </button>
      {result.decision && (
        <p className="va-muted">
          来源：{result.decision.source} · {result.decision.recordedAt}
        </p>
      )}
    </details>
  )
}
