import { Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type { CycleEntry } from '../version-cycle/cycle-workspace-context'
import {
  materialProblemFile,
  materialProblemRequest,
  type CycleMaterialProblem
} from '../version-cycle/cycle-start-request'
import { AcceptanceHeader } from './AcceptanceSections'
import { AcceptanceNotices } from './AcceptanceNotices'
import type { AcceptanceGateState } from './use-acceptance-gate'
import type { useAcceptanceBoard } from './use-acceptance-board'

/**
 * Empty-board state: the version picker and notices stay, the four zones do not.
 * The start entry is the only session launch point, and the hard gate reports its
 * own state so an empty board is never unexplained — checking, merged, blocked
 * with the reason, or no committed plan found for this version.
 */
export function AcceptanceEmptyBoard({
  board,
  gate,
  context,
  entry,
  unreadable,
  state,
  chatCollapsed,
  onSessionToggle,
  onRefresh
}: {
  board: ReturnType<typeof useAcceptanceBoard>
  gate: { state: AcceptanceGateState; recheck(): Promise<void> }
  context: VersionCycleContext
  entry: CycleEntry
  unreadable: string[]
  state: string
  chatCollapsed: boolean
  onSessionToggle(): void
  onRefresh(): void
}) {
  const [gateBlocked, setGateBlocked] = useState<string | null>(null)
  return (
    <main className="acc-board" lang="zh">
      <AcceptanceHeader
        currentVersion={board.version}
        versions={[...new Set([...board.versions, ...(board.version ? [board.version] : [])])]}
        unreadable={unreadable}
        disabled={!context.materialPort || Boolean(context.syncing) || board.busy}
        state={state}
        sessionCollapsed={chatCollapsed}
        onSessionToggle={onSessionToggle}
        onSelect={(version) => void board.loadVersion(version)}
        onConfigure={() => void entry.configure()}
        onRefresh={onRefresh}
      />
      <div className="acc-empty-board">
        <p>
          {board.version
            ? `${board.version} 验收尚未开始。`
            : '尚未选定版本，可在页头选择已有版本。'}
        </p>
        <AcceptanceStartButton
          entry={entry}
          problems={board.materialProblems}
          version={board.version}
          gate={gate.state}
          onBlocked={setGateBlocked}
        />
        {/* The gate is a script check on the plan's recorded archive PR, not a
              model judgment — say which state it is in so an empty board is never
              unexplained. */}
        {gate.state.kind === 'checking' && (
          <p className="acc-muted" role="status">
            正在核对本版计划的归档 PR 状态…
          </p>
        )}
        {gate.state.kind === 'merged' && (
          <p className="acc-muted" role="status">
            计划归档 PR 已合入，点上面的按钮开始验收。
          </p>
        )}
        {gate.state.kind === 'blocked' && (
          <p className="acc-error" role="alert">
            {gate.state.reason}
          </p>
        )}
        {gate.state.kind === 'idle' && board.version && (
          <p className="acc-muted" role="status">
            未在验收分支上找到本版已提交的计划，无法核对归档状态。
          </p>
        )}
        <AcceptanceMaterialProblems problems={board.materialProblems} />
      </div>
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
      {gateBlocked && (
        <GateDialog
          reason={gateBlocked}
          onClose={() => setGateBlocked(null)}
          onRetry={() => {
            setGateBlocked(null)
            void gate.recheck()
          }}
        />
      )}
    </main>
  )
}

/**
 * The single acceptance-start entry, shown only on an empty board. A blocked gate
 * reports why instead of starting a session — the draft pre-acceptance channel is
 * retired, so an unmerged plan archive PR cannot open the board.
 */
function AcceptanceStartButton({
  entry,
  problems,
  version,
  gate,
  onBlocked
}: {
  entry: CycleEntry
  problems: CycleMaterialProblem[]
  version: string | null
  gate: { kind: string; reason?: string }
  onBlocked(reason: string): void
}) {
  return (
    <button
      type="button"
      disabled={entry.busy || gate.kind === 'checking'}
      onClick={() => {
        if (gate.kind === 'blocked') {
          onBlocked(gate.reason ?? '无法开始验收。')
          return
        }
        void entry.start(
          [
            version ? `本次验收版本：${version}。请读取该版本的当前材料并继续协作。` : '',
            problems.length ? materialProblemRequest(problems, 'acceptance', version) : ''
          ]
            .filter(Boolean)
            .join('\n') || undefined
        )
      }}
    >
      {gate.kind === 'checking'
        ? '正在核对计划归档状态…'
        : entry.busy
          ? '正在打开会话…'
          : '与验收助手新建验收'}
    </button>
  )
}

/**
 * Material problems, named by which side they belong to. The catalog mixes
 * plan-side and acceptance-side entries; saying only "版本材料格式较旧" made a
 * plan-side problem read as if the acceptance material were broken.
 */
function AcceptanceMaterialProblems({ problems }: { problems: CycleMaterialProblem[] }) {
  if (!problems.length) {
    return null
  }
  const sides: ['acceptance' | 'plan', string][] = [
    ['acceptance', '验收材料'],
    ['plan', '计划材料']
  ]
  return (
    <>
      {sides.map(([workflow, label]) => {
        const items = problems.filter((item) => item.workflow === workflow)
        if (!items.length) {
          return null
        }
        return (
          <p
            className="acc-problem"
            role="alert"
            key={workflow}
            title={items
              .map((item) => `${materialProblemFile(item, workflow)}：${item.error ?? item.state}`)
              .join('\n')}
          >
            <Info size={14} aria-hidden="true" />
            <span>
              {[...new Set(items.map((item) => item.version))].join('、')} 的{label}格式
              {items.every((item) => item.state === 'migration-required') ? '较旧' : '有问题'}
              ，暂无法读取；点「与验收助手新建验收」会把具体文件和迁移请求带入会话，由模型说明方案、经你确认后转换，不留旧文件副本。
            </span>
          </p>
        )
      })}
    </>
  )
}

/** Honest block report for the retired draft pre-acceptance channel. */
function GateDialog({
  reason,
  onClose,
  onRetry
}: {
  reason: string
  onClose(): void
  onRetry(): void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="acc-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="acc-modal"
        role="alertdialog"
        aria-label="无法开始验收"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>无法开始验收</h2>
        <p>{reason}</p>
        <p className="acc-muted">
          验收屏保持空板；计划归档 PR 合入后点「重新核对」，或稍后再点「与验收助手新建验收」。
        </p>
        <div className="acc-modal-actions">
          <button type="button" onClick={onRetry}>
            重新核对
          </button>
          <button type="button" autoFocus onClick={onClose}>
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}
