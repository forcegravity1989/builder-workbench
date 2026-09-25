import type { ArchiveStatus } from '../version-cycle/ports'
import { isArchivedMaterial } from '../../../../shared/workbench/version-archive'
import type { usePlanningMaterial } from './use-planning-material'

export function PlanningSaveFooter({
  material,
  archive,
  onAct,
  onMinutes,
  onArchive
}: {
  material: ReturnType<typeof usePlanningMaterial>
  archive: ArchiveStatus
  onAct(operation: () => Promise<unknown>): Promise<void>
  onMinutes(): void
  onArchive(): Promise<void>
}) {
  const plan = material.draft?.document
  const revision = material.draft?.expectedRevision
  const archived = Boolean(
    plan &&
    revision &&
    !material.draft?.dirty &&
    isArchivedMaterial(archive, {
      workflow: 'plan',
      version: plan.version,
      cycleId: plan.cycleId,
      revision
    })
  )
  const hasArchive =
    archive.kind === 'open' || archive.kind === 'merged' || archive.kind === 'closed'
  const archiveLabel =
    archive.kind === 'unknown'
      ? `状态未知：${archive.reason}`
      : archive.kind === 'not-created'
        ? '尚未创建归档 PR'
        : archived
          ? '当前修订已合入'
          : archive.kind === 'merged'
            ? '有待归档变化'
            : archive.kind === 'closed'
              ? '归档 PR 已关闭'
              : '归档 PR 待评审'
  return (
    <>
      {material.draft?.error && (
        <details className="vp-conflict" open>
          <summary>{material.draft.error}</summary>
          {material.draft.remote && (
            <>
              <div className="vp-compare">
                <pre>{JSON.stringify(plan, null, 2)}</pre>
                <pre>{JSON.stringify(material.draft.remote.document, null, 2)}</pre>
              </div>
              <button className="wb-btn wb-btn-sm" onClick={material.useRemote}>
                采用文件内容
              </button>
              <button
                className="wb-btn wb-btn-sm"
                onClick={() => {
                  if (plan) {
                    material.useMerged(plan)
                  }
                }}
              >
                已核对，保留当前编辑并准备保存
              </button>
            </>
          )}
        </details>
      )}
      <footer className="vp-footer">
        <span className="vp-muted">
          {plan ? (material.draft?.dirty ? '有未保存修改' : '草稿已保存') : '尚未选择版本'}
        </span>
        <button
          className="wb-btn wb-btn-ghost wb-btn-sm"
          disabled={!plan}
          onClick={() =>
            void onAct(async () => {
              await material.refresh()
            })
          }
        >
          重读
        </button>
        <button
          className="wb-btn wb-btn-sm"
          disabled={
            !plan || material.busy || !material.draft?.dirty || Boolean(material.draft.remote)
          }
          onClick={() =>
            void onAct(async () => {
              await material.save()
            })
          }
        >
          保存草稿
        </button>
        <button
          className="wb-btn wb-btn-ghost wb-btn-sm"
          disabled={!plan}
          onClick={() => onMinutes()}
        >
          评审纪要
        </button>
        <button
          className="wb-btn wb-btn-primary wb-btn-sm"
          disabled={!plan}
          onClick={() => void onArchive()}
        >
          归档
        </button>
        <span className="vp-archive">
          {hasArchive ? (
            <a href={archive.url} target="_blank" rel="noreferrer">
              {archiveLabel}
            </a>
          ) : (
            archiveLabel
          )}
        </span>
      </footer>
    </>
  )
}
