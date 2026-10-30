import type { MilestoneSnapshot, MilestoneDraft, MilestoneMaterial } from './project-milestones'

// Compare the original schedule, not the renderer's mutable `started` flags.
export function frozenMilestoneProblems(
  baseline: MilestoneSnapshot,
  draft: MilestoneDraft,
  activeVersions: ReadonlySet<string> = new Set()
): string[] {
  const problems: string[] = []
  for (const old of baseline.versions) {
    if (!old.started && !activeVersions.has(old.version)) {
      continue
    }
    const next = draft.versions.find((v) => v.cycleId === old.cycleId)
    if (
      !next ||
      next.version !== old.version ||
      next.timeWindow?.start !== old.timeWindow?.start ||
      next.timeWindow?.end !== old.timeWindow?.end
    ) {
      problems.push(`${old.version} 已开始制定计划，版本名称和日期已锁定`)
    }
    const schedule = (material: MilestoneMaterial) =>
      material.features
        .flatMap((f) =>
          f.deliveries
            .filter((d) => d.version.cycleId === old.cycleId)
            .map((d) => [
              f.id,
              d.id,
              d.version.version,
              d.stages.map((s) => [s.phase, s.start, s.end])
            ])
        )
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    if (JSON.stringify(schedule(baseline.material)) !== JSON.stringify(schedule(draft.material))) {
      problems.push(`${old.version} 已开始制定计划，原计划须保留，不能新增、移除或调整阶段`)
    }
  }
  return problems
}

export function restoreFrozenMilestones(
  baseline: MilestoneSnapshot,
  draft: MilestoneDraft
): MilestoneDraft {
  const frozen = new Set(baseline.versions.filter((v) => v.started).map((v) => v.cycleId))
  const next = structuredClone(draft)
  for (const { started: _, ...version } of baseline.versions.filter((v) => v.started)) {
    const index = next.versions.findIndex((v) => v.cycleId === version.cycleId)
    if (index === -1) {
      next.versions.push(version)
    } else {
      next.versions[index] = version
    }
  }
  for (const original of baseline.material.features) {
    if (
      original.deliveries.some((d) => frozen.has(d.version.cycleId)) &&
      !next.material.features.some((f) => f.id === original.id)
    ) {
      next.material.features.push({ ...structuredClone(original), deliveries: [] })
    }
  }
  next.material.features = next.material.features.flatMap((feature) => {
    const original = baseline.material.features.find((f) => f.id === feature.id)
    if (!original && feature.deliveries.some((d) => frozen.has(d.version.cycleId))) {
      return []
    }
    const affected = new Set([
      ...(original?.deliveries.filter((d) => frozen.has(d.version.cycleId)).map((d) => d.id) ?? []),
      ...feature.deliveries.filter((d) => frozen.has(d.version.cycleId)).map((d) => d.id)
    ])
    const order = [
      ...new Set([
        ...(original?.deliveries.map((d) => d.id) ?? []),
        ...feature.deliveries.map((d) => d.id)
      ])
    ]
    const deliveries = [
      ...feature.deliveries.filter((d) => !affected.has(d.id)),
      ...structuredClone(original?.deliveries.filter((d) => affected.has(d.id)) ?? [])
    ].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    // Keep the original semantic order even while future dates contain an editable conflict.
    return deliveries.length ? [{ ...feature, deliveries }] : []
  })
  for (const month of baseline.material.months) {
    if (
      next.material.features.some((f) => f.month === month.month) &&
      !next.material.months.some((m) => m.month === month.month)
    ) {
      next.material.months.push({ ...month })
    }
  }
  return next
}
