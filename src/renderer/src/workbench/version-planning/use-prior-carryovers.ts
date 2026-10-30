import { useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import { collectVersionCatalogWorkspaces } from '../../../../shared/workbench/version-catalog'
import { selectPriorVersionSource } from '../../../../shared/workbench/prior-version-source'
import type {
  AcceptanceMaterial,
  PlanningMaterial,
  PlanningProgressSource as ProgressSource,
  VersionTaskSnapshot
} from '../../../../shared/workbench/version-material'
import type { CycleScope, CycleTaskReference, CycleTaskSnapshot } from '../version-cycle/ports'
import {
  isClosedIssueState,
  issueKey,
  issueMarkFor
} from '../version-acceptance/acceptance-issue-annotations'
import { nativeVersionHistoryPort } from '../version-history-port'
import { readPlanningProgressSource } from '../../../../shared/workbench/planning-progress-source'
import { createSnapshotCache, useSnapshotCache } from '../snapshot-cache'

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
      // Keep the human mark in history, but a closed frozen Issue is no longer deferred work.
      if (ready && isClosedIssueState(ready.state)) {
        continue
      }
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
  | { kind: 'none' }
  | { kind: 'missing'; version: string }
  | { kind: 'ready'; source: ProgressSource; carryovers: PriorCarryovers }
  | { kind: 'error'; reason: string }

const priorCache = createSnapshotCache<PriorReviewState>(() => ({ kind: 'idle' }))

type Identity = [
  { repoId: string; hostId: string; runtimeOwnerEnvironmentId?: string } | null,
  string | null,
  ProgressSource | null,
  string | null,
  string[]
]

/**
 * Stored fixed sources always win. Without one, locate the adjacent catalog
 * version first, including versions represented only by a bound working tree.
 * Read failures remain diagnostics; they never become empty successful results.
 */
export function usePriorCarryovers(
  scope: CycleScope | null,
  worktreeId: string | null,
  source: ProgressSource | undefined,
  refreshToken?: number,
  version?: string | null
): { state: PriorReviewState } {
  const worktreesByRepo = useAppStore((state) => state.worktreesByRepo)
  const detectedWorktreesByRepo = useAppStore((state) => state.detectedWorktreesByRepo)
  const knownVersions =
    scope && !source
      ? collectVersionCatalogWorkspaces(
          [
            ...(worktreesByRepo[scope.repoId] ?? []),
            ...(detectedWorktreesByRepo[scope.repoId]?.worktrees ?? [])
          ],
          [scope.repoId],
          scope.projectId
        ).map((tree) => tree.binding.version)
      : []
  const key = JSON.stringify([
    scope
      ? {
          repoId: scope.repoId,
          hostId: scope.hostId,
          runtimeOwnerEnvironmentId: scope.runtimeOwnerEnvironmentId
        }
      : null,
    worktreeId,
    source ?? null,
    source ? null : (version ?? null),
    [...new Set(knownVersions)].sort()
  ])
  const identity = useMemo(() => JSON.parse(key) as Identity, [key])
  const history = useMemo(
    () => nativeVersionHistoryPort(identity[0]?.runtimeOwnerEnvironmentId),
    [identity]
  )
  const entry = useMemo(() => priorCache(key), [key])
  const state = useSnapshotCache(entry)
  const lastRefresh = useRef({ key, refreshToken })
  useEffect(() => {
    const force =
      lastRefresh.current.key === key && lastRefresh.current.refreshToken !== refreshToken
    lastRefresh.current = { key, refreshToken }
    const [scopePart, treeId, sourcePart, selectedVersion, versions] = identity
    if (!scopePart || !treeId || (!sourcePart && !selectedVersion)) {
      return
    }
    if (!force && entry.read().kind === 'ready') {
      return
    }
    const read = async (): Promise<PriorReviewState> => {
      const readScope = { repoId: scopePart.repoId, hostId: scopePart.hostId, worktreeId: treeId }
      let fixed = sourcePart
      if (!fixed) {
        const catalog = await history.list({ scope: readScope, currentOnly: true })
        const prior = selectPriorVersionSource(selectedVersion!, catalog, versions)
        if (prior.kind !== 'source') {
          return prior
        }
        fixed = prior.source
      }
      const documents = await readPlanningProgressSource(history, readScope, fixed)
      const value: PriorReviewState = {
        kind: 'ready',
        source: fixed,
        carryovers: derivePriorCarryovers(documents.acceptance, documents.plan)
      }
      // Automatic adoption adds progressSource to the plan; it is the same
      // verified source, so the new explicit-reference key can reuse the result.
      priorCache(JSON.stringify([scopePart, treeId, fixed, null, []])).publish(value)
      return value
    }
    const run = () => {
      if (entry.read().kind !== 'ready') {
        entry.publish({ kind: 'loading' })
      }
      const pending = read()
        .then(
          (value) => entry.publish(value),
          (reason: unknown) =>
            entry.publish({
              kind: 'error',
              reason: reason instanceof Error ? reason.message : String(reason)
            })
        )
        .finally(() => {
          if (entry.pending === pending) {
            entry.pending = null
          }
        })
      entry.pending = pending
      return pending
    }
    if (!entry.pending) {
      void run()
    } else if (force) {
      void entry.pending.then(run, run)
    }
  }, [key, identity, history, refreshToken, entry])
  return { state }
}
