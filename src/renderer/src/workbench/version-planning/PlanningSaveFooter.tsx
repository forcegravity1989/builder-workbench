import type { ArchiveStatus } from '../version-cycle/ports'
import type { usePlanningMaterial } from './use-planning-material'
import { archiveStatusLabel } from './archive-label'

export function PlanningSaveFooter({
  material,
  archive,
  archived,
  archivePending,
  onAct,
  onMinutes,
  onArchive
}: {
  material: ReturnType<typeof usePlanningMaterial>
  archive: ArchiveStatus
  archived: boolean
  archivePending: boolean
  onAct(operation: () => Promise<unknown>): Promise<void>
  onMinutes(): void
  onArchive(): Promise<void>
}) {
  const plan = material.draft?.document
  const hasArchive =
    archive.kind === 'open' || archive.kind === 'merged' || archive.kind === 'closed'
  const archiveLabel = archiveStatusLabel(archive, archived, archivePending)
  return (
    <>
      {archived && material.draft?.dirty && (
        <p className="vp-notice" role="alert">
          本轮计划已归档，未保存的本地修改不能写入。
          <button
            className="wb-btn wb-btn-sm"
            disabled={material.busy}
            onClick={() => void onAct(() => material.discardLocal())}
          >
            放弃本地修改，重读已归档材料
          </button>
        </p>
      )}
      {material.draft?.error && (
        <details className="vp-conflict" open>
          <summary>{material.draft.error}</summary>
          {material.draft.remote && (
            <>
              <div className="vp-compare">
                <pre>{JSON.stringify(plan, null, 2)}</pre>
                <pre>{JSON.stringify(material.draft.remote.document, null, 2)}</pre>
              </div>
              <button
                className="wb-btn wb-btn-sm"
                disabled={material.busy}
                onClick={material.useRemote}
              >
                采用文件内容
              </button>
              <button
                className="wb-btn wb-btn-sm"
                disabled={material.busy}
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
          disabled={!plan || material.busy}
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
            !plan ||
            material.busy ||
            !material.draft?.dirty ||
            Boolean(material.draft.remote) ||
            archived ||
            archivePending
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
          disabled={!plan || material.busy}
          onClick={() => onMinutes()}
        >
          评审纪要
        </button>
        <button
          className="wb-btn wb-btn-primary wb-btn-sm"
          disabled={!plan || material.busy}
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
