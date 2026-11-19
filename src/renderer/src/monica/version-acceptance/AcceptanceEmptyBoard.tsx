import { ErrorDetails } from '../error-feedback'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type { CycleEntry } from '../version-cycle/cycle-workspace-context'
import { AcceptanceHeader } from './AcceptanceSections'
import { AcceptanceNotices } from './AcceptanceNotices'
import type { useAcceptanceBoard } from './use-acceptance-board'

/** The four zones open after a native run opens or existing material is read. */
export function AcceptanceEmptyBoard({
  board,
  context,
  entry,
  state,
  chatCollapsed,
  onStarted,
  onSessionToggle,
  onRefresh
}: {
  board: ReturnType<typeof useAcceptanceBoard>
  context: VersionCycleContext
  entry: CycleEntry
  state: string
  chatCollapsed: boolean
  onStarted(): void
  onSessionToggle(): void
  onRefresh(): void
}) {
  const version = context.version
  return (
    <main className="acc-board" lang="zh">
      <AcceptanceHeader
        boundVersion={context.version}
        disabled={!context.materialPort || Boolean(context.syncing)}
        state={state}
        sessionCollapsed={chatCollapsed}
        onSessionToggle={onSessionToggle}
        onConfigure={() => void entry.configure()}
        onRefresh={onRefresh}
      />
      <div className="acc-empty-board">
        <p>版本验收尚未开始</p>
        <button
          type="button"
          data-contextual-tour-target="monica-acceptance-start"
          disabled={entry.busy || Boolean(context.syncing)}
          onClick={async () => {
            const opened = await entry.start(version)
            if (opened) {
              onStarted()
            }
          }}
        >
          {entry.busy ? '正在打开会话…' : '开始验收'}
        </button>
      </div>
      {context.error && (
        <ErrorDetails
          className="acc-notice"
          summary="无法打开验收工作区 · 查看详情"
          detail={context.error}
        />
      )}
      {entry.notice && (
        <p className="acc-notice" role="status">
          {entry.notice}
        </p>
      )}
      <AcceptanceNotices
        error={board.error}
        recoveryError={board.recoveryError}
        recoveryText={board.recoveryText}
        draft={board.draft}
        controller={board.controller}
        setError={board.setError}
        onRetrySave={() => void board.retrySave()}
        onRemoteDeleted={board.useRemoteDeletion}
      />
    </main>
  )
}
