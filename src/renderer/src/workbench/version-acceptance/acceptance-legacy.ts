import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'

/**
 * Read-only projection of the pre-v10 acceptance fields.
 *
 * v10 retired weekly rounds, meeting directives, risk marks, per-goal deliveries
 * and material links, and the human progress field. They stay in the schema so
 * stored material keeps parsing and no human input is silently dropped, but no
 * v10 surface writes them. This projection is what the board's labelled legacy
 * block renders; converting a file on disk still goes through the session
 * migration path with human confirmation, never through a read.
 */

export type LegacyGoalRecord = {
  goalId: string
  progress: string
  deliveries: { title: string; location: string }[]
  materials: { label: string; url: string }[]
  directives: {
    id: string
    text: string
    tag: string
    status: string
    source: string
    sourceRef?: string
  }[]
  rounds: { id: string; week: string; kind: string; closedAt?: string }[]
  riskIssues: string[]
}

export type LegacyAcceptanceRecords = {
  goals: LegacyGoalRecord[]
  roundCount: number
  directiveCount: number
  riskCount: number
}

const DIRECTIVE_TAG: Record<string, string> = {
  'resolved-this-acceptance': '本次验收已解决',
  'next-week-plan': '纳入下周计划',
  'record-remaining': '记录遗留'
}
const DIRECTIVE_STATUS: Record<string, string> = {
  pending: '待确认',
  confirmed: '已确认'
}
const DIRECTIVE_SOURCE: Record<string, string> = {
  'transcript-summary': '会议转写总结',
  manual: '人工提供'
}
const ROUND_KIND: Record<string, string> = {
  progress: '进展轮',
  final: '收尾轮'
}

export function legacyDirectiveTag(tag: string): string {
  return DIRECTIVE_TAG[tag] ?? tag
}
export function legacyDirectiveStatus(status: string): string {
  return DIRECTIVE_STATUS[status] ?? status
}
export function legacyDirectiveSource(source: string): string {
  return DIRECTIVE_SOURCE[source] ?? source
}
export function legacyRoundKind(kind: string): string {
  return ROUND_KIND[kind] ?? kind
}

/** Null when the material carries nothing predating v10 — the block then stays out. */
export function projectLegacyAcceptance(
  document: AcceptanceMaterial
): LegacyAcceptanceRecords | null {
  const goals: LegacyGoalRecord[] = []
  let roundCount = 0
  let directiveCount = 0
  let riskCount = 0
  for (const result of document.results) {
    const directives = (result.meetingDirectives ?? []).map((directive) => {
      directiveCount++
      return {
        id: directive.id,
        text: directive.text,
        tag: legacyDirectiveTag(directive.tag),
        status: legacyDirectiveStatus(directive.status),
        source: legacyDirectiveSource(directive.source),
        ...(directive.sourceRef ? { sourceRef: directive.sourceRef } : {})
      }
    })
    const rounds = (result.rounds ?? []).map((round) => {
      roundCount++
      return {
        id: round.id,
        week: round.week,
        kind: legacyRoundKind(round.kind),
        ...(round.closedAt ? { closedAt: round.closedAt } : {})
      }
    })
    const riskIssues = Object.entries(result.issueMarks ?? {})
      .filter(([, mark]) => mark.risk)
      .map(([key]) => {
        riskCount++
        return key
      })
    const deliveries = result.deliveries ?? []
    const materials = result.materials ?? []
    const progress = result.progress ?? ''
    if (
      !directives.length &&
      !rounds.length &&
      !riskIssues.length &&
      !deliveries.length &&
      !materials.length &&
      !progress
    ) {
      continue
    }
    goals.push({ goalId: result.goalId, progress, deliveries, materials, directives, rounds, riskIssues })
  }
  if (!goals.length) {
    return null
  }
  return { goals, roundCount, directiveCount, riskCount }
}
