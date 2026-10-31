import * as core from '../../../../src/shared/workbench/milestone-sdlc.ts'
import { settleMilestoneWindows } from '../../../../src/shared/workbench/milestone-window-order.ts'
import { workCalendarDay } from '../../../../src/shared/workbench/work-calendar.ts'
import { editMilestoneVersionName } from '../../../../src/shared/workbench/milestone-calendar.ts'
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

function toDraft(plan) {
  return {
    versions: plan.versions.map((v) => ({
      version: v.name,
      cycleId: v.id,
      timeWindow: { start: v.start, end: v.end }
    })),
    material: {
      schema_version: 2,
      months: plan.months,
      features: plan.features.map((f) => ({
        ...f,
        deliveries: f.deliveries.map((d, i) => ({
          id: `${f.id}-${i}`,
          version: {
            version: plan.versions.find((v) => v.id === d.versionId).name,
            cycleId: d.versionId
          },
          goalSlot: d.goalSlot,
          goalId: d.goalId,
          stages: d.stages.map((s) => ({
            ...s,
            start: core.plannedTime(s.start),
            end: core.plannedTime(s.end)
          }))
        }))
      }))
    }
  }
}
function fromDraft(plan, draft) {
  return {
    ...plan,
    versions: draft.versions.map((v) => ({
      ...plan.versions.find((old) => old.id === v.cycleId),
      name: v.version,
      start: v.timeWindow.start,
      end: v.timeWindow.end
    })),
    features: draft.material.features.map((f) => ({
      ...plan.features.find((old) => old.id === f.id),
      deliveries: f.deliveries.map((d, i) => ({
        ...plan.features.find((old) => old.id === f.id).deliveries[i],
        versionId: d.version.cycleId,
        goalId: d.goalId,
        goalSlot: d.goalSlot,
        stages: d.stages.map((s) => ({
          ...s,
          start: core.plannedDay(s.start),
          end: core.plannedDay(s.end)
        }))
      }))
    }))
  }
}
export function fitVersions(plan, ids) {
  return fromDraft(
    plan,
    core.fitMilestoneVersions(
      toDraft(plan),
      new Set(ids.filter((id) => !plan.versions.find((v) => v.id === id)?.started))
    )
  )
}
export function editVersionName(plan, id, name, previousName, submitted) {
  const result = editMilestoneVersionName(
    toDraft(plan),
    id,
    name,
    previousName === undefined
      ? undefined
      : { previousName, registered: toDraft(submitted).versions }
  )
  return { plan: fromDraft(plan, result.draft), problem: result.problem }
}
export function laneConflict(plan) {
  return core.milestoneLaneConflict(toDraft(plan))
}
export function settleWindows(before, candidate) {
  const result = settleMilestoneWindows(
    toDraft(before),
    toDraft(candidate),
    new Set(before.versions.filter((v) => v.started).map((v) => v.id))
  )
  return { plan: fromDraft(candidate, result.draft), conflict: result.conflict }
}
export function adjustVersion(plan, id, mode, delta) {
  if (plan.versions.find((v) => v.id === id)?.started || mode !== 'move') {
    return plan
  }
  return fromDraft(plan, core.adjustMilestoneVersion(toDraft(plan), id, delta))
}
export function adjustDelivery(plan, featureId, deliveryIndex, mode, stageIndex, delta, targetId) {
  const delivery = plan.features.find((f) => f.id === featureId)?.deliveries[deliveryIndex]
  if (
    !delivery?.stages.length ||
    plan.versions.find((v) => v.id === delivery.versionId)?.started ||
    (targetId && plan.versions.find((v) => v.id === targetId)?.started)
  ) {
    return plan
  }
  const draft = toDraft(plan)
  return fromDraft(
    plan,
    core.adjustMilestoneDelivery(
      draft,
      featureId,
      `${featureId}-${deliveryIndex}`,
      mode,
      stageIndex,
      delta,
      draft.versions.find((v) => v.cycleId === targetId)
    )
  )
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
        delivery.stages.length &&
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
