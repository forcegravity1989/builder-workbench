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
 * The board persists here until the first start click — entering the screen
 * never initializes — and that click chains the gate check, material
 * initialization and the session launch, so acceptance never begins without
 * its session. The hard gate reports its own state so an empty board is never
 * unexplained.
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
  gate: { state: AcceptanceGateState; recheck(): Promise<AcceptanceGateState | undefined> }
  context: VersionCycleContext
  entry: CycleEntry
  unreadable: string[]
  state: string
  chatCollapsed: boolean
  onSessionToggle(): void
  onRefresh(): void
}) {
  const [gateBlocked, setGateBlocked] = useState<string | null>(null)
  /**
   * First-click start: ask the gate for a verdict (a fresh check unless it
   * already reported merged), initialize the material from the plan, persist
   * it, then open the session. Every refusal reports itself — nothing starts
   * silently, and the board never initializes without this click.
   */
  const startAcceptance = () => {
    if (gate.state.kind === 'blocked') {
      setGateBlocked(gate.state.reason)
      return
    }
    void (async () => {
      const verdict = gate.state.kind === 'merged' ? gate.state : await gate.recheck()
      if (!verdict || verdict.kind !== 'merged') {
        if (verdict?.kind === 'blocked') {
          setGateBlocked(verdict.reason)
        }
        return
      }
      try {
        await board.initialize()
        // The session's first prompt tells the model to read the current
        // material; flush the fresh draft to the worktree before opening it.
        if (!(await board.retrySave())) {
          board.setError('验收材料未能保存，请处理保存提示后再开始会话。')
          return
        }
      } catch (reason) {
        board.setError(reason instanceof Error ? reason.message : String(reason))
        return
      }
      void entry.start(
        [
          board.version ? `本次验收版本：${board.version}。请读取该版本的当前材料并继续协作。` : '',
          board.materialProblems.length
            ? materialProblemRequest(board.materialProblems, 'acceptance', board.version)
            : ''
        ]
          .filter(Boolean)
          .join('\n') || undefined
      )
    })()
  }
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
          version={board.version}
          gate={gate.state}
          onStart={startAcceptance}
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
 * The single acceptance-start entry, shown only on an empty board. The click
 * runs the whole first-start chain — gate check, material initialization,
 * session launch — and every refusal reports itself instead of starting half
 * of it. A version must be selected: initialization builds from that
 * version's committed plan.
 */
function AcceptanceStartButton({
  entry,
  version,
  gate,
  onStart
}: {
  entry: CycleEntry
  version: string
  gate: { kind: string; reason?: string }
  onStart(): void
}) {
  return (
    <button
      type="button"
      disabled={entry.busy || !version || gate.kind === 'checking'}
      onClick={onStart}
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
