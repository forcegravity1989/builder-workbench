import type { CycleTaskReference, CycleTaskSnapshot } from '../version-cycle/ports'
import { normalizeGitRemoteUrl } from '../../../../shared/git-remote-identity'
import { parseGitHubIssueOrPRLink } from '../../../../shared/github/links'
import { normalizeCodeHubMergeRequestRoute } from '../../../../shared/codehub'

export type FeaturePhase = 'design' | 'development'
export const PARSER_REVISION = 'feature-evidence-v6'
export type FeaturePull = {
  phase?: FeaturePhase | 'unknown'
  number: number
  url: string
  title: string
  body: string
  state: string
  createdAt?: string
  mergedAt?: string | null
  revision?: string
  readAt: string
}
export type FeatureEvent = {
  id: string
  phase: FeaturePhase | 'unknown' | 'version' | 'intent' | 'baseline'
  label: string
  at: string
  url: string
  revision?: string
  readAt: string
  rule: string
  version?: string
  delivered?: boolean
  deliveryKind?: 'first' | 'maintenance'
}
export type FeatureData = {
  root: CycleTaskSnapshot
  body: string
  closedAt?: string
  planningComplete?: boolean
  /** Snapshot boundary; historical views never advance their clock to now. */
  observedAt?: string
  members: CycleTaskSnapshot[]
  pulls: FeaturePull[]
  events: FeatureEvent[]
  archives?: FeatureEvent[]
  problems: string[]
  versions: { version: string; scope: string }[]
}
export function taskKey(ref: CycleTaskReference): string {
  return `${ref.provider}:${normalizeGitRemoteUrl(ref.repository) ?? ref.repository}:${ref.number}`
}
/** Goal membership belongs to the selected plan, not the cached Issue snapshot. */
export function referenceForPlan(
  reference: CycleTaskReference,
  references: readonly CycleTaskReference[]
): CycleTaskReference {
  return (
    references.find((candidate) => taskKey(candidate) === taskKey(reference)) ?? {
      ...reference,
      goalId: undefined
    }
  )
}
export function featureNumber(
  task: Pick<CycleTaskSnapshot, 'title' | 'labels' | 'iid'>
): number | null {
  if (task.labels?.some((label) => label.trim() === '特性')) {
    return task.iid
  }
  const ids = [
    ...new Set([...task.title.matchAll(/【特性#([1-9]\d*)】/g)].map((m) => Number(m[1])))
  ]
  return ids.length === 1 && Number.isSafeInteger(ids[0]) ? ids[0]! : null
}
export function validTime(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)))
}
/** Only explicit stage declarations, never PR order or changed-file guesses. */
export function pullPhase(
  body: string,
  associationBody = '',
  pullUrl = ''
): FeaturePhase | 'unknown' {
  const values = [
    ...body.matchAll(/^\s*(?:交付阶段|阶段)\s*[:：]\s*(设计|开发|Design|Build)\s*$/gim)
  ].map((m) => m[1]!.toLowerCase())
  if (pullUrl) {
    for (const line of associationBody.split(/\r?\n/)) {
      const role = /^\s*(?:[-*]\s*)?(设计|开发)\s*(?:PR|MR)\s*[:：]/i.exec(line)
      if (
        role &&
        [...line.matchAll(/https?:\/\/[^\s<>"\])]+/g)].some(
          (match) =>
            normalizeCodeHubMergeRequestRoute(match[0]) ===
            normalizeCodeHubMergeRequestRoute(pullUrl)
        )
      ) {
        values.push(role[1]!.toLowerCase())
      }
    }
  }
  const phases: Record<string, FeaturePhase> = {
    设计: 'design',
    开发: 'development',
    design: 'design',
    build: 'development'
  }
  const unique = [...new Set(values.map((value) => phases[value]))]
  return unique.length === 1 ? (unique[0] ?? 'unknown') : 'unknown'
}
export function linkedPullNumbers(body: string, issueUrl: string): number[] {
  let base: URL
  try {
    base = new URL(issueUrl)
  } catch {
    return []
  }
  const prefix = base.pathname.replace(/(?:\/-)?\/issues\/\d+\/?$/, '')
  const found = new Set<number>()
  for (const match of body.matchAll(/https?:\/\/[^\s<>"`\])]+/g)) {
    try {
      const url = new URL(match[0])
      const suffix = url.pathname.slice(prefix.length)
      const id = /^(?:\/pull\/|\/(?:-\/)?merge_requests\/)([1-9]\d*)\/?$/.exec(suffix)
      if (
        url.origin === base.origin &&
        url.pathname.startsWith(prefix) &&
        id &&
        Number.isSafeInteger(Number(id[1]))
      ) {
        found.add(Number(id[1]))
      }
    } catch {
      /* An unparseable link is not an association. */
    }
  }
  return [...found]
}

/** A timeline mention is only a candidate; the PR must declare the Issue it delivers. */
export function pullDeclaresIssue(body: string, issueUrl: string): boolean {
  const issue = parseGitHubIssueOrPRLink(issueUrl)
  if (issue?.type !== 'issue') {
    return false
  }
  return [...body.matchAll(/^[\t ]*关联[\t ]*[:：]?[\t ]*([^\r\n]+)[\t ]*\r?$/gm)].some((line) => {
    const references = line[1]
      .trim()
      .split(/[、,，\s]+/)
      .map((value) => {
        if (/^#[1-9]\d*$/.test(value)) {
          const number = Number(value.slice(1))
          return Number.isSafeInteger(number) ? { ...issue, number } : null
        }
        return parseGitHubIssueOrPRLink(value)
      })
    return (
      references.every((reference) => reference?.type === 'issue') &&
      references.some(
        (reference) =>
          reference &&
          reference.number === issue.number &&
          reference.slug.host?.toLowerCase() === issue.slug.host?.toLowerCase() &&
          reference.slug.owner.toLowerCase() === issue.slug.owner.toLowerCase() &&
          reference.slug.repo.toLowerCase() === issue.slug.repo.toLowerCase()
      )
    )
  })
}
