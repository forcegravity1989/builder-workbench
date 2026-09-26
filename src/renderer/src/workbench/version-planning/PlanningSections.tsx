import type { RefObject } from 'react'

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
  archiveOpen,
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
  archiveOpen: boolean
  preparationRef: RefObject<HTMLElement | null>
  goalsRef: RefObject<HTMLElement | null>
  onMinutes(): void
  onTasks(): void
  onArchive(): void
}) {
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
        <span className={`vp-dot ${archived ? 'done' : archiveOpen ? 'pending' : ''}`} />
        归档
      </button>
    </nav>
  )
}
