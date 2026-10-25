import React, { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'
import { nativeVersionHistoryPort } from '../version-history-port'
import { useVersionCatalogForRepo } from '../use-version-catalog'
import { nativeWorkspaceScope } from './native-workspace'
import { BoardLines } from '../board-ui'
import {
  DECISION_LABELS,
  WORKFLOW_SCREEN_LABELS,
  goalOrdinal,
  shortCommit
} from '../version-labels'

/**
 * G2 只读回看（P3b，spec「版本级清理」/「版本总览、回看」）：已清理或未准备
 * 的版本没有绑定树与旧固定树，进屏走本视图——读主干已提交材料（固定
 * sourceCommit/revision，历史只读），不建树、不激活会话、不提供任何写入或
 * 人工确认入口（human-guard 字段只呈现状态）。工作树/会话不可用由登记缺失
 * 推导、如实显示；材料缺失或读取失败如实报，不装绿。
 */

type ViewState =
  | { kind: 'loading' }
  | { kind: 'missing'; message: string }
  | { kind: 'plan'; document: PlanningMaterial; sourceCommit: string; committedAt: string }
  | { kind: 'acceptance'; document: AcceptanceMaterial; sourceCommit: string; committedAt: string }

export function VersionReadonlyMaterialView({
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
  const catalogReady = catalog.catalog !== null
  const catalogError = catalog.error
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
          const result = await port.read({
            scope: metricScope,
            source: 'trunk',
            sourceCommit: ref.sourceCommit,
            version,
            cycleId: ref.cycleId,
            workflow: 'acceptance'
          })
          if (!cancelled) {
            setState({
              kind: 'acceptance',
              document: result.document as AcceptanceMaterial,
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
      {state.kind === 'loading' ? <p className="vc-notice">材料读取中…</p> : null}
      {state.kind === 'missing' ? <p className="vc-notice">{state.message}</p> : null}
      {state.kind === 'plan' ? (
        <>
          <section className="vc-readonly-section">
            <h3>进展与风险（当时记录）</h3>
            <BoardLines text={state.document.summary.progress} empty="进展未记录" />
            <BoardLines text={state.document.summary.risks} empty="风险未记录" />
          </section>
          <section className="vc-readonly-section">
            <h3>本版目标（{state.document.goals.length}）</h3>
            {state.document.goals.map((goal, index) => (
              <article key={goal.goalId} className="vc-readonly-goal">
                <h4>
                  {goalOrdinal(index)} · {goal.title || '待明确目标'}
                </h4>
                <p className="vc-readonly-meta">
                  {goal.owner || '负责人待明确'}
                  {goal.deadline ? ` · 计划完成 ${goal.deadline}` : ''}
                  {` · 关联 Issue ${state.document.tasks.filter((task) => task.goalId === goal.goalId).length}`}
                </p>
                <h5>验收标准</h5>
                <BoardLines text={goal.acceptance} />
                {goal.deliverable ? (
                  <>
                    <h5>交付约定</h5>
                    <BoardLines text={goal.deliverable} />
                  </>
                ) : null}
                {goal.metricTargets.length > 0 ? (
                  <p className="vc-readonly-meta">
                    指标承诺：
                    {goal.metricTargets
                      .map((target) => `${target.ref.name} → ${target.target}`)
                      .join('；')}
                  </p>
                ) : null}
              </article>
            ))}
          </section>
          {state.document.minutes ? (
            <section className="vc-readonly-section">
              <h3>
                会议纪要
                {state.document.minutes.confirmed ? (
                  <span className="vc-readonly-badge">人已确认（只读）</span>
                ) : (
                  <span className="vc-readonly-badge">未确认</span>
                )}
              </h3>
              <h5>共识</h5>
              {state.document.minutes.consensus.length > 0 ? (
                <ul>
                  {state.document.minutes.consensus.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="vc-readonly-meta">纪要未记录共识条目</p>
              )}
              <h5>遗留</h5>
              {state.document.minutes.followups.length > 0 ? (
                <ul>
                  {state.document.minutes.followups.map((item) => (
                    <li key={item.id}>
                      {item.text}
                      {item.closed ? <span className="vc-readonly-badge">已闭环</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="vc-readonly-meta">纪要未记录遗留条目</p>
              )}
            </section>
          ) : (
            <section className="vc-readonly-section">
              <h3>会议纪要</h3>
              <p className="vc-readonly-meta">纪要未记录</p>
            </section>
          )}
          <section className="vc-readonly-section">
            <h3>归档 PR</h3>
            {state.document.workflow?.archivePr ? (
              <p className="vc-readonly-meta">
                {state.document.workflow.archivePr.provider} ·{' '}
                {state.document.workflow.archivePr.repository} #
                {state.document.workflow.archivePr.number}
                （合入状态以材料归档事实为准，此处不重复探测）
              </p>
            ) : (
              <p className="vc-readonly-meta">未记录归档 PR</p>
            )}
          </section>
        </>
      ) : null}
      {state.kind === 'acceptance' ? (
        <>
          <section className="vc-readonly-section">
            <h3>
              计划依据：{state.document.planRef.version} ·{' '}
              {state.document.planRef.kind === 'committed'
                ? `已提交 ${shortCommit(state.document.planRef.sourceCommit ?? '')}`
                : '草案预验收'}
            </h3>
          </section>
          <section className="vc-readonly-section">
            <h3>逐目标人工结论（{state.document.results.length}）</h3>
            {state.document.results.map((result, index) => (
              <article key={result.goalId} className="vc-readonly-goal">
                <h4>
                  目标 {index + 1}（{result.goalId}）
                  {result.decision ? (
                    <span className="vc-readonly-badge">
                      {DECISION_LABELS[result.decision.outcome]} · 记录于{' '}
                      {result.decision.recordedAt}
                    </span>
                  ) : (
                    <span className="vc-readonly-badge">结论未记录</span>
                  )}
                </h4>
                {result.progress ? (
                  <>
                    <h5>进展</h5>
                    <BoardLines text={result.progress} />
                  </>
                ) : null}
                <h5>备注</h5>
                <BoardLines text={result.note} empty="未记录" />
                <h5>下一步</h5>
                <BoardLines text={result.nextStep} empty="未记录" />
                <p className="vc-readonly-meta">
                  交付件 {result.deliveries?.length ?? 0} · 轮次 {result.rounds?.length ?? 0} ·
                  会议指导 {result.meetingDirectives?.length ?? 0}
                </p>
              </article>
            ))}
          </section>
          <section className="vc-readonly-section">
            <h3>归档 PR</h3>
            {state.document.workflow?.archivePr ? (
              <p className="vc-readonly-meta">
                {state.document.workflow.archivePr.provider} ·{' '}
                {state.document.workflow.archivePr.repository} #
                {state.document.workflow.archivePr.number}
              </p>
            ) : (
              <p className="vc-readonly-meta">未记录归档 PR</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
