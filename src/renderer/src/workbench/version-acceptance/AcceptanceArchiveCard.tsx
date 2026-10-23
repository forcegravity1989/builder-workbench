import { Archive, ArrowUpRight, GitPullRequest, Rocket } from 'lucide-react'
import type { Ref } from 'react'
import type { ArchivePrStatusResult } from '../../../../shared/workbench/archive-pr-status'
import type { WorkflowArchivePr } from '../../../../shared/workbench/version-workflow'
import { BoardActionButton, BoardIconButton } from '../board-ui'
import type { SendActionWrap } from '../plan-send-menu'

/**
 * Fourth zone: archive reference plus the release entry.
 *
 * Archiving is executed by the model in the session; the board only carries the
 * recorded reference, its provider-reported merge state, one entry into the Orca
 * native PR page, and an injection entry — no comment copying, no diff stats, no
 * button that archives directly.
 *
 * Release is one button that injects the request into the acceptance session.
 * Pre-flight, package/commit consistency, informed authorization, execution and
 * the independent read-back all happen in the session: the board renders no
 * pre-flight dialog and no release row, and the material stores no release
 * record — the tag and the provider Release page are the only source of truth.
 */
export function AcceptanceArchiveCard({
  archivePr,
  reachedArchive,
  status,
  loading,
  opening,
  onOpenPr,
  onSendAction,
  version,
  sectionRef
}: {
  archivePr: WorkflowArchivePr | undefined
  reachedArchive: boolean
  status: ArchivePrStatusResult | null
  loading: boolean
  opening: boolean
  onOpenPr(): void
  onSendAction: SendActionWrap
  version: string
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
    <section id="archive" ref={sectionRef} aria-label="归档 PR 及发版本">
      <div className="acc-section-title">
        <h2>
          归档 PR 及发版本
          <small>原生 PR 再审 · 授权发布</small>
        </h2>
      </div>
      <div className="acc-archive">
        <GitPullRequest size={20} aria-hidden="true" />
        <div>
          <h3>
            验收归档 PR{' '}
            {archivePr && (
              <button
                type="button"
                className="acc-id acc-archive-link"
                disabled={opening}
                onClick={onOpenPr}
              >
                #{archivePr.number}
              </button>
            )}
          </h3>
          <p>
            {archivePr
              ? 'Leader 在 Orca 原生 PR 页再审，合入后归档。'
              : reachedArchive
                ? '已进入归档阶段；PR 链接未记录。'
                : '未创建 · 归档由验收助手在会话中执行。'}
          </p>
        </div>
        <span className="acc-archive-actions">
          {/* 触发件用纯 button，理由同 AcceptanceMinutesSection：不与 Tooltip 的
              Radix 触发件嵌套。「打开原生 PR 页」不是发送动作，保持图标按钮。
              prompt 只承载触发意图（对齐计划屏第九轮瘦身）：固定树、目标分支等
              SOP 细节归 version-acceptance Skill，不复述进按钮。图标用 Archive，
              与发布（Rocket）区分——同卡两个注入动作不共用图标。 */}
          {onSendAction(
            `归档 ${version || '本版'}：核对验收材料与结论状态后发起归档，在会话中给出归档 PR`,
            '归档请求',
            <BoardActionButton title="让验收助手核对材料并发起归档">
              <Archive size={14} aria-hidden="true" /> 发起归档
            </BoardActionButton>
          )}
          {archivePr && (
            <BoardIconButton label="打开原生 PR 页" disabled={opening} onClick={onOpenPr}>
              <ArrowUpRight size={16} aria-hidden="true" />
            </BoardIconButton>
          )}
        </span>
        {archivePr && (
          <span
            className="acc-archive-status"
            title={status?.state === 'unknown' ? status.reason : undefined}
          >
            {statusLabel}
          </span>
        )}
      </div>
      <div className="acc-release">
        <div>
          <h3>发版本</h3>
          <p>预检、授权、执行与读回全在会话中完成；未经明确授权不创建 Release、不打标签。</p>
        </div>
        {onSendAction(
          `发布 ${version || '本版'}：先在会话中完成预检并报告，经我明确授权后再执行`,
          '发布请求',
          <BoardActionButton>
            <Rocket size={14} aria-hidden="true" /> 发布
          </BoardActionButton>
        )}
      </div>
    </section>
  )
}
