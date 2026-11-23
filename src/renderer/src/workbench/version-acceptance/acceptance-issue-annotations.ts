import { parseCodeHubRemote } from '../../../../shared/codehub'
import { normalizeGitRemoteUrl } from '../../../../shared/git-remote-identity'
import type {
  AcceptanceIssueMarks,
  AcceptanceMaterial,
  PlanningMaterial,
  VersionTaskSnapshot
} from '../../../../shared/workbench/version-material'
import type { CycleTaskRead } from '../version-cycle/ports'

type GoalResultAnnotations = Pick<
  NonNullable<AcceptanceMaterial['results'][number]>,
  'issueMarks' | 'issueNotes'
>

type IssueReference = PlanningMaterial['tasks'][number]

export function isClosedIssueState(state: string | undefined): boolean {
  return ['closed', 'merged'].includes(state?.trim().toLowerCase() ?? '')
}

/** Unknown provider states must not contribute to either open or completed counts. */
export function issueReadState(read: CycleTaskRead | undefined): 'open' | 'closed' | 'unknown' {
  if (read?.kind !== 'ready') {
    return 'unknown'
  }
  if (isClosedIssueState(read.task.state)) {
    return 'closed'
  }
  return ['open', 'opened', 'in_progress', 'in-progress'].includes(
    read.task.state.trim().toLowerCase()
  )
    ? 'open'
    : 'unknown'
}

export function issueKey(reference: IssueReference): string {
  return `${reference.provider}:${reference.repository}:${reference.number}`
}

function normalizedRepository(provider: string, repository: string): string {
  const canonical = normalizeGitRemoteUrl(repository) ?? repository
  return provider === 'github' ? canonical.toLowerCase() : canonical
}

export function issueSnapshotMatches(
  snapshot: VersionTaskSnapshot,
  reference: IssueReference
): boolean {
  const prior = snapshot.reference
  if (prior.provider !== reference.provider || prior.number !== reference.number) {
    return false
  }
  const expected = normalizedRepository(reference.provider, reference.repository)
  if (normalizedRepository(prior.provider, prior.repository) === expected) {
    return true
  }
  const identity = snapshot.source?.providerIdentity
  return (
    identity?.provider === 'codehub' &&
    prior.repository === identity.project &&
    expected === `${identity.host}/${identity.project}`
  )
}

function annotationKeys(
  reference: IssueReference,
  relatedIssues: readonly IssueReference[],
  snapshots: readonly VersionTaskSnapshot[] | undefined,
  stored: Record<string, unknown> | undefined
): string[] {
  const keys = new Set([issueKey(reference)])
  const expected = normalizedRepository(reference.provider, reference.repository)
  const prefix = `${reference.provider}:`
  const suffix = `:${reference.number}`
  for (const key of Object.keys(stored ?? {})) {
    if (
      key.startsWith(prefix) &&
      key.endsWith(suffix) &&
      normalizedRepository(reference.provider, key.slice(prefix.length, -suffix.length)) ===
        expected
    ) {
      keys.add(key)
    }
  }
  const codehub = reference.provider === 'codehub' ? parseCodeHubRemote(reference.repository) : null
  const conflictingAlias =
    codehub &&
    snapshots?.some(
      (snapshot) =>
        snapshot.reference.provider === 'codehub' &&
        snapshot.reference.number === reference.number &&
        snapshot.reference.repository === codehub.project &&
        Boolean(snapshot.source?.providerIdentity) &&
        !issueSnapshotMatches(snapshot, reference)
    )
  if (codehub && !conflictingAlias) {
    keys.add(issueKey({ ...reference, repository: codehub.project }))
  }
  for (const snapshot of snapshots ?? []) {
    if (issueSnapshotMatches(snapshot, reference)) {
      keys.add(issueKey(snapshot.reference))
    }
  }
  if (canUseLegacyIssueKey(reference, relatedIssues)) {
    keys.add(String(reference.number))
  }
  return [...keys]
}

function canUseLegacyIssueKey(
  reference: IssueReference,
  relatedIssues: readonly IssueReference[]
): boolean {
  return relatedIssues.filter((item) => item.number === reference.number).length === 1
}

export function issueMarkFor(
  result: GoalResultAnnotations,
  reference: IssueReference,
  relatedIssues: readonly IssueReference[],
  snapshots?: readonly VersionTaskSnapshot[]
): AcceptanceIssueMarks | undefined {
  const stored = result.issueMarks
  const key = annotationKeys(reference, relatedIssues, snapshots, stored).find(
    (candidate) => stored?.[candidate] !== undefined
  )
  return key ? stored?.[key] : undefined
}

export function issueNoteFor(
  result: GoalResultAnnotations,
  reference: IssueReference,
  relatedIssues: readonly IssueReference[],
  snapshots?: readonly VersionTaskSnapshot[]
): string | undefined {
  const stored = result.issueNotes
  const key = annotationKeys(reference, relatedIssues, snapshots, stored).find(
    (candidate) => stored?.[candidate] !== undefined
  )
  return key ? stored?.[key] : undefined
}

/** The carry mark is the only Issue-level mark left; risk marking is retired. */
export function updateIssueCarry(
  result: GoalResultAnnotations,
  reference: IssueReference,
  relatedIssues: readonly IssueReference[],
  value: boolean,
  snapshots?: readonly VersionTaskSnapshot[]
): Record<string, AcceptanceIssueMarks> {
  const key = issueKey(reference)
  const nextMarks = { ...result.issueMarks }
  // Unmarking removes the key rather than storing `carry: false`: the two are
  // equivalent on every read path, and leaving an explicit false behind makes the
  // human-field guard demand the model round-trip a value that means "nothing".
  const existing = issueMarkFor(result, reference, relatedIssues, snapshots)
  const nextMark = { ...existing, carry: value }
  for (const alias of annotationKeys(reference, relatedIssues, snapshots, nextMarks)) {
    delete nextMarks[alias]
  }
  if (nextMark.carry || nextMark.risk) {
    nextMarks[key] = nextMark
  } else {
    delete nextMarks[key]
  }
  return nextMarks
}

export function updateIssueNote(
  result: GoalResultAnnotations,
  reference: IssueReference,
  relatedIssues: readonly IssueReference[],
  note: string,
  snapshots?: readonly VersionTaskSnapshot[]
): Record<string, string> {
  const key = issueKey(reference)
  const nextNotes = { ...result.issueNotes }
  // Same reasoning as the carry mark: an emptied note is no note.
  for (const alias of annotationKeys(reference, relatedIssues, snapshots, nextNotes)) {
    delete nextNotes[alias]
  }
  if (note) {
    nextNotes[key] = note
  } else {
    delete nextNotes[key]
  }
  return nextNotes
}
