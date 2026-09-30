import { useEffect } from 'react'
import type { VersionHistorySource } from '../../../../shared/workbench/version-history'

/** Chooses the fixed plan revision that anchors an acceptance round; shown before the first round and after archiving. */
export function AcceptanceSourcePicker({
  hasDocument,
  version,
  sources,
  planChoice,
  busy,
  onPlanChoice,
  onBegin
}: {
  hasDocument: boolean
  version: string
  sources: VersionHistorySource[]
  planChoice: string
  busy: boolean
  onPlanChoice(value: string): void
  onBegin(): void
}) {
  useEffect(() => {
    const matches = sources.filter((item) => item.version === version)
    if (matches.length !== 1) {
      return
    }
    onPlanChoice(`${matches[0].sourceCommit}:${matches[0].version}:${matches[0].cycleId}`)
  }, [sources, version, onPlanChoice])
  return (
    <section className="va-source-picker">
      <p>
        {hasDocument
          ? '本轮验收已归档，可选择版本目录中的计划开始下一轮。'
          : '选择采用基线上该版本目录里的当前计划作为原承诺。'}
      </p>
      <select
        aria-label="固定计划修订"
        value={planChoice}
        onChange={(event) => onPlanChoice(event.target.value)}
      >
        <option value="">选择计划修订</option>
        {sources
          .filter((item) => item.version === version)
          .map((item) => (
            <option
              key={`${item.sourceCommit}:${item.cycleId}`}
              value={`${item.sourceCommit}:${item.version}:${item.cycleId}`}
            >
              {item.version} · {item.cycleId} · {item.sourceCommit.slice(0, 12)}
            </option>
          ))}
      </select>
      <button className="wb-btn wb-btn-sm" disabled={!planChoice || busy} onClick={onBegin}>
        {hasDocument ? '开始下一轮验收' : '开始本次验收'}
      </button>
    </section>
  )
}
