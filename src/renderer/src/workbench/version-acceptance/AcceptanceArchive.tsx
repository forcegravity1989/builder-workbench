import type { ArchiveStatus } from '../version-cycle/ports'
import {
  isArchivedMaterial,
  type ArchivedMaterial
} from '../../../../shared/workbench/version-archive'

/**
 * Acceptance keeps its explicit save (unlike the plan board's autosave): saving,
 * human acceptance, PR merge and release are different facts. The archive request
 * itself is prepared from the journey's archive node, not duplicated here.
 */
export function AcceptanceArchive({
  status,
  dirty,
  hasDocument,
  hasRevision,
  material,
  readOnly,
  busy,
  onRefreshStatus,
  onReload,
  onSave
}: {
  status: ArchiveStatus
  dirty: boolean
  hasDocument: boolean
  hasRevision: boolean
  material: ArchivedMaterial | null
  readOnly: boolean
  busy: boolean
  onRefreshStatus(): void
  onReload(): void
  onSave(): void
}) {
  const archived = !dirty && material !== null && isArchivedMaterial(status, material)
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
    <footer className="va-footer" id="acceptance-archive">
      <span>
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
