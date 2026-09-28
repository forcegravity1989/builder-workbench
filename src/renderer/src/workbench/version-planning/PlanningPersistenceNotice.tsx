import type { usePlanningMaterial } from './use-planning-material'

/** Normal saves stay quiet; conflicts require explicit comparison before any replacement. */
export function PlanningPersistenceNotice({
  material,
  archived,
  onAct
}: {
  material: ReturnType<typeof usePlanningMaterial>
  archived: boolean
  onAct(operation: () => Promise<unknown>): Promise<void>
}) {
  const draft = material.draft
  if (!draft) {
    return null
  }
  if (archived && draft.dirty) {
    return (
      <div className="vp-notice" role="alert">
        本轮计划已归档，本地修改已保留，不能写入。
        <button
          className="wb-btn wb-btn-sm"
          disabled={material.busy}
          onClick={() => void onAct(material.discardLocal)}
        >
          放弃本地修改并重读
        </button>
      </div>
    )
  }
  if (!draft.error) {
    return null
  }
  return (
    <div className="vp-notice vp-save-error" role="alert">
      <span>{draft.error}</span>
      {draft.remote !== undefined ? (
        <details className="vp-conflict">
          <summary>核对当前输入与文件内容</summary>
          <div className="vp-compare">
            <div>
              <h3>当前输入</h3>
              <pre>{JSON.stringify(draft.document, null, 2)}</pre>
            </div>
            <div>
              <h3>文件内容</h3>
              <pre>
                {draft.remote ? JSON.stringify(draft.remote.document, null, 2) : '文件已删除'}
              </pre>
            </div>
          </div>
          {draft.remote ? (
            <div className="vp-inline">
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
                onClick={() => material.useMerged(draft.document)}
              >
                已核对，保留当前输入
              </button>
            </div>
          ) : (
            <button
              className="wb-btn wb-btn-sm"
              disabled={material.busy}
              onClick={() => void onAct(material.discardLocal)}
            >
              放弃本地修改并重读
            </button>
          )}
        </details>
      ) : (
        <button
          className="wb-btn wb-btn-sm"
          disabled={material.busy || archived}
          onClick={() => void onAct(material.save)}
        >
          重试保存
        </button>
      )}
    </div>
  )
}
