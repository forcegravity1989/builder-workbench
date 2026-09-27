import type { RefObject } from 'react'
import type { VersionMaterialCandidate } from '../../../../shared/workbench/version-material-request'
import {
  archiveJourneyLamp,
  type ArchiveStatus
} from '../../../../shared/workbench/version-archive'

/** Version chooser over host-listed candidates; unreadable/migration states stay visible but disabled. */
export function PlanningVersionSelect({
  currentVersion,
  versions,
  disabled,
  onSelect
}: {
  currentVersion: string
  versions: VersionMaterialCandidate[]
  disabled: boolean
  onSelect(version: string): void
}) {
  return (
    <select
      aria-label="计划版本"
      value={currentVersion}
      disabled={disabled}
      onChange={(event) => {
        if (event.target.value) {
          onSelect(event.target.value)
        }
      }}
    >
      <option value="">待选择版本</option>
      {versions.map((item) => (
        <option key={item.version} value={item.version} disabled={item.state !== 'ready'}>
          {item.version}
          {item.state !== 'ready'
            ? ` · ${item.state === 'migration-required' ? '需迁移' : '无法读取'}`
            : ''}
        </option>
      ))}
      {currentVersion && !versions.some((item) => item.version === currentVersion) && (
        <option value={currentVersion}>{currentVersion} · 新草稿</option>
      )}
    </select>
  )
}

/** Board header: version chooser plus the explicit create / next-round actions. */
export function PlanningHeader({
  currentVersion,
  versions,
  portReady,
  materialBusy,
  selecting,
  archived,
  onToggleCreate,
  onSelect,
  onNextRound
}: {
  currentVersion: string
  versions: VersionMaterialCandidate[]
  portReady: boolean
  materialBusy: boolean
  selecting: boolean
  archived: boolean
  onToggleCreate(): void
  onSelect(version: string): void
  onNextRound(): void
}) {
  return (
    <header className="vp-header">
      <div>
        <h1>版本计划</h1>
        <span className="vp-muted">准备 → 目标 → 评审 → 拆解 → 归档</span>
      </div>
      <div className="vp-inline">
        <PlanningVersionSelect
          currentVersion={currentVersion}
          versions={versions}
          disabled={!portReady || materialBusy || selecting}
          onSelect={onSelect}
        />
        <button
          className="wb-btn wb-btn-ghost wb-btn-sm"
          disabled={!portReady || selecting}
          onClick={onToggleCreate}
        >
          新建版本
        </button>
        {archived && (
          <button
            className="wb-btn wb-btn-ghost wb-btn-sm"
            disabled={materialBusy || selecting}
            onClick={onNextRound}
          >
            开始下一轮计划
          </button>
        )}
      </div>
    </header>
  )
}

/** Explicit new-version draft creation; the page never auto-creates material. */
export function PlanningCreateForm({
  newVersion,
  busy,
  onNewVersion,
  onCreate
}: {
  newVersion: string
  busy: boolean
  onNewVersion(value: string): void
  onCreate(version: string): void
}) {
  return (
    <form
      className="vp-create"
      onSubmit={(event) => {
        event.preventDefault()
        onCreate(newVersion.trim())
      }}
    >
      <label>
        版本名称
        <input
          autoFocus
          value={newVersion}
          onChange={(event) => onNewVersion(event.target.value)}
          placeholder="例如 v0.5"
          required
        />
      </label>
      <button className="wb-btn wb-btn-sm" disabled={busy}>
        创建计划草稿
      </button>
    </form>
  )
}

/** Journey axis: dots derive from current data; the axis itself never scrolls. */
export function PlanningJourneyNav({
  hasPlan,
  goalCount,
  taskCount,
  archived,
  archive,
  preparationRef,
  goalsRef,
  onMinutes,
  onTasks,
  onArchive
}: {
  hasPlan: boolean
  goalCount: number
  taskCount: number
  archived: boolean
  archive: ArchiveStatus
  preparationRef: RefObject<HTMLElement | null>
  goalsRef: RefObject<HTMLElement | null>
  onMinutes(): void
  onTasks(): void
  onArchive(): void
}) {
  const lamp = archiveJourneyLamp(archive, archived)
  const archiveDot =
    lamp === 'complete'
      ? 'done'
      : lamp === 'failed'
        ? 'failed'
        : lamp === 'pending'
          ? 'pending'
          : ''
  return (
    <nav className="vp-journey" aria-label="计划流程">
      <button
        onClick={() =>
          preparationRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
        }
      >
        <span className={`vp-dot ${hasPlan ? 'pending' : ''}`} />
        准备
      </button>
      <button
        onClick={() => goalsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
      >
        <span className={`vp-dot ${goalCount ? 'pending' : ''}`} />
        目标
      </button>
      <button disabled={!hasPlan} onClick={onMinutes}>
        <span className="vp-dot" />
        评审
      </button>
      <button disabled={!hasPlan} onClick={onTasks}>
        <span className={`vp-dot ${taskCount ? 'pending' : ''}`} />
        拆解
      </button>
      <button disabled={!hasPlan} onClick={onArchive}>
        <span className={`vp-dot ${archiveDot}`} />
        归档
      </button>
    </nav>
  )
}
