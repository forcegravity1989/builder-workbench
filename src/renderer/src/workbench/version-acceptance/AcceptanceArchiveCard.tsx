import { ArrowUpRight, GitPullRequest, Rocket } from 'lucide-react'
import type { Ref } from 'react'
import type { ArchivePrStatusResult } from '../../../../shared/workbench/archive-pr-status'
import type { WorkflowArchivePr } from '../../../../shared/workbench/version-workflow'
import { BoardIconButton } from '../board-ui'

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
  onSendAction(prompt: string, label: string): void
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
              ? 'Leader 在 Orca 原生 PR 页再审验收记录，合入后归档；随 PR 带验收材料、证据报告与截图。'
              : reachedArchive
                ? '已进入归档阶段；PR 链接未记录。'
                : '未创建 · 归档由验收助手在会话中执行，Leader 在 Orca 原生 PR 页再审。'}
          </p>
        </div>
        <span className="acc-archive-actions">
          <BoardIconButton
            label="让验收助手核对材料并发起归档"
            onClick={() =>
              onSendAction(
                '核对验收材料与结论状态后，在 bw/week-acceptance 固定树提交归档并创建到主分支的 PR',
                '归档请求'
              )
            }
          >
            <Rocket size={16} aria-hidden="true" />
          </BoardIconButton>
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
          <p>
            预检、发布提交与验收包一致性核对、知情授权、按项目自有发布入口执行与独立读回都在会话中完成；
            不达成不阻断发布，由你知情决定。未经你明确授权不创建 Release、不打标签。
          </p>
        </div>
        <button
          type="button"
          className="acc-text-button"
          onClick={() =>
            onSendAction(
              `发布 ${version || '本版'}：先呈现版本号、发布提交与验收包一致性、各目标达成状况与版本说明就绪状态，经我明确授权后按项目自有发布入口执行，发布后独立读回 tag、时间、资产与校验值`,
              '发布请求'
            )
          }
        >
          <Rocket size={13} aria-hidden="true" /> 发布
        </button>
      </div>
    </section>
  )
}
