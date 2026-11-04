import type { MilestoneDraft } from './project-milestones'
import { milestoneDeliveryWindow } from './milestone-delivery-window'

/** Preserve existing parallel windows, but never move unrelated versions to make room. */
export function settleMilestoneWindows(
  before: MilestoneDraft,
  candidate: MilestoneDraft
): { draft: MilestoneDraft; conflict?: string } {
  for (const [index, a] of candidate.versions.entries()) {
    if (!a.timeWindow) {
      continue
    }
    for (const b of candidate.versions.slice(index + 1)) {
      if (!b.timeWindow) {
        continue
      }
      const oldA = before.versions.find((v) => v.cycleId === a.cycleId)?.timeWindow
      const oldB = before.versions.find((v) => v.cycleId === b.cycleId)?.timeWindow
      const parallel = oldA && oldB && oldA.start <= oldB.end && oldB.start <= oldA.end
      if (
        !parallel &&
        a.timeWindow.start <= b.timeWindow.end &&
        b.timeWindow.start <= a.timeWindow.end
      ) {
        return {
          draft: before,
          conflict: `${a.version} 与 ${b.version} 日期重叠，请先调整相关版本`
        }
      }
    }
  }
  for (const feature of candidate.material.features) {
    for (const delivery of feature.deliveries) {
      const version = candidate.versions.find((v) => v.cycleId === delivery.version.cycleId)
      const window = milestoneDeliveryWindow(delivery, candidate.versions)
      if (
        version?.timeWindow &&
        window &&
        (window.start < `${version.timeWindow.start}T00:00` ||
          window.end >
            new Date(Date.parse(`${version.timeWindow.end}T00:00:00Z`) + 86400000)
              .toISOString()
              .slice(0, 16))
      ) {
        return {
          draft: before,
          conflict: `${feature.title || '特性'} 的整段计划超出 ${version.version}，请调整版本边界`
        }
      }
    }
  }
  return { draft: candidate }
}
