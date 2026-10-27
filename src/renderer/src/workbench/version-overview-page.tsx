import React, { useMemo } from 'react'
import type { ArchivePrStatusResult } from '../../../shared/workbench/archive-pr-status'
import { useVersionCatalogForRepo } from './use-version-catalog'
import { useVersionOverviewMaterials } from './version-overview-materials'
import { navigateVersionWorkflow, openVersionTasks } from './version-nav-actions'
import type { VersionOverviewOptions } from './project-page-state'
import type { PlanningMaterial } from '../../../shared/workbench/version-material'
import {
  DECISION_LABELS,
  ISSUE_TREE_LABEL,
  WORKFLOW_TREE_LABELS,
  goalOrdinal,
  goalTreeLabel,
  shortCommit
} from './version-labels'

/**
 * G2 版本总览（P6，高保真修订 9：最简表格周报风格）：一版一页，从主干已提交
 * 材料＋原生登记现算派生（铁律：杀进程重开数字一致；没数据就是 Unknown）。
 * 计划承诺 / 任务事实 / 人工验收 / 归档与发布 / 遗留分区呈现，互不冒充：
 * 归档 PR 合入状态是按记录引用的薄读取，读不到保持未知；发布证据检索未接入
 * 前如实标注，不猜。在制版本的未合入草稿以计划屏为准，本页只读已提交材料。
 * 数据装载在 version-overview-materials.ts。
 */

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
    case 'unknown':
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
  const catalog = useVersionCatalogForRepo(repoId)
  const catalogError = catalog.materialError ?? catalog.error
  const entry = useMemo(
    () => catalog.catalog?.entries.find((item) => item.version === version) ?? null,
    [catalog.catalog, version]
  )
  const { plan, acceptance, prStatuses } = useVersionOverviewMaterials({
    repoId,
    version,
    entry,
    catalogReady: catalog.materialReady,
    catalogError
  })
  const planDocument: PlanningMaterial | null = plan.kind === 'ready' ? plan.document : null
  const acceptanceDocument = acceptance.kind === 'ready' ? acceptance.document : null
  const catalogReady = catalog.materialReady
  const workspaceLabels = (entry?.workspaces ?? []).map((workspace) =>
    workspace.binding.workflow === 'goal'
      ? goalTreeLabel(null)
      : workspace.binding.workflow === 'issue'
        ? ISSUE_TREE_LABEL
        : WORKFLOW_TREE_LABELS[workspace.binding.workflow]
  )
  const minutes = planDocument?.minutes
  const followupsClosed = minutes?.followups.filter((item) => item.closed).length ?? 0
  // v10 验收纪要（#394）：文档级 minutes 节，followups 无闭环位；未确认如实标注。
  // 旧材料的逐目标会议指导计数仍在周报表遗留列（meetingDirectives，legacy）。
  const acceptanceMinutes = acceptanceDocument?.minutes
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
          {!catalogReady && !catalogError
            ? '状态读取中…'
            : entry?.state === 'working'
              ? '在制'
              : entry
                ? '历史'
                : '状态未知'}
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
          {catalogError
            ? `目录读取失败：${catalogError}`
            : !catalogReady
              ? '目录读取中…'
              : workspaceLabels.length > 0
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
          {minutes ? (
            <span className="block">
              计划：共识 {minutes.consensus.length} · 遗留 {followupsClosed}/
              {minutes.followups.length} 闭环{minutes.confirmed ? ' · 人已确认' : ' · 未确认'}
            </span>
          ) : (
            <span className="block">{planDocument ? '计划纪要未记录' : '—'}</span>
          )}
          {acceptanceDocument ? (
            acceptanceMinutes ? (
              <span className="block">
                验收：共识 {acceptanceMinutes.consensus.length} · 遗留{' '}
                {acceptanceMinutes.followups.length} 条
                {acceptanceMinutes.confirmed ? ' · 人已确认' : ' · 未确认'}
              </span>
            ) : (
              <span className="block">验收纪要未记录</span>
            )
          ) : null}
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
              const label = goalOrdinal(index)
              const references = planDocument.tasks.filter((task) => task.goalId === goal.goalId)
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
