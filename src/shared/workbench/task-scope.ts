import { z } from 'zod'
import { Id, MaterialVersion, VersionTaskReferenceSchema } from './version-material-common'
import {
  parseTaskQuery,
  tokenizeSearchQuery,
  tokenizeSearchQueryWithRaw,
  withQualifier
} from '../task-query'

/**
 * A removable entry context for the native Tasks page. The version is a native
 * label query; only a selected goal materializes its complete Issue references.
 */
export const WorkbenchTaskScopeSchema = z.strictObject({
  version: MaterialVersion,
  /** Only a selected goal uses the complete reference set. */
  goalId: Id.nullish(),
  /** 仅展示（如「G2 · 目标句」）；业务身份只认 goalId。 */
  goalLabel: z.string().nullish(),
  references: z.array(VersionTaskReferenceSchema)
})
export type WorkbenchTaskScope = z.infer<typeof WorkbenchTaskScopeSchema>

export function workbenchVersionTaskLabel(version: string): string {
  return `bw:plan:${version}`
}

export function seedWorkbenchTaskQuery(
  query: string,
  scope: WorkbenchTaskScope | null | undefined,
  previousScope?: WorkbenchTaskScope | null
): string {
  if (!scope) {
    return query
  }
  if (previousScope && previousScope.version !== scope.version) {
    query = removeWorkbenchVersionQuery(query, previousScope)
  }
  const labels = parseTaskQuery(query).labels
  const label = workbenchVersionTaskLabel(scope.version)
  return withQualifier(query, 'labels', [...new Set([...labels, label])])
}

export function removeWorkbenchVersionQuery(query: string, scope: WorkbenchTaskScope): string {
  const label = workbenchVersionTaskLabel(scope.version)
  return withQualifier(
    query,
    'labels',
    parseTaskQuery(query).labels.filter((value) => value !== label)
  )
}

/** The complete goal set has title metadata, not provider full-text search indexes. */
export function hasUnsupportedWorkbenchTaskSearch(rawQuery: string): boolean {
  return tokenizeSearchQueryWithRaw(parseTaskQuery(rawQuery).freeText).some(
    ({ raw, value }) =>
      !raw.startsWith('"') &&
      !raw.startsWith("'") &&
      (/^[-(]/.test(value) ||
        /^[a-zA-Z][\w-]*:/.test(value) ||
        /^(AND|OR|NOT)$/.test(value) ||
        value.endsWith(')'))
  )
}

/** Native filter qualifiers applied before paging a goal's complete Issue set. */
export function matchesWorkbenchTaskQuery(
  item: {
    number: number
    title: string
    state: string
    labels: readonly string[]
    author: string | null
    assignees: readonly string[]
  },
  rawQuery: string,
  viewerLogin: string | null
): boolean {
  const query = parseTaskQuery(rawQuery)
  if (hasUnsupportedWorkbenchTaskSearch(rawQuery)) {
    return false
  }
  if (query.scope === 'pr' || query.draft || query.reviewRequested || query.reviewedBy) {
    return false
  }
  if (query.state && query.state !== 'all' && item.state !== query.state) {
    return false
  }
  const loginMatches = (login: string | null, values: readonly string[]): boolean => {
    if (!login) {
      return true
    }
    const target = login.toLowerCase() === '@me' ? viewerLogin : login.replace(/^@/, '')
    return !!target && values.some((value) => value.toLowerCase() === target.toLowerCase())
  }
  if (!loginMatches(query.author, item.author ? [item.author] : [])) {
    return false
  }
  if (!loginMatches(query.assignee, item.assignees)) {
    return false
  }
  if (
    !query.labels.every((label) =>
      item.labels.some((value) => value.toLowerCase() === label.toLowerCase())
    )
  ) {
    return false
  }
  const text = `${item.number} ${item.title}`.toLowerCase()
  return tokenizeSearchQuery(query.freeText).every((token) =>
    /^#\d+$/.test(token)
      ? item.number === Number(token.slice(1))
      : text.includes(token.toLowerCase())
  )
}

/** 范围身份键：装载 effect 的世代围栏，范围不变不重复读取 provider。 */
export function workbenchTaskScopeKey(scope: WorkbenchTaskScope): string {
  return JSON.stringify([
    scope.version,
    scope.goalId ?? '',
    scope.references.map((reference) => [
      reference.provider,
      reference.repository,
      reference.number,
      reference.goalId ?? ''
    ])
  ])
}
