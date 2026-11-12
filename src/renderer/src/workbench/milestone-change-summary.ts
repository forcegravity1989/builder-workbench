import type { MilestoneDraft, MilestoneFeature } from '../../../shared/workbench/project-milestones'

export function describeMilestoneChanges(before: MilestoneDraft, after: MilestoneDraft): string[] {
  const result: string[] = []
  const featureSummary = (f: MilestoneFeature) =>
    [
      f.title,
      f.owner || '未指定负责人',
      ...f.deliveries.map((d) =>
        d.timeWindow
          ? `${d.phase} ${d.timeWindow.start.replace('T', ' ')}—${d.timeWindow.end.replace('T', ' ')}`
          : `${d.phase} · 未记录日期`
      )
    ].join(' · ')
  const describe = (m: MilestoneDraft['material']['milestones'][number]) => {
    const when = m.date ?? `${m.month} · 未指定日期`
    return `${when} ${m.outcome}`
  }
  for (const m of after.material.milestones) {
    const old = before.material.milestones.find((item) => item.id === m.id)
    if (!old) {
      result.push(`新增里程碑：${describe(m)}`)
    } else if (describe(old) !== describe(m)) {
      result.push(`调整里程碑：${describe(old)} → ${describe(m)}`)
    }
  }
  for (const m of before.material.milestones) {
    if (!after.material.milestones.some((item) => item.id === m.id)) {
      result.push(`移除里程碑：${describe(m)}`)
    }
  }
  for (const f of after.material.features) {
    const old = before.material.features.find((item) => item.id === f.id)
    if (!old) {
      result.push(`新增特性：${featureSummary(f)}`)
    } else if (JSON.stringify(old) !== JSON.stringify(f)) {
      result.push(`调整特性：${featureSummary(old)} → ${featureSummary(f)}`)
    }
  }
  for (const f of before.material.features) {
    if (!after.material.features.some((item) => item.id === f.id)) {
      result.push(`移除特性：${f.title}`)
    }
  }
  for (const v of after.versions) {
    const old = before.versions.find((item) => item.cycleId === v.cycleId)
    if (JSON.stringify(old) !== JSON.stringify(v)) {
      result.push(
        `${old ? '调整' : '登记'}版本：${old?.version && old.version !== v.version ? `${old.version} → ` : ''}${v.version} · ${v.timeWindow?.start ?? '未定'} — ${v.timeWindow?.end ?? '未定'}`
      )
    }
  }
  return result
}
