import { ArrowUpRight, GitPullRequest } from 'lucide-react'
import type { Ref } from 'react'
import type { ArchivePrStatusResult } from '../../../../shared/workbench/archive-pr-status'
import type { WorkflowArchivePr } from '../../../../shared/workbench/version-workflow'
import { BoardIconButton } from '../board-ui'

/**
 * G3 archive row for the plan screen: the recorded archive PR reference, its
 * provider-reported merge state, and one entry into the Orca native PR page —
 * no comment copying, no diff stats, no external link. The acceptance screen has
 * its own AcceptanceArchiveCard; the two evolve independently by decision.
 */
export function PlanningArchiveCard({
  archivePr,
  reachedArchive,
  status,
  loading,
  opening,
  onOpenPr,
  sectionRef
}: {
  archivePr: WorkflowArchivePr | undefined
  reachedArchive: boolean
  status: ArchivePrStatusResult | null
  loading: boolean
  opening: boolean
  onOpenPr(): void
  sectionRef: Ref<HTMLElement>
}) {
  const statusLabel =
    loading || !status
      ? '正在读取归档 PR 状态…'
      : status.state === 'merged'
        ? '已合入'
        : status.state === 'open'
          ? '待合入'
          : status.state === 'closed'
            ? '已关闭'
            : '状态未知'
  return (
    <section id="archive" className="g3-archive" ref={sectionRef} aria-label="归档 PR">
      <GitPullRequest size={20} aria-hidden="true" />
      <div>
        <h2>
          计划归档 PR{' '}
          {archivePr && (
            <button
              type="button"
              className="g3-id g3-archive-link"
              disabled={opening}
              onClick={onOpenPr}
            >
              #{archivePr.number}
            </button>
          )}
        </h2>
        <p>
          {archivePr
            ? 'Leader 在 Orca 原生 PR 页再次审核计划，合入后归档。'
            : reachedArchive
              ? '已进入归档阶段；PR 链接未记录。'
              : '未创建 · 由计划助手在原生会话中发起，Leader 在 Orca 原生 PR 页再审。'}
        </p>
      </div>
      {archivePr && (
        <BoardIconButton label="打开原生 PR 页" disabled={opening} onClick={onOpenPr}>
          <ArrowUpRight size={16} aria-hidden="true" />
        </BoardIconButton>
      )}
      {archivePr && (
        <span
          className="g3-archive-status"
          title={status?.state === 'unknown' ? status.reason : undefined}
        >
          {statusLabel}
        </span>
      )}
    </section>
  )
}
