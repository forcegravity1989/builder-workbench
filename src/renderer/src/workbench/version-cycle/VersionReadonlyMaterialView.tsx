import React, { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'
import { nativeVersionHistoryPort } from '../version-history-port'
import { useVersionCatalogForRepo } from '../use-version-catalog'
import { nativeWorkspaceScope } from './native-workspace'
import { BoardActionButton } from '../board-ui'
import type { FixedAcceptanceBrowse } from '../cycle-view-state'
import { returnFromAcceptanceSource } from './open-acceptance-source'
import { readPlanningProgressSource } from '../version-planning/planning-progress-source'
import { WORKFLOW_SCREEN_LABELS, shortCommit } from '../version-labels'
import { ReadonlyMaterialSections, type ViewState } from './ReadonlyMaterialSections'

/**
 * 历史版本按目录读取固定提交；计划的验收入口直接显示已核验的固定快照。
 * 两条入口共用只读正文，不建树、不改材料选择、不提供人工确认或写入入口。
 */

export function VersionReadonlyMaterialView({
  fixedAcceptance,
  ...props
}: {
  workflow: VersionWorkflow
  version: string
  fixedAcceptance?: FixedAcceptanceBrowse
}): React.JSX.Element {
  return fixedAcceptance ? (
    <FixedAcceptanceMaterialView
      key={JSON.stringify([
        fixedAcceptance.scope,
        fixedAcceptance.originWorktreeId,
        fixedAcceptance.originWorktreeInstanceId,
        fixedAcceptance.originExecutionHostId,
        fixedAcceptance.originPlan,
        fixedAcceptance.source
      ])}
      view={fixedAcceptance}
    />
  ) : (
    <CatalogReadonlyMaterialView {...props} />
  )
}

function FixedAcceptanceMaterialView({ view }: { view: FixedAcceptanceBrowse }): React.JSX.Element {
  const [notice, setNotice] = useState<string | null>(null)
  return (
    <div className="vc-readonly">
      <BoardActionButton
        onClick={() => {
          try {
            returnFromAcceptanceSource(view)
          } catch (reason) {
            setNotice(reason instanceof Error ? reason.message : String(reason))
          }
        }}
      >
        返回计划
      </BoardActionButton>
      <p role="note" className="vc-notice">
        只读回看 {view.source.version} · 验收 · 固定来源 {shortCommit(view.source.sourceCommit)}
      </p>
      {notice ? (
        <p role="status" className="vc-notice">
          {notice}
        </p>
      ) : null}
      <ReadonlyMaterialSections
        state={{
          kind: 'acceptance',
          document: view.acceptance,
          plan: view.plan,
          sourceCommit: view.source.sourceCommit
        }}
      />
    </div>
  )
}

function CatalogReadonlyMaterialView({
  workflow,
  version
}: {
  workflow: VersionWorkflow
  version: string
}): React.JSX.Element {
  const repoId = useAppStore((s) => s.activeRepoId ?? s.repos[0]?.id ?? null)
  const trees = useAppStore((s) => (repoId ? s.worktreesByRepo[repoId] : undefined))
  const home = useMemo(
    () => trees?.find((tree) => tree.isMainWorktree) ?? trees?.[0] ?? null,
    [trees]
  )
  const catalog = useVersionCatalogForRepo(repoId)
  const entry = useMemo(
    () => catalog.catalog?.entries.find((item) => item.version === version) ?? null,
    [catalog.catalog, version]
  )
  const [state, setState] = useState<ViewState>({ kind: 'loading' })

  const ref = workflow === 'plan' ? entry?.material.plan : entry?.material.acceptance
  const refKey = ref ? `${ref.sourceCommit}:${ref.revision}` : null
  const catalogReady = catalog.materialReady
  const catalogError = catalog.materialError ?? catalog.error
  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    if (!repoId || !home) {
      setState({ kind: 'missing', message: '项目工作区尚未就绪，无法读取主干材料。' })
      return
    }
    if (!ref || !refKey) {
      if (!catalogReady && !catalogError) {
        // 目录装载中不落判「无材料」（未成立的否定断言）；就绪后本 effect 重跑再判。
        return
      }
      setState({
        kind: 'missing',
        message: catalogError
          ? `版本目录读取失败：${catalogError}`
          : workflow === 'plan'
            ? `主干没有 ${version} 的已提交计划材料（版本可能从未归档）。`
            : `主干没有 ${version} 的已提交验收材料（验收可能从未归档）。`
      })
      return
    }
    void (async () => {
      try {
        const scope = nativeWorkspaceScope(home)
        const port = nativeVersionHistoryPort(home.runtimeOwnerEnvironmentId)
        const metricScope = { repoId: scope.repoId, worktreeId: home.id, hostId: scope.hostId }
        if (workflow === 'plan') {
          const plan = await port.readPlan({
            scope: metricScope,
            planRef: {
              kind: 'committed',
              version,
              cycleId: ref.cycleId,
              revision: ref.revision,
              sourceCommit: ref.sourceCommit
            }
          })
          if (!cancelled) {
            setState({
              kind: 'plan',
              document: plan.document,
              sourceCommit: ref.sourceCommit,
              committedAt: ref.committedAt
            })
          }
        } else {
          const documents = await readPlanningProgressSource(port, metricScope, {
            sourceCommit: ref.sourceCommit,
            revision: ref.revision,
            version,
            cycleId: ref.cycleId
          })
          if (!cancelled) {
            setState({
              kind: 'acceptance',
              document: documents.acceptance,
              plan: documents.plan,
              sourceCommit: ref.sourceCommit,
              committedAt: ref.committedAt
            })
          }
        }
      } catch (reason) {
        if (!cancelled) {
          setState({
            kind: 'missing',
            message: `主干材料读取失败：${reason instanceof Error ? reason.message : String(reason)}`
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // refKey 固定来源变化才重读；entry 对象每轮目录刷新都是新引用，不进依赖，
    // 目录就绪/失败以稳定布尔与文本进依赖（装载中→就绪的重判靠它们触发）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId, home, workflow, version, refKey, catalogReady, catalogError])

  const workflowLabel = WORKFLOW_SCREEN_LABELS[workflow]
  const liveWorkspaces = entry?.workspaces.length ?? 0
  return (
    <div className="vc-readonly">
      <p role="note" className="vc-notice">
        只读回看 {version} · {workflowLabel}：本版没有绑定工作区
        {liveWorkspaces === 0 ? '（登记缺失，工作树/会话不可用）' : ''}
        ，读取主干已提交材料
        {state.kind === 'plan' || state.kind === 'acceptance'
          ? `（来源 ${shortCommit(state.sourceCommit)}，提交于 ${state.committedAt}）`
          : ''}
        。编辑或发起会话请先在版本行「初始化工作区」。
      </p>
      <ReadonlyMaterialSections state={state} />
    </div>
  )
}
