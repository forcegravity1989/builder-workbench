import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AcceptanceMaterial,
  PlanningMaterial,
  PlanningProgressSource as ProgressSource,
  VersionTaskSnapshot
} from '../../../../shared/workbench/version-material'
import type { CycleScope, CycleTaskReference, CycleTaskSnapshot } from '../version-cycle/ports'
import { issueKey, issueMarkFor } from '../version-acceptance/acceptance-issue-annotations'
import { nativeVersionHistoryPort } from '../version-history-port'
import { readPlanningProgressSource } from './planning-progress-source'

type PriorCarryoverIssue = {
  /** Full task identity — unique React key across repositories. */
  key: string
  number: number
  /** Null when the frozen material has no snapshot entry to join — shown as number only, never guessed. */
  title: string | null
  /** Full snapshot for the native-detail round trip; null when unavailable. */
  task: CycleTaskSnapshot | null
}

type PriorCarryoverDirective = {
  /** M1… in material order. */
  label: string
  text: string
}

type PriorCarryovers = {
  issues: PriorCarryoverIssue[]
  directives: PriorCarryoverDirective[]
  /**
   * Whether the frozen acceptance recorded any Issue marks at all. False means
   * the acceptance journey never marked carry/risk — the prior row must read as
   * Unknown ("not recorded"), never as the green assertion "no carryover"
   * (iron rule: no data is Unknown, not green).
   */
  issueMarksRecorded: boolean
  /** References of the frozen snapshot, for the live open-state readback row. */
  openReadbackReferences: CycleTaskReference[]
}

type ReadySnapshot = Extract<VersionTaskSnapshot, { kind: 'ready' }>

function readySnapshotToTask(entry: ReadySnapshot): CycleTaskSnapshot {
  return {
    reference: entry.reference,
    source: entry.source,
    iid: entry.iid,
    title: entry.title,
    state: entry.state,
    url: entry.url,
    ...(entry.labels ? { labels: entry.labels } : {}),
    ...(entry.assignee ? { assignee: entry.assignee } : {}),
    readAt: entry.readAt
  }
}

/**
 * Pure mapping from the fixed acceptance material (plus the plan it adopted)
 * to the two prior-review rows: carryover Issues are `results[].issueMarks`
 * carry marks joined with the document-level taskSnapshot by task identity
 * (legacy bare-number keys included, per the acceptance annotations helpers);
 * meeting carryovers are the followup points of the human-confirmed acceptance
 * minutes, in material order. Absent fields read as empty — no free-text
 * parsing, no inference from open state.
 */
export function derivePriorCarryovers(
  acceptance: AcceptanceMaterial,
  plan: PlanningMaterial
): PriorCarryovers {
  const readyByKey = new Map<string, ReadySnapshot>()
  const openReadbackReferences: CycleTaskReference[] = []
  for (const entry of acceptance.taskSnapshot ?? []) {
    if (entry.kind === 'ready') {
      readyByKey.set(issueKey(entry.reference), entry)
      openReadbackReferences.push(entry.reference)
    }
  }
  const issues: PriorCarryoverIssue[] = []
  const directives: PriorCarryoverDirective[] = []
  let issueMarksRecorded = false
  for (const result of acceptance.results) {
    if (result.issueMarks && Object.keys(result.issueMarks).length > 0) {
      issueMarksRecorded = true
    }
    const related = plan.tasks.filter((task) => task.goalId === result.goalId)
    for (const reference of related) {
      if (!issueMarkFor(result, reference, related)?.carry) {
        continue
      }
      const ready = readyByKey.get(issueKey(reference))
      issues.push(
        ready
          ? {
              key: issueKey(reference),
              number: ready.iid,
              title: ready.title,
              task: readySnapshotToTask(ready)
            }
          : {
              key: issueKey(reference),
              number: reference.number,
              title: null,
              task: null
            }
      )
    }
  }
  // Meeting carryovers come from the acceptance meeting minutes, which replaced
  // the retired per-goal directive list. Only a human-confirmed section feeds the
  // next plan — an unconfirmed draft is not a meeting outcome. Points are labeled
  // by position while their identity stays the stored stable id.
  const minutes = acceptance.minutes
  if (minutes?.confirmed) {
    for (const followup of minutes.followups) {
      directives.push({ label: `M${directives.length + 1}`, text: followup.text })
    }
  } else if (!minutes) {
    // Material recorded before v10 has no minutes section. Its human-confirmed
    // 「纳入下周计划」 directives are the same meeting outcome, so an older version
    // keeps feeding this row instead of showing「上版会议未单独记录」.
    for (const result of acceptance.results) {
      for (const directive of result.meetingDirectives ?? []) {
        if (directive.status === 'confirmed' && directive.tag === 'next-week-plan') {
          directives.push({ label: `M${directives.length + 1}`, text: directive.text })
        }
      }
    }
  }
  return { issues, directives, issueMarksRecorded, openReadbackReferences }
}

export type PriorReviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; carryovers: PriorCarryovers }
  | { kind: 'error'; reason: string }

type Identity = [
  { repoId: string; hostId: string; runtimeOwnerEnvironmentId?: string } | null,
  string | null,
  ProgressSource | null
]

/**
 * Reads the explicitly chosen fixed acceptance source and maps it to the two
 * carryover rows. A read failure stays honest — it never falls back to another
 * record or to the latest material; `retry` re-reads the same fixed source.
 */
export function usePriorCarryovers(
  scope: CycleScope | null,
  worktreeId: string | null,
  source: ProgressSource | undefined,
  refreshToken?: number
): { state: PriorReviewState; retry(): void } {
  const key = JSON.stringify([
    scope
      ? {
          repoId: scope.repoId,
          hostId: scope.hostId,
          runtimeOwnerEnvironmentId: scope.runtimeOwnerEnvironmentId
        }
      : null,
    worktreeId,
    source ?? null
  ])
  const identity = useMemo(() => JSON.parse(key) as Identity, [key])
  const history = useMemo(
    () => nativeVersionHistoryPort(identity[0]?.runtimeOwnerEnvironmentId),
    [identity]
  )
  const request = useRef(0)
  const [retryToken, setRetryToken] = useState(0)
  const [state, setState] = useState<{ key: string; value: PriorReviewState }>({
    key,
    value: { kind: 'idle' }
  })
  useEffect(() => {
    const [scopePart, treeId, sourcePart] = identity
    if (!scopePart || !treeId || !sourcePart) {
      // No fixed source: idle is a settled state, publish it under the new key
      // and invalidate any in-flight read.
      request.current++
      setState({ key, value: { kind: 'idle' } })
      return
    }
    const token = ++request.current
    setState({ key, value: { kind: 'loading' } })
    void readPlanningProgressSource(
      history,
      { repoId: scopePart.repoId, hostId: scopePart.hostId, worktreeId: treeId },
      sourcePart
    ).then(
      (documents) => {
        if (request.current === token) {
          setState({
            key,
            value: {
              kind: 'ready',
              carryovers: derivePriorCarryovers(documents.acceptance, documents.plan)
            }
          })
        }
      },
      (reason: unknown) => {
        if (request.current === token) {
          setState({
            key,
            value: {
              kind: 'error',
              reason: reason instanceof Error ? reason.message : String(reason)
            }
          })
        }
      }
    )
  }, [key, identity, history, refreshToken, retryToken])
  const retry = useCallback(() => setRetryToken((token) => token + 1), [])
  return { state: state.key === key ? state.value : { kind: 'loading' }, retry }
}
