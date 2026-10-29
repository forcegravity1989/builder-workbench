import { useEffect, useRef, useState } from 'react'
import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../shared/workbench/version-material'
import type { ArchivePrStatusResult } from '../../../shared/workbench/archive-pr-status'
import type { VersionCatalogState } from './use-version-catalog'
import { nativeVersionHistoryPort } from './version-history-port'
import { nativeArchivePrPort } from './archive-pr-port'
import { loadVersionPlanDocument } from './version-task-entries'
import { validTime } from './version-overview/feature-model'
import {
  materialCache,
  materialGenerations,
  retainMaterialRead,
  materialReadMessage as message
} from './version-overview/material-cache'
import { findVersionFlowWorktrees } from '../../../shared/workbench/version-workspace-match'
import { nativeWorkspaceScope } from './version-cycle/native-workspace'
import { nativeVersionMaterialPort } from './version-material-port'
import { AcceptanceMaterialSchema } from '../../../shared/workbench/version-material'

export type OverviewDocument<T> =
  | { kind: 'loading' }
  | {
      kind: 'ready'
      document: T
      source: 'committed' | 'draft'
      sourceCommit?: string
      acceptedAt?: string
      revision?: string
    }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }
export type VersionOverviewMaterials = {
  plan: OverviewDocument<PlanningMaterial>
  acceptance: OverviewDocument<AcceptanceMaterial>
  prStatuses: { plan: ArchivePrStatusResult | null; acceptance: ArchivePrStatusResult | null }
  readAt?: string
  refreshing?: boolean
  problems?: string[]
}
const loading = (): VersionOverviewMaterials => ({
  plan: { kind: 'loading' },
  acceptance: { kind: 'loading' },
  prStatuses: { plan: null, acceptance: null }
})
/** Formal acceptance pins the plan. A draft is read only when no formal plan exists. */
export function useVersionOverviewMaterials({
  catalog,
  version,
  refreshToken
}: {
  catalog: VersionCatalogState
  version: string
  refreshToken: number
}): VersionOverviewMaterials {
  const entry = catalog.catalog?.entries.find((e) => e.version === version)
  const lastRefresh = useRef(refreshToken)
  const sourceKey = JSON.stringify([
    catalog.scope,
    catalog.home?.id,
    version,
    entry?.material,
    entry?.draft,
    catalog.planTrees,
    catalog.worktrees.map((tree) => [
      tree.id,
      tree.hostId,
      tree.runtimeOwnerEnvironmentId,
      tree.workbenchVersionBinding
    ])
  ])
  const key = JSON.stringify([
    refreshToken,
    catalog.loading,
    catalog.scope,
    catalog.home?.id,
    version,
    entry?.material,
    entry?.draft,
    catalog.materialReady,
    catalog.materialError,
    catalog.error,
    catalog.planTrees,
    catalog.worktrees.map((tree) => [
      tree.id,
      tree.hostId,
      tree.runtimeOwnerEnvironmentId,
      tree.workbenchVersionBinding
    ])
  ])
  const [state, setState] = useState<{ key: string; value: VersionOverviewMaterials }>(() => ({
    key: '',
    value: loading()
  }))
  useEffect(() => {
    let cancelled = false
    const generation = (materialGenerations.get(sourceKey) ?? 0) + 1
    materialGenerations.set(sourceKey, generation)
    const publish = (value: VersionOverviewMaterials) => {
      if (!cancelled && materialGenerations.get(sourceKey) === generation) {
        const next = retainMaterialRead(value, materialCache.get(sourceKey))
        if (
          !next.refreshing &&
          next.plan.kind !== 'loading' &&
          next.acceptance.kind !== 'loading'
        ) {
          materialCache.set(sourceKey, next)
        }
        setState({ key, value: next })
      }
    }
    const result = loading()
    const failure = catalog.materialError ?? catalog.error
    if (!failure && catalog.loading) {
      return () => {
        cancelled = true
      }
    }
    const force = lastRefresh.current !== refreshToken
    lastRefresh.current = refreshToken
    if (!force && materialCache.has(sourceKey) && !failure) {
      setState({ key, value: materialCache.get(sourceKey)! })
      return () => {
        cancelled = true
      }
    }
    if (failure || !catalog.scope || !catalog.home) {
      const error = { kind: 'error' as const, message: failure ?? '项目工作区尚未就绪' }
      publish({ ...result, plan: error, acceptance: error })
      return () => {
        cancelled = true
      }
    }
    const scope = {
      repoId: catalog.scope.repoId,
      worktreeId: catalog.home.id,
      hostId: catalog.scope.hostId
    }
    const history = nativeVersionHistoryPort(catalog.scope.runtimeOwnerEnvironmentId)
    const archive = nativeArchivePrPort(catalog.scope.runtimeOwnerEnvironmentId)
    void (async () => {
      const acceptanceRef = entry?.material.acceptance
      const planRef = entry?.material.plan
      try {
        if (acceptanceRef) {
          const read = await history.read({
            scope,
            source: 'trunk',
            sourceCommit: acceptanceRef.sourceCommit,
            version,
            cycleId: acceptanceRef.cycleId,
            workflow: 'acceptance'
          })
          result.acceptance = {
            kind: 'ready',
            document: read.document as AcceptanceMaterial,
            source: 'committed',
            sourceCommit: acceptanceRef.sourceCommit
          }
        } else {
          const trees = findVersionFlowWorktrees(catalog.worktrees, {
            version,
            workflow: 'acceptance'
          })
          if (trees.length > 1) {
            throw new Error('有多个验收工作区，请从验收入口核对来源')
          }
          if (trees[0]) {
            const owner = nativeWorkspaceScope(trees[0])
            const draft = await nativeVersionMaterialPort(
              {
                repoId: owner.repoId,
                worktreeId: trees[0].id,
                hostId: owner.hostId,
                workflow: 'acceptance'
              },
              owner.runtimeOwnerEnvironmentId
            ).read(version)
            result.acceptance = draft
              ? {
                  kind: 'ready',
                  document: AcceptanceMaterialSchema.parse(draft.document),
                  source: 'draft'
                }
              : { kind: 'missing' }
          } else {
            result.acceptance = { kind: 'missing' }
          }
        }
      } catch (error) {
        result.acceptance = { kind: 'error', message: `验收读取失败：${message(error)}` }
      }
      try {
        if (result.acceptance.kind === 'error' && acceptanceRef) {
          throw new Error('无法核对验收对应的固定计划，请重试验收读取')
        }
        const fixed =
          result.acceptance.kind === 'ready' && result.acceptance.source === 'committed'
            ? result.acceptance.document.planRef
            : planRef
              ? {
                  kind: 'committed' as const,
                  version,
                  cycleId: planRef.cycleId,
                  sourceCommit: planRef.sourceCommit,
                  revision: planRef.revision
                }
              : null
        if (fixed) {
          const read = await history.readPlan({ scope, planRef: fixed })
          result.plan = {
            kind: 'ready',
            document: read.document,
            revision: read.revision,
            source: fixed.kind === 'committed' ? 'committed' : 'draft',
            ...(fixed.kind === 'committed' ? { sourceCommit: fixed.sourceCommit } : {})
          }
        } else {
          if (
            findVersionFlowWorktrees(catalog.worktrees, { version, workflow: 'plan' }).length > 1
          ) {
            throw new Error('有多个计划工作区，请从计划入口核对来源')
          }
          const read = await loadVersionPlanDocument({
            scope: catalog.scope!,
            homeWorktreeId: catalog.home!.id,
            version,
            entry,
            planTrees: catalog.planTrees
          })
          if (read.document) {
            result.plan = {
              kind: 'ready',
              document: read.document,
              source: read.source === 'draft' ? 'draft' : 'committed',
              revision: read.revision
            }
          } else if (entry?.draft || entry?.problems.length || !read.missing) {
            result.plan = { kind: 'error', message: read.problem ?? '计划来源读取失败' }
          } else {
            result.plan = { kind: 'missing' }
          }
        }
      } catch (error) {
        result.plan = { kind: 'error', message: `计划读取失败：${message(error)}` }
      }
      if (
        result.acceptance.kind === 'ready' &&
        result.acceptance.source === 'draft' &&
        result.plan.kind === 'ready' &&
        result.acceptance.document.planRef.revision !== result.plan.revision
      ) {
        result.acceptance = {
          kind: 'error',
          message: '验收工作稿引用的计划与当前计划不一致，请从验收入口核对；原记录未修改。'
        }
      }
      publish({ ...result })
      await Promise.all(
        (['plan', 'acceptance'] as const).map(async (kind) => {
          const doc = result[kind]
          const pr = doc.kind === 'ready' ? doc.document.workflow?.archivePr : null
          if (!pr) {
            return
          }
          try {
            const status = await archive.readStatus(scope, pr, refreshToken > 0)
            result.prStatuses[kind] = status
            if (
              kind === 'acceptance' &&
              result.acceptance.kind === 'ready' &&
              status.state === 'merged' &&
              validTime(status.mergedAt)
            ) {
              result.acceptance = { ...result.acceptance, acceptedAt: status.mergedAt }
            }
          } catch {
            result.prStatuses[kind] = { state: 'unknown', reason: '归档 PR 读取失败' }
          }
        })
      )
      publish({ ...result, prStatuses: { ...result.prStatuses } })
    })()
    return () => {
      cancelled = true
    }
    // The key covers source revisions and owner routing; object identity is not a refresh trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state.key === key
    ? state.value
    : { ...(materialCache.get(sourceKey) ?? loading()), refreshing: true }
}
