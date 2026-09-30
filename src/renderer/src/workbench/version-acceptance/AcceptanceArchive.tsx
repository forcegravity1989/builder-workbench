import type { RefObject } from 'react'
import { GitPullRequest } from 'lucide-react'
import type { ArchiveStatus } from '../version-cycle/ports'
import { archiveJourneyLamp } from '../../../../shared/workbench/version-archive'

/**
 * Acceptance keeps its explicit save (unlike the plan board's autosave): saving,
 * human acceptance, PR merge and release are different facts. The archive button
 * prepares an unsent request in the visible left terminal, same as the plan card.
 */
export function AcceptanceArchive({
  status,
  dirty,
  hasDocument,
  hasRevision,
  readOnly,
  busy,
  archived,
  sectionRef,
  onArchive,
  onRefreshStatus,
  onReload,
  onSave
}: {
  status: ArchiveStatus
  dirty: boolean
  hasDocument: boolean
  hasRevision: boolean
  readOnly: boolean
  busy: boolean
  archived: boolean
  sectionRef: RefObject<HTMLElement | null>
  onArchive(): void
  onRefreshStatus(): void
  onReload(): void
  onSave(): void
}) {
  const tone = archiveJourneyLamp(status, archived)
  const label =
    status.kind === 'unknown'
      ? status.reason
      : status.kind === 'not-created'
        ? '尚未创建归档评审'
        : status.kind === 'merged'
          ? archived
            ? '当前材料已归档'
            : '评审已合入 · 当前材料待核对'
          : status.kind === 'open'
            ? '待评审'
            : '已关闭'
  return (
    <footer className="va-footer" id="acceptance-archive" ref={sectionRef}>
      <span className="va-archive-state">
        <GitPullRequest size={14} aria-hidden="true" />
        <span className={`va-lamp va-lamp-${tone}`} aria-hidden="true" />
        {label}
        {'url' in status && (
          <>
            {' '}
            ·{' '}
            <a href={status.url} target="_blank" rel="noreferrer">
              查看评审
            </a>
          </>
        )}
      </span>
      <button
        className="wb-btn wb-btn-sm"
        disabled={!hasDocument || !hasRevision || archived || readOnly || busy}
        onClick={onArchive}
      >
        归档
      </button>
      <button
        className="wb-btn wb-btn-ghost wb-btn-sm"
        disabled={!hasDocument || !hasRevision}
        onClick={onRefreshStatus}
      >
        刷新归档
      </button>
      <button className="wb-btn wb-btn-sm" disabled={!hasDocument || busy} onClick={onReload}>
        重读材料
      </button>
      <button
        className="wb-btn wb-btn-primary"
        disabled={!dirty || readOnly || busy}
        onClick={onSave}
      >
        保存结果
      </button>
    </footer>
  )
}
