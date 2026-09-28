import { useState } from 'react'
import type { GoalResult } from './acceptance-model'

/** Open a delivery location through the native shell: URLs in the system browser,
 * paths via the native file open. Remote-worktree files stay on the preparation
 * section's checked open path — this never re-records the location. */
export async function openDeliveryLocation(location: string): Promise<void> {
  const trimmed = location.trim()
  if (!trimmed) {
    throw new Error('材料位置为空')
  }
  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL
    try {
      url = new URL(trimmed)
    } catch {
      throw new Error('材料链接无法解析')
    }
    if (url.username || url.password) {
      throw new Error('材料链接不应包含账号凭据')
    }
    await window.api.shell.openUrl(url.href)
    return
  }
  const opened = await window.api.shell.openFilePath(trimmed)
  if (!opened) {
    throw new Error(`无法打开 ${trimmed}；远端工作区材料请先在交付准备中核对来源`)
  }
}

export function AcceptanceDeliveryDetails({
  title,
  result,
  onChange
}: {
  title: string
  result: GoalResult
  onChange(deliveries: GoalResult['deliveries']): void
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
            disabled={!delivery.location.trim()}
            onClick={() =>
              void openDeliveryLocation(delivery.location).catch((reason) =>
                setOpenError(reason instanceof Error ? reason.message : String(reason))
              )
            }
          >
            打开
          </button>
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
