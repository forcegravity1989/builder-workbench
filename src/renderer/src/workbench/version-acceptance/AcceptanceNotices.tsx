import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import type { MaterialDraft, MaterialDraftController } from '../version-cycle/material-draft'
import type { TreePlanProblem } from './use-acceptance-plan'

/**
 * Conflict, recovery and history notices above the goal cards. Kept honest: a
 * stale dirty draft over a confirmed archive is surfaced with an explicit
 * re-read escape hatch, never silently dropped or auto-overwritten.
 */
export function AcceptanceNotices({
  error,
  recoveryError,
  recoveryText,
  historyProblems,
  draft,
  controller,
  archived,
  busy,
  setError,
  onDiscardLocal
}: {
  error: string | null
  recoveryError: string | null
  recoveryText: string | null
  historyProblems: TreePlanProblem[]
  draft: MaterialDraft<AcceptanceMaterial> | null
  controller: MaterialDraftController<AcceptanceMaterial>
  archived: boolean
  busy: boolean
  setError(message: string): void
  onDiscardLocal(): void
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
      {historyProblems.length > 0 && (
        <details className="va-source va-warning">
          <summary>{historyProblems.length} 条计划目录待核，可用计划仍可选择</summary>
          {historyProblems.map((item) => (
            <p key={`${item.code}:${item.version}`}>
              {item.version}：{item.message}
            </p>
          ))}
        </details>
      )}
      {draft?.remote && (
        <details className="va-conflict">
          <summary>远端材料已变化，本地输入已保留</summary>
          <pre>{JSON.stringify(draft.remote.document, null, 2)}</pre>
          <button
            className="wb-btn wb-btn-sm"
            onClick={() => {
              if (draft.remote) {
                navigator.clipboard
                  .writeText(JSON.stringify(draft.document, null, 2))
                  .then(() => {
                    if (controller.value !== draft) {
                      throw new Error('复制期间草稿已变化，保留当前输入；请重新复制后采用远端。')
                    }
                    controller.useRemote(draft.remote!)
                  })
                  .catch((reason) => setError(String(reason)))
              }
            }}
          >
            复制本地草稿并采用远端
          </button>
        </details>
      )}
      {archived && draft?.dirty && (
        <p role="alert" className="va-error">
          本轮验收已归档，未保存的本地修改不能写入。
          <button className="wb-btn wb-btn-sm" disabled={busy} onClick={onDiscardLocal}>
            放弃本地修改，重读已归档材料
          </button>
        </p>
      )}
    </>
  )
}
