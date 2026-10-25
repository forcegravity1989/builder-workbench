import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import type { Worktree } from '../../../shared/worktree/types'
import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../shared/workbench/version-material'
import type { ArchivePrStatusResult } from '../../../shared/workbench/archive-pr-status'
import type { VersionCatalogEntry } from '../../../shared/workbench/version-catalog'
import { nativeVersionHistoryPort } from './version-history-port'
import { nativeArchivePrPort } from './archive-pr-port'
import { nativeWorkspaceScope, type NativeWorkspaceScope } from './version-cycle/native-workspace'

/**
 * G2 版本总览的数据装载（P6，从 version-overview-page 拆出以满足文件行数上限）：
 * 主干已提交材料按目录固定 sourceCommit/revision 只读（history RPC），归档 PR
 * 合入状态按记录引用薄读取、失败保持未知。目录装载中不落判「无材料」（未成立的
 * 否定断言），就绪后重判；读取失败如实透出。铁律：全部派生自数据，杀进程重开
 * 结果一致。
 */

type DocLoad<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; document: T; sourceCommit: string; committedAt: string }
  | { kind: 'missing'; message: string }

export type VersionOverviewMaterials = {
  plan: DocLoad<PlanningMaterial>
  acceptance: DocLoad<AcceptanceMaterial>
  prStatuses: { plan: ArchivePrStatusResult | null; acceptance: ArchivePrStatusResult | null }
}

export function useVersionOverviewMaterials(args: {
  repoId: string
  version: string
  entry: VersionCatalogEntry | null
  catalogReady: boolean
  catalogError: string | null
}): VersionOverviewMaterials {
  const { repoId, version, entry, catalogReady, catalogError } = args
  const trees = useAppStore((s) => s.worktreesByRepo[repoId])
  const home: Worktree | null = trees?.find((tree) => tree.isMainWorktree) ?? trees?.[0] ?? null
  const planRef = entry?.material.plan
  const acceptanceRef = entry?.material.acceptance
  const planRefKey = planRef ? `${planRef.sourceCommit}:${planRef.revision}` : null
  const acceptanceRefKey = acceptanceRef
    ? `${acceptanceRef.sourceCommit}:${acceptanceRef.revision}`
    : null
  const homeId = home?.id ?? null
  const [plan, setPlan] = useState<DocLoad<PlanningMaterial>>({ kind: 'loading' })
  const [acceptance, setAcceptance] = useState<DocLoad<AcceptanceMaterial>>({ kind: 'loading' })
  const [prStatuses, setPrStatuses] = useState<{
    plan: ArchivePrStatusResult | null
    acceptance: ArchivePrStatusResult | null
  }>({ plan: null, acceptance: null })

  useEffect(() => {
    let cancelled = false
    setPlan({ kind: 'loading' })
    setAcceptance({ kind: 'loading' })
    setPrStatuses({ plan: null, acceptance: null })
    if (!home || !homeId) {
      const message = '项目工作区尚未就绪，无法读取主干材料。'
      setPlan({ kind: 'missing', message })
      setAcceptance({ kind: 'missing', message })
      return
    }
    let scope: NativeWorkspaceScope
    try {
      scope = nativeWorkspaceScope(home)
    } catch (reason) {
      // home 行宿主/路由不明确时如实报读取失败，不让异常穿出 effect 打掉整页。
      const message = `项目工作区解析失败：${reason instanceof Error ? reason.message : String(reason)}`
      setPlan({ kind: 'missing', message })
      setAcceptance({ kind: 'missing', message })
      return
    }
    const historyPort = nativeVersionHistoryPort(home.runtimeOwnerEnvironmentId)
    const archivePort = nativeArchivePrPort(home.runtimeOwnerEnvironmentId)
    const metricScope = { repoId: scope.repoId, worktreeId: home.id, hostId: scope.hostId }
    void (async () => {
      if (planRef && planRefKey) {
        try {
          const result = await historyPort.readPlan({
            scope: metricScope,
            planRef: {
              kind: 'committed',
              version,
              cycleId: planRef.cycleId,
              revision: planRef.revision,
              sourceCommit: planRef.sourceCommit
            }
          })
          if (!cancelled) {
            setPlan({
              kind: 'ready',
              document: result.document,
              sourceCommit: planRef.sourceCommit,
              committedAt: planRef.committedAt
            })
            const pr = result.document.workflow?.archivePr
            if (pr) {
              try {
                const status = await archivePort.readStatus(metricScope, pr)
                if (!cancelled) {
                  setPrStatuses((previous) => ({ ...previous, plan: status }))
                }
              } catch {
                // 薄读取失败保持未知，不阻塞页面。
              }
            }
          }
        } catch (reason) {
          if (!cancelled) {
            setPlan({
              kind: 'missing',
              message: `计划材料读取失败：${reason instanceof Error ? reason.message : String(reason)}`
            })
          }
        }
      } else if (!cancelled) {
        // 目录装载中不落判「无材料」（未成立的否定断言）；就绪后重跑再判。
        setPlan(
          catalogReady || catalogError
            ? {
                kind: 'missing',
                message: catalogError
                  ? `版本目录读取失败：${catalogError}`
                  : `主干没有 ${version} 的已提交计划材料。`
              }
            : { kind: 'loading' }
        )
      }
      if (acceptanceRef && acceptanceRefKey) {
        try {
          const result = await historyPort.read({
            scope: metricScope,
            source: 'trunk',
            sourceCommit: acceptanceRef.sourceCommit,
            version,
            cycleId: acceptanceRef.cycleId,
            workflow: 'acceptance'
          })
          if (!cancelled) {
            const document = result.document as AcceptanceMaterial
            setAcceptance({
              kind: 'ready',
              document,
              sourceCommit: acceptanceRef.sourceCommit,
              committedAt: acceptanceRef.committedAt
            })
            const pr = document.workflow?.archivePr
            if (pr) {
              try {
                const status = await archivePort.readStatus(metricScope, pr)
                if (!cancelled) {
                  setPrStatuses((previous) => ({ ...previous, acceptance: status }))
                }
              } catch {
                // 同上：保持未知。
              }
            }
          }
        } catch (reason) {
          if (!cancelled) {
            setAcceptance({
              kind: 'missing',
              message: `验收材料读取失败：${reason instanceof Error ? reason.message : String(reason)}`
            })
          }
        }
      } else if (!cancelled) {
        setAcceptance(
          catalogReady || catalogError
            ? {
                kind: 'missing',
                message: catalogError
                  ? `版本目录读取失败：${catalogError}`
                  : `主干没有 ${version} 的已提交验收材料。`
              }
            : { kind: 'loading' }
        )
      }
    })()
    return () => {
      cancelled = true
    }
    // 固定来源（ref key）变化才重读；entry/home 对象每轮都是新引用，不进依赖，
    // 目录就绪/失败以稳定布尔与文本进依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeId, version, planRefKey, acceptanceRefKey, catalogReady, catalogError])

  return { plan, acceptance, prStatuses }
}
