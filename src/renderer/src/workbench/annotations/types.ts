/**
 * Board annotations for BW business screens (plan first, acceptance later per
 * the spec handover): review-meeting shorthand attached to business objects on
 * the board, not to HTML. Memory-only by decision — the durable record is the
 * meeting minutes the assistant derives from them; restarts drop annotations.
 */
export type AnnotationKind = 'goal' | 'goal-title' | 'acceptance' | 'metrics' | 'issue' | 'board'

/** Structured object reference; `label` is the human-readable object name. */
export type AnnotationRef = {
  kind: AnnotationKind
  goalId?: string
  issueNumber?: number
  label: string
}

export type BoardAnnotation = {
  id: string
  ref: AnnotationRef
  text: string
}

/** Matches recorded annotations for marker rendering; kinds are alternatives. */
export type AnnotationMatch = {
  kinds: AnnotationKind[]
  goalId?: string
  issueNumber?: number
}

const KIND_ATTRIBUTE = 'data-annotate-kind'
const GOAL_ATTRIBUTE = 'data-annotate-goal'
const ISSUE_ATTRIBUTE = 'data-annotate-issue'
const LABEL_ATTRIBUTE = 'data-annotate-label'

/** DOM attributes marking an annotatable element (capture layer contract). */
export function annotationAttributes(ref: AnnotationRef): Record<string, string> {
  return {
    [KIND_ATTRIBUTE]: ref.kind,
    ...(ref.goalId ? { [GOAL_ATTRIBUTE]: ref.goalId } : {}),
    ...(ref.issueNumber !== undefined ? { [ISSUE_ATTRIBUTE]: String(ref.issueNumber) } : {}),
    [LABEL_ATTRIBUTE]: ref.label
  }
}

export function annotationRefFromElement(element: Element): AnnotationRef | null {
  const kind = element.getAttribute(KIND_ATTRIBUTE) as AnnotationKind | null
  if (!kind) {
    return null
  }
  const goalId = element.getAttribute(GOAL_ATTRIBUTE) ?? undefined
  const issueNumber = element.getAttribute(ISSUE_ATTRIBUTE)
  return {
    kind,
    goalId,
    issueNumber: issueNumber ? Number(issueNumber) : undefined,
    label: element.getAttribute(LABEL_ATTRIBUTE) ?? '板面级'
  }
}

export function annotationMatches(ref: AnnotationRef, match: AnnotationMatch): boolean {
  return (
    match.kinds.includes(ref.kind) &&
    ref.goalId === match.goalId &&
    ref.issueNumber === match.issueNumber
  )
}
