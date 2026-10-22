import React, { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../shared/workbench/version-material'
import type { ArchivePrStatusResult } from '../../../shared/workbench/archive-pr-status'
import { nativeVersionHistoryPort } from './version-history-port'
import { nativeArchivePrPort } from './archive-pr-port'
import { useVersionCatalogForRepo } from './use-version-catalog'
import { nativeWorkspaceScope } from './version-cycle/native-workspace'
import { navigateVersionWorkflow, openVersionTasks } from './version-nav-actions'
import type { VersionOverviewOptions } from './project-page-state'

/**
 * G2 版本总览（P6，高保真修订 9：最简表格周报风格）：一版一页，从主干已提交
 * 材料＋原生登记现算派生（铁律：杀进程重开数字一致；没数据就是 Unknown）。
 * 计划承诺 / 任务事实 / 人工验收 / 归档与发布 / 遗留分区呈现，互不冒充：
 * 归档 PR 合入状态是按记录引用的薄读取，读不到保持未知；发布证据检索未接入
 * 前如实标注，不猜。在制版本的未合入草稿以计划屏为准，本页只读已提交材料。
 */

type DocLoad<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; document: T; sourceCommit: string; committedAt: string }
  | { kind: 'missing'; message: string }

const DECISION_LABELS = { met: '达成', 'not-met': '未达', pending: '待核' } as const

function shortCommit(commit: string): string {
  return commit.slice(0, 9)
}

function prStatusText(status: ArchivePrStatusResult | null, recorded: boolean): string {
  if (!recorded) {
    return '未记录'
  }
  if (!status) {
    return '状态读取中…'
  }
  switch (status.state) {
    case 'merged':
      return '已合入'
    case 'open':
      return '开放'
    case 'closed':
      return '已关闭（未合入）'
    default:
      return `未知（${status.reason}）`
  }
}

function FactCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md border border-border/60 px-2.5 py-1.5">
      <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span
        className="truncate text-[12.5px]"
        title={typeof children === 'string' ? children : undefined}
      >
        {children}
      </span>
    </div>
  )
}

export function VersionOverviewPage({
  options
}: {
  options: VersionOverviewOptions
}): React.JSX.Element {
  const { repoId, version } = options
  const trees = useAppStore((s) => s.worktreesByRepo[repoId])
  const home = useMemo(
    () => trees?.find((tree) => tree.isMainWorktree) ?? trees?.[0] ?? null,
    [trees]
  )
  const catalog = useVersionCatalogForRepo(repoId)
  const entry = useMemo(
    () => catalog.catalog?.entries.find((item) => item.version === version) ?? null,
    [catalog.catalog, version]
  )
  const planRefKey = entry?.material.plan
    ? `${entry.material.plan.sourceCommit}:${entry.material.plan.revision}`
    : null
  const acceptanceRefKey = entry?.material.acceptance
    ? `${entry.material.acceptance.sourceCommit}:${entry.material.acceptance.revision}`
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
    const scope = nativeWorkspaceScope(home)
    const historyPort = nativeVersionHistoryPort(home.runtimeOwnerEnvironmentId)
    const archivePort = nativeArchivePrPort(home.runtimeOwnerEnvironmentId)
    const metricScope = { repoId: scope.repoId, worktreeId: home.id, hostId: scope.hostId }
    const planRef = entry?.material.plan
    const acceptanceRef = entry?.material.acceptance
    void (async () => {
      if (planRef) {
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
        setPlan({ kind: 'missing', message: `主干没有 ${version} 的已提交计划材料。` })
      }
      if (acceptanceRef) {
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
        setAcceptance({ kind: 'missing', message: `主干没有 ${version} 的已提交验收材料。` })
      }
    })()
    return () => {
      cancelled = true
    }
    // 固定来源（ref key）变化才重读；entry/home 对象每轮都是新引用，不进依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeId, version, planRefKey, acceptanceRefKey])

  const planDocument = plan.kind === 'ready' ? plan.document : null
  const acceptanceDocument = acceptance.kind === 'ready' ? acceptance.document : null
  const workspaceLabels = (entry?.workspaces ?? []).map((workspace) =>
    workspace.binding.workflow === 'plan'
      ? '计划树'
      : workspace.binding.workflow === 'acceptance'
        ? '验收树'
        : workspace.binding.workflow === 'goal'
          ? '目标树'
          : 'Issue 树'
  )
  const minutes = planDocument?.minutes
  const followupsClosed = minutes?.followups.filter((item) => item.closed).length ?? 0
  const openTasks = (goal?: { goalId: string; label: string }) =>
    void openVersionTasks({
      catalog,
      version,
      goal: goal ?? null,
      entry
    })

  return (
    <main className="flex h-full min-w-0 flex-col gap-3 overflow-hidden p-4">
      <header className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-[17px] font-semibold">{version} 版本总览</h1>
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
          {entry?.state === 'working' ? '在制' : '历史'}
        </span>
        <span className="text-[11.5px] text-muted-foreground">
          只读派生自主干已提交材料与原生登记
          {plan.kind === 'ready' ? ` · 计划来源 ${shortCommit(plan.sourceCommit)}` : ''}
          {acceptance.kind === 'ready' ? ` · 验收来源 ${shortCommit(acceptance.sourceCommit)}` : ''}
        </span>
        <span className="ml-auto flex gap-1.5">
          <button
            type="button"
            className="rounded-md border border-border px-2 py-0.5 text-[11.5px] hover:bg-accent"
            onClick={() =>
              navigateVersionWorkflow({ catalog, version, workflow: 'plan', projectKey: repoId })
            }
          >
            计划屏
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-0.5 text-[11.5px] hover:bg-accent"
            onClick={() =>
              navigateVersionWorkflow({
                catalog,
                version,
                workflow: 'acceptance',
                projectKey: repoId
              })
            }
          >
            验收屏
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-0.5 text-[11.5px] hover:bg-accent"
            onClick={() => openTasks()}
          >
            本版任务
          </button>
        </span>
      </header>

      {entry?.draft ? (
        <p className="text-[11.5px] text-muted-foreground" role="note">
          存在未合入草稿：本页读已提交材料，最新草稿以计划屏为准。
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
        <FactCell label="工作区（登记现算）">
          {workspaceLabels.length > 0
            ? `${workspaceLabels.length} 棵存活：${[...new Set(workspaceLabels)].join('、')}`
            : '已清理或未准备（登记缺失）'}
        </FactCell>
        <FactCell label="计划归档 PR">
          {planDocument?.workflow?.archivePr
            ? `#${planDocument.workflow.archivePr.number} · ${prStatusText(prStatuses.plan, true)}`
            : prStatusText(null, false)}
        </FactCell>
        <FactCell label="验收归档 PR">
          {acceptanceDocument?.workflow?.archivePr
            ? `#${acceptanceDocument.workflow.archivePr.number} · ${prStatusText(prStatuses.acceptance, true)}`
            : prStatusText(null, false)}
        </FactCell>
        <FactCell label="发布证据">未探测（发布记录检索未接入，不猜）</FactCell>
        <FactCell label="会议纪要">
          {minutes
            ? `共识 ${minutes.consensus.length} · 遗留 ${followupsClosed}/${minutes.followups.length} 闭环${minutes.confirmed ? ' · 人已确认' : ' · 未确认'}`
            : planDocument
              ? '纪要未记录'
              : '—'}
        </FactCell>
      </div>

      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto rounded-md border border-border/60">
        <table className="w-full border-collapse text-left text-[12.5px]">
          <thead className="sticky top-0 bg-background text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="border-b border-border/60 px-2.5 py-1.5 font-medium">目标</th>
              <th className="border-b border-border/60 px-2.5 py-1.5 font-medium">计划承诺</th>
              <th className="border-b border-border/60 px-2.5 py-1.5 font-medium">关联 Issue</th>
              <th className="border-b border-border/60 px-2.5 py-1.5 font-medium">人工验收</th>
              <th className="border-b border-border/60 px-2.5 py-1.5 font-medium">遗留 / 下一步</th>
            </tr>
          </thead>
          <tbody>
            {plan.kind === 'loading' || acceptance.kind === 'loading' ? (
              <tr>
                <td colSpan={5} className="px-2.5 py-3 text-muted-foreground">
                  材料读取中…
                </td>
              </tr>
            ) : null}
            {plan.kind === 'missing' ? (
              <tr>
                <td colSpan={5} className="px-2.5 py-3 text-muted-foreground">
                  {plan.message}
                </td>
              </tr>
            ) : null}
            {planDocument?.goals.map((goal, index) => {
              const label = `G${index + 1}`
              const references = (planDocument.tasks ?? []).filter(
                (task) => task.goalId === goal.goalId
              )
              const result = acceptanceDocument?.results.find((item) => item.goalId === goal.goalId)
              const openFollowups = (result?.meetingDirectives ?? []).filter(
                (directive) => directive.status !== 'confirmed'
              ).length
              return (
                <tr key={goal.goalId} className="align-top">
                  <td className="border-b border-border/40 px-2.5 py-2">
                    <span className="font-medium">
                      {label} · {goal.title || '待明确目标'}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {goal.owner || '负责人待明确'}
                      {goal.deadline ? ` · ${goal.deadline}` : ''}
                    </span>
                  </td>
                  <td className="border-b border-border/40 px-2.5 py-2">
                    <span className="line-clamp-3 whitespace-pre-line" title={goal.deliverable}>
                      {goal.deliverable?.trim() || '交付约定未记录'}
                    </span>
                    {goal.metricTargets.length > 0 ? (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        指标：
                        {goal.metricTargets
                          .map((target) => `${target.ref.name} → ${target.target}`)
                          .join('；')}
                      </span>
                    ) : null}
                  </td>
                  <td className="border-b border-border/40 px-2.5 py-2">
                    <span>{references.length} 条引用</span>
                    <button
                      type="button"
                      className="ml-1.5 rounded border border-border px-1.5 py-px text-[11px] hover:bg-accent"
                      onClick={() => openTasks({ goalId: goal.goalId, label })}
                    >
                      查看
                    </button>
                  </td>
                  <td className="border-b border-border/40 px-2.5 py-2">
                    {result?.decision ? (
                      <span>
                        {DECISION_LABELS[result.decision.outcome]}
                        <span className="block text-[11px] text-muted-foreground">
                          记录于 {result.decision.recordedAt.slice(0, 10)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {acceptanceDocument ? '结论未记录' : '验收未归档'}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-border/40 px-2.5 py-2">
                    <span className="line-clamp-3 whitespace-pre-line" title={result?.nextStep}>
                      {result?.nextStep?.trim() || '未记录'}
                    </span>
                    {openFollowups > 0 ? (
                      <span className="block text-[11px] text-muted-foreground">
                        待确认会议指导 {openFollowups} 条
                      </span>
                    ) : null}
                  </td>
                </tr>
              )
            })}
            {planDocument && planDocument.goals.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2.5 py-3 text-muted-foreground">
                  已提交计划没有目标条目。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {acceptance.kind === 'missing' && acceptanceDocument === null ? (
        <p className="text-[11.5px] text-muted-foreground">{acceptance.message}</p>
      ) : null}
    </main>
  )
}
