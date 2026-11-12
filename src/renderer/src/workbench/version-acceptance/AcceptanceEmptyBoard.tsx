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
  unreadable,
  state,
  chatCollapsed,
  onStarted,
  onSessionToggle,
  onRefresh
}: {
  board: ReturnType<typeof useAcceptanceBoard>
  context: VersionCycleContext
  entry: CycleEntry
  unreadable: string[]
  state: string
  chatCollapsed: boolean
  onStarted(): void
  onSessionToggle(): void
  onRefresh(): void
}) {
  const version = context.version ?? context.boundVersion
  return (
    <main className="acc-board" lang="zh">
      <AcceptanceHeader
        currentVersion={board.version}
        versions={[...new Set([...board.versions, ...(board.version ? [board.version] : [])])]}
        unreadable={unreadable}
        boundVersion={context.boundVersion}
        disabled={!context.materialPort || Boolean(context.syncing) || board.busy}
        state={state}
        sessionCollapsed={chatCollapsed}
        onSessionToggle={onSessionToggle}
        onSelect={(version) => void board.loadVersion(version)}
        onConfigure={() => void entry.configure()}
        onRefresh={onRefresh}
      />
      <div className="acc-empty-board">
        <p>版本验收尚未开始</p>
        <button
          type="button"
          disabled={entry.busy || board.busy || Boolean(context.syncing)}
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
      {(entry.notice || context.error) && (
        <p className="acc-notice" role="status">
          {context.error ?? entry.notice}
        </p>
      )}
      <AcceptanceNotices
        error={board.error}
        recoveryError={board.recoveryError}
        recoveryText={board.recoveryText}
        draft={board.draft}
        controller={board.controller}
        busy={board.busy}
        setError={board.setError}
        onRetrySave={() => void board.retrySave()}
        onRemoteDeleted={board.useRemoteDeletion}
      />
    </main>
  )
}
