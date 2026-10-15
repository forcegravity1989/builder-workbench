import React from 'react'
import type { CharterStatus } from '../../../shared/workbench/charter'

/**
 * 名片 PR 状态行(spec 规则 2):待合入 / 已合入未更新 / 没读到。
 * 墙卡与总览项目卡共用;「没查成」不冒充「没有 PR」。
 */
export function CharterPrNotice({
  status,
  variant,
  updating,
  onUpdateMain
}: {
  status: CharterStatus | null | undefined
  variant: 'wall' | 'overview'
  updating?: boolean
  onUpdateMain?: () => void
}): React.JSX.Element | null {
  if (!status) {
    return null
  }
  const className = variant === 'wall' ? 'pcard-charter-note' : 'project-card-notice'
  if (status.pr?.state === 'open') {
    return (
      <div className={className} data-workbench-charter-pr>
        <span>
          名片待合入 · {status.pr.provider === 'github' ? 'PR' : 'MR'} #{status.pr.number}
        </span>
        {status.pr.url ? (
          <button
            type="button"
            className="wb-btn wb-btn-ghost wb-btn-sm"
            onClick={() => void window.api.shell.openUrl(status.pr!.url!)}
          >
            查看
          </button>
        ) : null}
      </div>
    )
  }
  if (status.pr?.state === 'merged' && !status.headHasCharter && onUpdateMain) {
    return (
      <div className={className} data-workbench-charter-merged>
        <span>名片 PR 已合入</span>
        <button
          type="button"
          className="wb-btn wb-btn-secondary wb-btn-sm"
          disabled={updating}
          onClick={onUpdateMain}
        >
          更新代码
        </button>
      </div>
    )
  }
  if (status.queryFailed) {
    return (
      <div className={className}>
        <span className="wb-muted">名片 PR 状态没读到</span>
      </div>
    )
  }
  return null
}
