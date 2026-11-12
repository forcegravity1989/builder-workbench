import { useVersionMembership } from './version-cycle/use-version-membership'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScheduledVersion } from '../../../shared/workbench/project-milestones'
import type { VersionCatalogState } from './use-version-catalog'
import { useVersionOverviewMaterials } from './version-overview-materials'
import { nativeTaskReferenceReader } from './native-task-port'
import { cycleTaskRead } from './task-reference-reader'
import {
  milestoneMaterialFacts,
  milestoneIssueFacts,
  milestoneIssueSnapshot,
  milestoneVersionKey,
  type MilestoneVersionFacts,
  type MilestoneFeatureIdentity
} from './milestone-feature-facts'
import { milestoneActualVersions } from './milestone-actual-layout'
const emptyFeatures: MilestoneFeatureIdentity[] = []

type IssueRead = {
  key: string
  features: MilestoneFeatureIdentity[]
  identityFailures?: MilestoneVersionFacts['identityFailures']
  failed: boolean
  loading: boolean
  readAt?: string
}

/** The native task cache supplies identity only; SDLC/PR evidence is not a delivery prerequisite. */
function useMilestoneIssues(
  catalog: VersionCatalogState,
  plan: MilestoneVersionFacts['plan'],
  acceptance: MilestoneVersionFacts['acceptance'],
  refreshToken: number
): IssueRead {
  const scope = catalog.scope
  const references = (plan?.tasks ?? []).filter((reference) => {
    const snapshot = milestoneIssueSnapshot(reference, acceptance)
    return !snapshot || snapshot.labels?.includes('特性')
  })
  const key = JSON.stringify([
    scope,
    plan?.tasks,
    acceptance?.taskSnapshot,
    scope ? nativeTaskReferenceReader.key(scope, references) : null
  ])
  const archived = useMemo(() => milestoneIssueFacts(plan, acceptance, []), [plan, acceptance])
  const [state, setState] = useState<IssueRead>({
    key: '',
    features: [],
    failed: false,
    loading: false
  })
  useEffect(() => {
    if (!scope || !plan) {
      return
    }
    let active = true
    setState((previous) => ({
      key,
      features: previous.key === key ? previous.features : archived.features,
      identityFailures:
        previous.key === key ? previous.identityFailures : archived.identityFailures,
      failed: previous.key === key ? previous.failed : archived.failed,
      loading: true
    }))
    void nativeTaskReferenceReader.read(scope, references, refreshToken > 0).then(
      (values) => {
        if (!active) {
          return
        }
        const reads = values.map((value, index) => {
          const read = cycleTaskRead(references[index]!, value)
          return read.kind === 'ready' &&
            value.kind !== 'unavailable' &&
            value.item.type !== 'issue'
            ? { ...read, task: { ...read.task, labels: [] } }
            : read
        })
        setState({
          key,
          ...milestoneIssueFacts(plan, acceptance, reads),
          loading: false,
          readAt: values.map((value) => value.readAt).sort()[0]
        })
      },
      () => {
        if (active) {
          setState({ key, ...archived, loading: false })
        }
      }
    )
    return () => {
      active = false
    }
    // The native source key and serialized references cover host routing and plan membership.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshToken])
  return state.key === key
    ? state
    : { key, ...archived, loading: Boolean(plan && references.length) }
}

function VersionReader({
  catalog,
  version,
  refreshToken,
  receive
}: {
  catalog: VersionCatalogState
  version: ScheduledVersion
  refreshToken: number
  receive(key: string, facts: MilestoneVersionFacts): void
}) {
  const materials = useVersionOverviewMaterials({ catalog, version: version.version, refreshToken })
  const { plan: document, formalPlan, acceptance } = milestoneMaterialFacts(materials)
  const membership = useVersionMembership(catalog.scope, document)
  const plan = useMemo(
    () => (document ? { ...document, tasks: membership.references ?? [] } : null),
    [document, membership.references]
  )
  const refreshMembership = membership.refresh
  useEffect(() => {
    if (refreshToken > 0) {
      void refreshMembership()
    }
  }, [refreshToken, refreshMembership])
  const issues = useMilestoneIssues(catalog, formalPlan ? plan : null, acceptance, refreshToken)
  const materialFailed = Boolean(
    materials.problems?.length ||
    materials.plan.kind === 'error' ||
    materials.acceptance.kind === 'error'
  )
  const failed = materialFailed || issues.failed || Boolean(membership.error)
  const loading = Boolean(
    materials.refreshing ||
    materials.plan.kind === 'loading' ||
    materials.acceptance.kind === 'loading' ||
    membership.busy ||
    issues.loading
  )
  const stale = (!materialFailed || materials.stale === true) && !issues.failed && failed
  const readAt = [materials.readAt, issues.readAt]
    .filter((at): at is string => Boolean(at))
    .sort()[0]
  const items = issues.features
  const identityFailures = materialFailed ? undefined : issues.identityFailures
  const value = useMemo(
    () => ({
      plan,
      formalPlan,
      acceptance,
      features: items,
      identityFailures,
      failed,
      loading,
      stale,
      readAt
    }),
    [plan, formalPlan, acceptance, items, identityFailures, failed, loading, stale, readAt]
  )
  const key = milestoneVersionKey(version)
  useEffect(() => receive(key, value), [key, value, receive])
  return null
}

/** Reuse version-screen caches for every formal version, including unscheduled carry-over. */
export function useMilestoneFactReaders(catalog: VersionCatalogState) {
  const versions = (catalog.catalog?.entries ?? []).flatMap((entry): ScheduledVersion[] => {
    const ref = entry.material.plan ?? entry.material.acceptance
    return ref ? [{ version: entry.version, cycleId: ref.cycleId }] : []
  })
  const context = JSON.stringify([catalog.scope, catalog.home?.id])
  const current = useRef(context)
  current.current = context
  const [snapshot, setSnapshot] = useState<{
    context: string
    values: Record<string, MilestoneVersionFacts>
  }>({ context, values: {} })
  const [refreshToken, setRefreshToken] = useState(0)
  const receive = useCallback(
    (key: string, value: MilestoneVersionFacts) => {
      if (current.current !== context) {
        return
      }
      setSnapshot((previous) => {
        if (previous.context === context && previous.values[key] === value) {
          return previous
        }
        return {
          context,
          values: { ...(previous.context === context ? previous.values : {}), [key]: value }
        }
      })
    },
    [context]
  )
  const currentValues = snapshot.context === context ? snapshot.values : {}
  const reads = versions.map((version) => currentValues[milestoneVersionKey(version)])
  const values: Record<string, MilestoneVersionFacts> = Object.fromEntries(
    versions.map((version) => {
      const read = currentValues[milestoneVersionKey(version)]
      return [
        milestoneVersionKey(read?.plan ?? version),
        read
          ? { ...read, version }
          : {
              version,
              plan: null,
              formalPlan: false,
              acceptance: null,
              features: emptyFeatures,
              loading: true,
              failed: false,
              stale: false
            }
      ]
    })
  )
  return {
    values,
    versions: milestoneActualVersions(values),
    loading:
      (catalog.loading && !catalog.materialReady) || reads.some((read) => !read || read.loading),
    failed: Boolean(catalog.materialError) || reads.some((read) => read?.failed),
    readAt: reads
      .filter((read) => read && (!read.failed || read.stale))
      .map((read) => read?.readAt)
      .filter((at): at is string => Boolean(at))
      .sort()[0],
    refresh() {
      setRefreshToken((n) => n + 1)
      catalog.reload()
    },
    readers: versions.map((version) => (
      <VersionReader
        key={`${context}:${milestoneVersionKey(version)}`}
        catalog={catalog}
        version={version}
        refreshToken={refreshToken}
        receive={receive}
      />
    ))
  }
}
