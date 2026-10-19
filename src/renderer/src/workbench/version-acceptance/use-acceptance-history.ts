import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MetricScope } from '../../../../shared/workbench/metrics'
import type {
  VersionHistoryPlan,
  VersionHistoryPort,
  VersionHistorySource
} from '../../../../shared/workbench/version-history'
import {
  AcceptanceMaterialSchema,
  PlanningProgressSourceSchema,
  type AcceptanceMaterial,
  type AcceptanceRound
} from '../../../../shared/workbench/version-material'
import { assertFixedPlan } from './acceptance-model'
import { acceptanceRoundState } from '../../../../shared/workbench/acceptance-rounds'
import {
  readAcceptanceHistorySelection,
  writeAcceptanceHistorySelection
} from '../cycle-view-state'

export type AcceptanceHistoryChoice = {
  key: string
  label: string
  source?: VersionHistorySource
  legacyRound?: AcceptanceRound
}

/** One selection supplies the whole sheet, including guidance, sources and minutes. */
export function useAcceptanceHistory(input: {
  history: VersionHistoryPort
  scope: MetricScope
  document: AcceptanceMaterial | undefined
  plan: VersionHistoryPlan | null
  selectedVersion?: string | null
  runtimeOwnerEnvironmentId?: string
  refreshToken?: number
}) {
  const { history, scope, document, plan, refreshToken, runtimeOwnerEnvironmentId } = input
  const version = document?.version ?? input.selectedVersion ?? undefined
  const roundState = document ? acceptanceRoundState(document) : null
  const [selection, setSelection] = useState(() => ({
    version,
    key: readAcceptanceHistorySelection(scope, version, runtimeOwnerEnvironmentId)
  }))
  const key =
    selection.version === version
      ? selection.key
      : readAcceptanceHistorySelection(scope, version, runtimeOwnerEnvironmentId)
  const fixedSource = useMemo(() => {
    if (!key.startsWith('fixed:')) {
      return null
    }
    try {
      const parsed = PlanningProgressSourceSchema.safeParse(JSON.parse(key.slice(6)))
      return parsed.success && parsed.data.version === version ? parsed.data : null
    } catch {
      return null
    }
  }, [key, version])
  const [reload, setReload] = useState(0)
  const [catalog, setCatalog] = useState<{
    version: string
    records: VersionHistorySource[]
    error: string | null
  } | null>(null)
  const roundsKey = JSON.stringify(document?.results.map((result) => result.rounds ?? []))
  useEffect(() => {
    if (!version) {
      return
    }
    let active = true
    void history
      .list({ scope, source: 'cycle', version, workflow: 'acceptance', allRevisions: true })
      .then((value) => {
        if (active) {
          setCatalog({
            version,
            records: value.records,
            error: value.problems.map((item) => item.message).join('；') || null
          })
        }
      })
      .catch((reason) => {
        if (active) {
          setCatalog({ version, records: [], error: String(reason) })
        }
      })
    return () => {
      active = false
    }
  }, [history, scope, version, roundsKey, refreshToken, reload])
  const choices = useMemo(() => {
    const result: AcceptanceHistoryChoice[] = fixedSource
      ? [
          {
            key,
            label: `验收依据 ${fixedSource.version} · ${fixedSource.sourceCommit.slice(0, 7)}`,
            source: { ...fixedSource, workflow: 'acceptance', committedAt: '' }
          }
        ]
      : []
    const state = document ? acceptanceRoundState(document) : null
    const rounds =
      state?.kind === 'conflict'
        ? []
        : (document?.results.flatMap((item) => item.rounds ?? []) ?? [])
    const seen = new Set(state?.current ? [state.current.id] : [])
    const catalogRounds = new Set(seen)
    const legacyRoundIds = new Set<string>()
    const sourceIdentity = (source: { sourceCommit: string; revision: string }) =>
      JSON.stringify([source.sourceCommit, source.revision])
    const seenSources = new Set(fixedSource ? [sourceIdentity(fixedSource)] : [])
    for (const round of rounds) {
      if (!round.closedAt || seen.has(round.id)) {
        continue
      }
      seen.add(round.id)
      if (round.sourceCommit && round.sourceRevision) {
        catalogRounds.add(round.id)
        const identity = sourceIdentity({
          sourceCommit: round.sourceCommit,
          revision: round.sourceRevision
        })
        if (seenSources.has(identity)) {
          continue
        }
        seenSources.add(identity)
      } else {
        legacyRoundIds.add(round.id)
      }
      const label = `${round.week} · ${round.kind === 'final' ? '验收' : '进展'}`
      result.push({
        key: `round:${round.id}`,
        label,
        ...(round.sourceCommit && round.sourceRevision
          ? {
              source: {
                version: document!.version,
                cycleId: document!.cycleId,
                workflow: 'acceptance' as const,
                sourceCommit: round.sourceCommit,
                revision: round.sourceRevision,
                committedAt: round.closedAt,
                roundId: round.id,
                week: round.week,
                roundKind: round.kind
              }
            }
          : { legacyRound: round })
      })
    }
    for (const source of catalog && catalog.version === version ? catalog.records : []) {
      if (source.roundId && catalogRounds.has(source.roundId)) {
        continue
      }
      if (source.roundId) {
        catalogRounds.add(source.roundId)
      }
      const identity = sourceIdentity(source)
      if (seenSources.has(identity)) {
        continue
      }
      seenSources.add(identity)
      result.push({
        key: `git:${source.sourceCommit}:${source.revision}`,
        source,
        label:
          source.week && !legacyRoundIds.has(source.roundId ?? '')
            ? `${source.week} · ${source.roundKind === 'final' ? '验收' : '进展'}`
            : `提交历史 ${source.committedAt} · ${source.sourceCommit.slice(0, 7)}`
      })
    }
    return result
  }, [document, catalog, version, fixedSource, key])
  const choice = choices.find((item) => item.key === key)
  const source = choice?.source
  const sourceKey = JSON.stringify(source)
  const [loaded, setLoaded] = useState<{
    key: string
    document?: AcceptanceMaterial
    plan?: VersionHistoryPlan
    error?: string
  } | null>(null)
  useEffect(() => {
    if (!source) {
      return
    }
    let active = true
    void (async () => {
      const value = await history.read({
        scope,
        source: fixedSource ? 'trunk' : 'cycle',
        workflow: 'acceptance',
        version: source.version,
        cycleId: source.cycleId,
        sourceCommit: source.sourceCommit,
        expectedRevision: source.revision
      })
      const snapshot = AcceptanceMaterialSchema.parse(value.document)
      if (
        value.sourceCommit !== source.sourceCommit ||
        value.revision !== source.revision ||
        snapshot.version !== source.version ||
        snapshot.cycleId !== source.cycleId
      ) {
        throw new Error('验收依据的版本、周期或修订不一致，未改读当前材料。')
      }
      const fixed = await history.readPlan({ scope, planRef: snapshot.planRef })
      assertFixedPlan(snapshot.planRef, fixed)
      if (active) {
        setLoaded({ key: sourceKey, document: snapshot, plan: fixed })
      }
    })().catch((reason) => {
      if (active) {
        setLoaded({ key: sourceKey, error: String(reason) })
      }
    })
    return () => {
      active = false
    }
  }, [history, scope, source, sourceKey, fixedSource])
  const selected = loaded?.key === sourceKey ? loaded : null
  const historical = key !== 'current'
  return {
    key,
    historical,
    choices,
    currentWeek: roundState?.current?.week,
    locked:
      roundState?.kind === 'conflict' || (roundState?.kind === 'ready' && !roundState.current),
    legacyRound: choice?.legacyRound,
    document: historical ? selected?.document : document,
    plan: historical ? (selected?.plan ?? null) : plan,
    loading: historical && Boolean(source) && !selected,
    error:
      (!historical ? roundState?.reason : null) ??
      selected?.error ??
      (historical && !choice ? '所选历史材料暂不可读，请返回当前轮后重试。' : null),
    catalogError: catalog?.version === version ? catalog?.error : null,
    select: (value: string) => {
      setSelection({ version, key: value })
      try {
        if (version) {
          writeAcceptanceHistorySelection(scope, version, value, runtimeOwnerEnvironmentId)
        }
      } catch {
        /* In-memory navigation remains available if storage is denied. */
      }
    },
    refresh: useCallback(() => setReload((value) => value + 1), [])
  }
}
