import type {
  AcceptanceIssueMarks,
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'

type GoalResultAnnotations = Pick<
  NonNullable<AcceptanceMaterial['results'][number]>,
  'issueMarks' | 'issueNotes'
>

export type IssueReference = PlanningMaterial['tasks'][number]

export function isClosedIssueState(state: string | undefined): boolean {
  return ['closed', 'merged'].includes(state?.trim().toLowerCase() ?? '')
}

export function issueKey(reference: IssueReference): string {
  return `${reference.provider}:${reference.repository}:${reference.number}`
}

export function canUseLegacyIssueKey(
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

export function updateIssueMark(
  result: GoalResultAnnotations,
  reference: IssueReference,
  relatedIssues: readonly IssueReference[],
  mark: 'carry' | 'risk',
  value: boolean
): Record<string, AcceptanceIssueMarks> {
  const key = issueKey(reference)
  const nextMarks = {
    ...result.issueMarks,
    [key]: {
      ...issueMarkFor(result, reference, relatedIssues),
      [mark]: value,
      ...(mark === 'carry' && !value ? { risk: false } : {})
    }
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
  const nextNotes = { ...result.issueNotes, [key]: note }
  if (canUseLegacyIssueKey(reference, relatedIssues)) {
    delete nextNotes[String(reference.number)]
  }
  return nextNotes
}
