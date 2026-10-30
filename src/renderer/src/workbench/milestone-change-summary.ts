import type { MilestoneDraft } from '../../../shared/workbench/project-milestones'

export function describeMilestoneChanges(before: MilestoneDraft, after: MilestoneDraft): string[] {
  const result: string[] = []
  for (const month of after.material.months) {
    const old = before.material.months.find((m) => m.month === month.month)
    if (!old || old.outcome !== month.outcome) {
      result.push(`${month.month} 成果：${month.outcome || '未填写'}`)
    }
  }
  for (const f of after.material.features) {
    const old = before.material.features.find((item) => item.id === f.id)
    if (!old) {
      result.push(
        `新增特性：${f.title} · ${f.owner} · ${f.deliveries.map((d) => `${d.version.version} ${d.stages[0]?.phase ?? '阶段未记录'}`).join(' → ')}`
      )
    } else if (JSON.stringify(old) !== JSON.stringify(f)) {
      result.push(
        `调整特性：${old.title} → ${f.title} · ${f.owner} · ${f.deliveries.map((d) => `${d.version.version} ${d.stages[0]?.phase ?? '阶段未记录'}`).join(' → ')}`
      )
      for (const delivery of f.deliveries) {
        const previous = old.deliveries.find((item) => item.id === delivery.id)
        if (
          previous &&
          (previous.goalSlot !== delivery.goalSlot || previous.goalId !== delivery.goalId)
        ) {
          const oldLabel = previous.goalSlot ? `G${previous.goalSlot}` : '未选目标'
          const newLabel = delivery.goalSlot ? `G${delivery.goalSlot}` : '未选目标'
          result.push(
            `${f.title} · ${delivery.version.version} 目标：${oldLabel === newLabel ? `${newLabel} 关联已更新` : `${oldLabel} → ${newLabel}`}${delivery.goalId ? '' : '（规划位置）'}`
          )
        }
      }
    }
  }
  for (const f of before.material.features) {
    if (!after.material.features.some((item) => item.id === f.id)) {
      result.push(`移除特性：${f.title}`)
    }
  }
  const common = new Set(
    before.material.features
      .map((f) => f.id)
      .filter((id) => after.material.features.some((f) => f.id === id))
  )
  if (
    before.material.features
      .filter((f) => common.has(f.id))
      .map((f) => f.id)
      .join() !==
    after.material.features
      .filter((f) => common.has(f.id))
      .map((f) => f.id)
      .join()
  ) {
    result.push('调整特性顺序')
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
