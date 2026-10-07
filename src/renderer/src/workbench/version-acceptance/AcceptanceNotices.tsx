import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import type { MaterialDraft, MaterialDraftController } from '../version-cycle/material-draft'

/** Conflict resolution preserves a copy of local input before accepting the host material. */
export function AcceptanceNotices({
  error,
  recoveryError,
  recoveryText,
  draft,
  controller,
  busy,
  setError,
  onRetrySave,
  onRemoteDeleted
}: {
  error: string | null
  recoveryError: string | null
  recoveryText: string | null
  draft: MaterialDraft<AcceptanceMaterial> | null
  controller: MaterialDraftController<AcceptanceMaterial>
  busy: boolean
  setError(message: string): void
  onRetrySave(): void
  onRemoteDeleted(): void
}) {
  return (
    <>
      {(error || recoveryError || draft?.error) && (
        <p role="alert" className="va-error">
          {error ?? recoveryError ?? draft?.error}
        </p>
      )}
      {recoveryText && (
        <details className="va-conflict">
          <summary>保留的本机恢复原文</summary>
          <button
            className="wb-btn wb-btn-sm"
            onClick={() =>
              void navigator.clipboard
                .writeText(recoveryText)
                .catch((reason) => setError(String(reason)))
            }
          >
            复制恢复原文
          </button>
          <pre>{recoveryText}</pre>
        </details>
      )}
      {draft && draft.remote !== undefined && (
        <details className="va-conflict">
          <summary>远端材料已变化，本地输入已保留</summary>
          <pre>
            {draft.remote
              ? JSON.stringify(draft.remote.document, null, 2)
              : '宿主材料已删除，当前输入仍保留。'}
          </pre>
          <button
            className="wb-btn wb-btn-sm"
            onClick={() => {
              if (draft.remote !== undefined) {
                navigator.clipboard
                  .writeText(JSON.stringify(draft.document, null, 2))
                  .then(() => {
                    if (controller.value !== draft) {
                      throw new Error('复制期间草稿已变化，保留当前输入；请重新复制后采用远端。')
                    }
                    if (draft.remote) {
                      controller.useRemote(draft.remote)
                    } else {
                      onRemoteDeleted()
                    }
                  })
                  .catch((reason) => setError(String(reason)))
              }
            }}
          >
            复制本地草稿并采用远端
          </button>
        </details>
      )}
      {draft?.error && draft.remote === undefined && (
        <button className="wb-btn wb-btn-sm" disabled={busy} onClick={onRetrySave}>
          重试保存
        </button>
      )}
    </>
  )
}
