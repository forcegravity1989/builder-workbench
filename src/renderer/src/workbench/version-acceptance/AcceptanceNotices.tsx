import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import type { MaterialDraft, MaterialDraftController } from '../version-cycle/material-draft'

/**
 * 提示只留一行短句（2026-10-23 拍板：板面不铺裸 JSON）。会中 CAS 冲突正常走
 * 字段归属静默合并（acceptance-merge.ts），这里只剩一行合并回执；仅当合并基线
 * 缺失（如杀进程恢复的本机脏草稿再遇冲突）才退回人工处置——两个按钮，不展示
 * 内容正文。复制链必须走带写入校验的 IPC 剪贴板：navigator.clipboard 在真壳
 * 会静默失效，人会以为已复制（2026-10-22 计划屏真机已踩到）。
 */
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
      {draft?.notice && (
        <p role="status" className="acc-notice">
          {draft.notice}
        </p>
      )}
      {recoveryText && (
        <details className="va-conflict">
          <summary>保留的本机恢复原件（可复制转出）</summary>
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
        </details>
      )}
      {draft && draft.remote !== undefined && (
        <details className="va-conflict">
          <summary>远端材料已变化，本地输入已保留</summary>
          {draft.remote ? (
            <>
              <button
                className="wb-btn wb-btn-sm"
                onClick={() => {
                  const current = draft
                  // 必须复制成功才采用远端:这条链的语义是「本地输入已存进剪贴板,
                  // 可以安全丢掉草稿」。写不成功就 reject,停在 catch 里保住草稿。
                  void window.api.ui
                    .writeClipboardText(JSON.stringify(current.document, null, 2))
                    .then(() => {
                      if (controller.value !== current) {
                        throw new Error('复制期间草稿已变化，保留当前输入；请重新复制后采用远端。')
                      }
                      if (current.remote) {
                        controller.useRemote(current.remote)
                      }
                    })
                    .catch((reason) => setError(String(reason)))
                }}
              >
                复制本地草稿并采用远端
              </button>
              <button
                className="wb-btn wb-btn-sm"
                disabled={busy}
                onClick={() => {
                  if (draft.remote) {
                    controller.useMerged(draft.document, draft.remote.revision)
                  }
                }}
              >
                保留当前输入
              </button>
            </>
          ) : (
            <button
              className="wb-btn wb-btn-sm"
              onClick={() => {
                const current = draft
                void window.api.ui
                  .writeClipboardText(JSON.stringify(current.document, null, 2))
                  .then(() => {
                    // 与采用远端分支同款守卫:复制期间草稿再变化时,不能把未入
                    // 剪贴板的新输入随「删除重读」清掉。
                    if (controller.value !== current) {
                      throw new Error('复制期间草稿已变化，保留当前输入；请重新复制后继续。')
                    }
                    onRemoteDeleted()
                  })
                  .catch((reason) => setError(String(reason)))
              }}
            >
              复制本地草稿（宿主材料已删除）
            </button>
          )}
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
