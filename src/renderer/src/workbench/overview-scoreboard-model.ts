import type { MetricCatalog, MetricDefinition } from '../../../shared/workbench/metrics'
import type { PlanningMaterial } from '../../../shared/workbench/version-planning-material'

/** Definitions without a feature share this tab; it is not a project R&D zone. */
export const SCOREBOARD_MAIN_TAB = '主要'

export type ScoreboardScene = {
  name: string
  value: string
  lagging: MetricDefinition | null
  leading: MetricDefinition | null
  /** Definitions beyond the shown pair stay listed instead of disappearing. */
  others: MetricDefinition[]
  /** Version targets written in the selected plan, keyed by metric name. */
  targets: Record<string, string>
  /** Set when the plan targets a metric of this scene; that target is the finish line. */
  focus: { metric: string; target: string } | null
}

/**
 * A leading that leads another result is never borrowed for this one; planned
 * metrics win the slot so the finish line stays on the board.
 */
function pairOf(defs: MetricDefinition[], targets: Record<string, string>) {
  const pick = (list: MetricDefinition[]) =>
    list.find((def) => def.name in targets) ?? list[0] ?? null
  const laggings = defs.filter((def) => def.role === 'lagging')
  const lagging = pick(laggings)
  const leadings = defs.filter((def) => def.role === 'leading')
  const linked = lagging ? leadings.filter((def) => def.leads === lagging.name) : []
  const leading =
    (linked.length > 0 ? pick(linked) : null) ??
    pick(leadings.filter((def) => !def.leads)) ??
    laggings.find((def) => def !== lagging) ??
    null
  return { lagging, leading }
}

/**
 * Scenes follow declared feature order, then features only seen on definitions.
 * Focus is derived from the plan's version targets, never stored separately.
 */
export function buildScoreboardScenes(
  catalog: MetricCatalog | null,
  plan: PlanningMaterial | null
): ScoreboardScene[] {
  const defs = (catalog?.definitions ?? []).filter((def) => def.role !== 'north_star')
  const names = [
    ...(catalog?.features ?? []).map((feature) => feature.name),
    ...defs.map((def) => def.feature.trim() || SCOREBOARD_MAIN_TAB)
  ].filter((name, index, all) => all.indexOf(name) === index)
  const targets: Record<string, string> = {}
  for (const goal of plan?.goals ?? []) {
    for (const item of goal.metricTargets) {
      if (item.target.trim() && !(item.ref.name in targets)) {
        targets[item.ref.name] = item.target.trim()
      }
    }
  }
  const scenes = names.map((name): ScoreboardScene => {
    const own = defs.filter((def) => (def.feature.trim() || SCOREBOARD_MAIN_TAB) === name)
    const { lagging, leading } = pairOf(own, targets)
    const others = own.filter((def) => def !== lagging && def !== leading)
    const sceneTargets = Object.fromEntries(
      own.filter((def) => def.name in targets).map((def) => [def.name, targets[def.name]])
    )
    const anchor = [lagging, leading, ...others].find((def) => def && def.name in sceneTargets)
    return {
      name,
      value: catalog?.features.find((feature) => feature.name === name)?.value ?? '',
      lagging,
      leading,
      others,
      targets: sceneTargets,
      focus: anchor ? { metric: anchor.name, target: sceneTargets[anchor.name] } : null
    }
  })
  return [...scenes.filter((scene) => scene.focus), ...scenes.filter((scene) => !scene.focus)]
}

export type TargetVerdict = 'met' | 'unmet' | null

const TARGET = /^(≥|>=|≤|<=|>|<|=)\s*(-?\d+(?:\.\d+)?)\s*(\S*)$/

/**
 * Only an explicit comparator decides win or lose; a bare number has no direction,
 * and a unit suffix must match the definition unit, otherwise the verdict is unknown.
 */
export function targetVerdict(target: string, value: number, unit: string): TargetVerdict {
  const match = TARGET.exec(target.trim())
  if (!match || (match[3] && match[3] !== unit.trim())) {
    return null
  }
  const bound = Number(match[2])
  switch (match[1]) {
    case '≥':
    case '>=':
      return value >= bound ? 'met' : 'unmet'
    case '≤':
    case '<=':
      return value <= bound ? 'met' : 'unmet'
    case '>':
      return value > bound ? 'met' : 'unmet'
    case '<':
      return value < bound ? 'met' : 'unmet'
    default:
      return value === bound ? 'met' : 'unmet'
  }
}
