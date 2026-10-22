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
          {/* 走 Orca IPC 剪贴板:navigator.clipboard 在真壳里会静默失效,
              那时 .catch 不触发,人会以为已复制。2026-10-22 计划屏真机已踩到。 */}
          <button
            className="wb-btn wb-btn-sm"
            onClick={() =>
              void window.api.ui
                .writeClipboardText(recoveryText)
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
                // 必须复制成功才采用远端:这条链的语义是「本地输入已存进剪贴板,
                // 可以安全丢掉草稿」。IPC 通道带写入校验,写不成功就 reject,
                // 于是停在 catch 里保住草稿;换成会静默失效的 navigator.clipboard
                // 则可能复制为空却照样采用远端,把人的输入丢掉。
                void window.api.ui
                  .writeClipboardText(JSON.stringify(draft.document, null, 2))
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
