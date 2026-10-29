import { Archive, ArrowUpRight, GitPullRequest, Rocket } from 'lucide-react'
import type { Ref } from 'react'
import type { ArchivePrStatusResult } from '../../../../shared/workbench/archive-pr-status'
import type { ReleaseStatusResult } from '../../../../shared/workbench/release-status'
import type {
  WorkflowArchivePr,
  WorkflowReleaseRef
} from '../../../../shared/workbench/version-workflow'
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
 * Release keeps the single injection button (pre-flight, consistency check,
 * informed authorization and execution still happen in the session) and adds the
 * #462 read-back row: whether this version is released, the tag, published time,
 * the Release page URL and its assets — all provider-computed on every read,
 * keyed by the material's tag reference only. No reference means never released
 * (a material fact, no read); a tag with no matching Release is a real reading;
 * unreadable stays unknown. The material stores no release record beyond the
 * tag key, and the button stays enabled after a release — the board does not
 * decide whether a re-release is allowed.
 */
export function AcceptanceArchiveCard({
  archivePr,
  reachedArchive,
  status,
  loading,
  opening,
  onOpenPr,
  onSendAction,
  release,
  releaseStatus,
  releaseLoading,
  onOpenRelease,
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
  release: WorkflowReleaseRef | undefined
  releaseStatus: ReleaseStatusResult | null
  releaseLoading: boolean
  onOpenRelease(url: string): void
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
  // 未发布不配说明文字:chip 已表达状态,授权口径归按钮提示与会话,板面不重复。
  const releaseLabel = !release
    ? '未发布'
    : releaseLoading || !releaseStatus
      ? '正在读取发布状态…'
      : releaseStatus.state === 'published'
        ? '已发布'
        : releaseStatus.state === 'missing'
          ? '未找到 Release'
          : '状态未知'
  const releaseDetail =
    releaseStatus?.state === 'published' ? (
      <>
        <p>
          {new Date(releaseStatus.publishedAt).toLocaleString('zh-CN')} 发布 · 标签 {release?.tag}
        </p>
        <p className="acc-release-detail">
          Release 页:
          <button
            type="button"
            className="acc-release-url"
            onClick={() => onOpenRelease(releaseStatus.url)}
          >
            {releaseStatus.url}
          </button>
        </p>
        <p
          className="acc-release-detail"
          title={releaseStatus.assets.length > 0 ? releaseStatus.assets.join('、') : undefined}
        >
          资产:{releaseStatus.assets.length > 0 ? releaseStatus.assets.join(' · ') : '无'}
        </p>
      </>
    ) : releaseStatus?.state === 'missing' ? (
      <p>标签 {release?.tag} 读回确认尚无对应 Release;以 Git 标签与 Release 页为准。</p>
    ) : releaseStatus?.state === 'unknown' ? (
      <p>发布状态读回失败;以 Git 标签与 Release 页为准。</p>
    ) : null
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
          <h3>
            发版本
            <span
              className="acc-release-status"
              title={releaseStatus?.state === 'unknown' ? releaseStatus.reason : undefined}
            >
              {releaseLabel}
            </span>
          </h3>
          {releaseDetail}
        </div>
        {onSendAction(
          `发布 ${version || '本版'}：先在会话中完成预检并报告，经我明确授权后再执行`,
          '发布请求',
          <BoardActionButton title="发布请求注入验收助手会话;预检与授权在会话中完成">
            <Rocket size={14} aria-hidden="true" /> 发布
          </BoardActionButton>
        )}
      </div>
    </section>
  )
}
