import { workCalendarDay } from '../../../../src/shared/workbench/work-calendar.ts'
// Prototype-only civil-day coordinates. Actual evidence retains its original timestamp.
export const dayMs = 86400000
export const day = (date) => Date.parse(`${date}T00:00:00Z`) / dayMs
export const dateOf = (value) => new Date(value * dayMs).toISOString().slice(0, 10)
export const phases = ['Plan', 'Design', 'Build', 'Test', 'Deploy', 'Maintain']
export const actualDay = (timestamp) => (Date.parse(timestamp) + 8 * 3600000) / dayMs
export const actualAsOf = '2026-11-11T15:30:00+08:00'
export function isRest(value) {
  return !workCalendarDay(dateOf(value)).working
}
export function defaultStages(version, maintain = false) {
  if (maintain) {
    return [{ phase: 'Maintain', start: day(version.start), end: day(version.end) + 1 }]
  }
  let cursor = day(version.start)
  return [2, 4, 1, 2, 1].map((slots, index) => {
    while (isRest(Math.floor(cursor))) {
      cursor = Math.floor(cursor) + 1
    }
    const start = cursor
    for (let slot = 0; slot < slots; slot++) {
      while (isRest(Math.floor(cursor))) {
        cursor = Math.floor(cursor) + 1
      }
      cursor += 0.5
    }
    return { phase: phases[index], start, end: cursor }
  })
}
export function adjustVersion(plan, id, mode, delta) {
  const version = plan.versions.find((v) => v.id === id)
  if (!version || version.started || !delta) {
    return plan
  }
  const start = day(version.start) + (mode !== 'end' ? delta : 0)
  const end = day(version.end) + (mode !== 'start' ? delta : 0)
  if (end < start) {
    return plan
  }
  return {
    ...plan,
    versions: plan.versions.map((v) =>
      v.id === id ? { ...v, start: dateOf(start), end: dateOf(end) } : v
    ),
    features:
      mode === 'move'
        ? plan.features.map((f) => ({
            ...f,
            deliveries: f.deliveries.map((d) =>
              d.versionId === id
                ? {
                    ...d,
                    stages: d.stages.map((s) => ({
                      ...s,
                      start: s.start + delta,
                      end: s.end + delta
                    }))
                  }
                : d
            )
          }))
        : plan.features
  }
}
export function adjustDelivery(plan, featureId, deliveryIndex, mode, stageIndex, delta, targetId) {
  const feature = plan.features.find((f) => f.id === featureId)
  const delivery = feature?.deliveries[deliveryIndex]
  if (!delivery || plan.versions.find((v) => v.id === delivery.versionId)?.started || !delta) {
    return plan
  }
  if (targetId && plan.versions.find((v) => v.id === targetId)?.started) {
    return plan
  }
  const stages = delivery.stages.map((s) => ({ ...s }))
  if (mode === 'move') {
    stages.forEach((s) => {
      s.start += delta
      s.end += delta
    })
  } else {
    const stage = stages[stageIndex]
    if (mode === 'start') {
      if (stage.end - (stage.start + delta) < 0.5) {
        return plan
      }
      if (stageIndex && stage.start + delta - stages[stageIndex - 1].start < 0.5) {
        return plan
      }
      stage.start += delta
      if (stageIndex) {
        stages[stageIndex - 1].end = stage.start
      }
    } else {
      if (stage.end + delta - stage.start < 0.5) {
        return plan
      }
      if (
        stageIndex < stages.length - 1 &&
        stages[stageIndex + 1].end - (stage.end + delta) < 0.5
      ) {
        return plan
      }
      stage.end += delta
      if (stageIndex < stages.length - 1) {
        stages[stageIndex + 1].start = stage.end
      }
    }
  }
  return {
    ...plan,
    features: plan.features.map((f) =>
      f.id === featureId
        ? {
            ...f,
            deliveries: f.deliveries.map((d, i) =>
              i === deliveryIndex ? { ...d, stages, versionId: targetId || d.versionId } : d
            )
          }
        : f
    )
  }
}
export function scheduleProblem(plan) {
  for (const feature of plan.features) {
    for (const delivery of feature.deliveries) {
      const version = plan.versions.find((v) => v.id === delivery.versionId)
      if (!version) {
        return `${feature.title} 的关联版本不存在`
      }
      if (
        !version.started &&
        (delivery.stages[0].start < day(version.start) ||
          delivery.stages.at(-1).end > day(version.end) + 1)
      ) {
        return `${feature.title || '新特性'} 的计划超出 ${version.name}：请调整阶段或版本边界`
      }
    }
    const first = feature.deliveries.find((d) => d.stages[0]?.phase === 'Plan')
    const maintain = feature.deliveries.find((d) => d.stages[0]?.phase === 'Maintain')
    if (first && maintain && maintain.stages[0].start < first.stages.at(-1).end) {
      return `${feature.title} 的 Maintain 不能早于首版计划结束`
    }
  }
  return ''
}
