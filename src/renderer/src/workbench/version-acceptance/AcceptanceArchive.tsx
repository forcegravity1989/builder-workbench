import type { ArchiveStatus } from '../version-cycle/ports'

export function AcceptanceArchive({
  status,
  dirty,
  hasDocument,
  hasRevision,
  readOnly,
  busy,
  onRefreshStatus,
  onReload,
  onSave,
  onPrepare
}: {
  status: ArchiveStatus
  dirty: boolean
  hasDocument: boolean
  hasRevision: boolean
  readOnly: boolean
  busy: boolean
  onRefreshStatus(): void
  onReload(): void
  onSave(): void
  onPrepare(): void
}) {
  const label =
    status.kind === 'unknown'
      ? status.reason
      : status.kind === 'not-created'
        ? '尚未创建归档评审'
        : `${status.kind === 'merged' ? '已合入' : status.kind === 'open' ? '待评审' : '已关闭'}${status.matchesRevision && !dirty ? '' : ' · 与当前材料待核对'}`
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
      <button
        className="wb-btn wb-btn-sm"
        disabled={!hasDocument || !hasRevision || dirty || readOnly}
        onClick={onPrepare}
      >
        准备归档请求
      </button>
    </footer>
  )
}
