import type {
  AcceptanceIssueMarks,
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'

type GoalResultAnnotations = Pick<
  NonNullable<AcceptanceMaterial['results'][number]>,
  'issueMarks' | 'issueNotes'
>

type IssueReference = PlanningMaterial['tasks'][number]

export function isClosedIssueState(state: string | undefined): boolean {
  return ['closed', 'merged'].includes(state?.trim().toLowerCase() ?? '')
}

export function issueKey(reference: IssueReference): string {
  return `${reference.provider}:${reference.repository}:${reference.number}`
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
  relatedIssues: readonly IssueReference[]
): AcceptanceIssueMarks | undefined {
  const key = issueKey(reference)
  return (
    result.issueMarks?.[key] ??
    (canUseLegacyIssueKey(reference, relatedIssues)
      ? result.issueMarks?.[String(reference.number)]
      : undefined)
  )
}

export function issueNoteFor(
  result: GoalResultAnnotations,
  reference: IssueReference,
  relatedIssues: readonly IssueReference[]
): string | undefined {
  const key = issueKey(reference)
  return (
    result.issueNotes?.[key] ??
    (canUseLegacyIssueKey(reference, relatedIssues)
      ? result.issueNotes?.[String(reference.number)]
      : undefined)
  )
}

/** The carry mark is the only Issue-level mark left; risk marking is retired. */
export function updateIssueCarry(
  result: GoalResultAnnotations,
  reference: IssueReference,
  relatedIssues: readonly IssueReference[],
  value: boolean
): Record<string, AcceptanceIssueMarks> {
  const key = issueKey(reference)
  const nextMarks = { ...result.issueMarks }
  // Unmarking removes the key rather than storing `carry: false`: the two are
  // equivalent on every read path, and leaving an explicit false behind makes the
  // human-field guard demand the model round-trip a value that means "nothing".
  const existing = issueMarkFor(result, reference, relatedIssues)
  const nextMark = { ...existing, carry: value }
  if (nextMark.carry || nextMark.risk) {
    nextMarks[key] = nextMark
  } else {
    delete nextMarks[key]
  }
  if (canUseLegacyIssueKey(reference, relatedIssues)) {
    delete nextMarks[String(reference.number)]
  }
  return nextMarks
}

export function updateIssueNote(
  result: GoalResultAnnotations,
  reference: IssueReference,
  relatedIssues: readonly IssueReference[],
  note: string
): Record<string, string> {
  const key = issueKey(reference)
  const nextNotes = { ...result.issueNotes }
  // Same reasoning as the carry mark: an emptied note is no note.
  if (note) {
    nextNotes[key] = note
  } else {
    delete nextNotes[key]
  }
  if (canUseLegacyIssueKey(reference, relatedIssues)) {
    delete nextNotes[String(reference.number)]
  }
  return nextNotes
}
