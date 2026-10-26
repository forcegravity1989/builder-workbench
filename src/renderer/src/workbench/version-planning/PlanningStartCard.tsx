import { BoardActionButton } from '../board-ui'

export function PlanningStartCard({
  version,
  busy,
  onStart
}: {
  version: string | null
  busy: boolean
  onStart(): void
}) {
  return (
    <div className="vc-start-card">
      <div className="vc-start-line">
        <p>{version ? `${version} ` : ''}计划尚未开始</p>
        <BoardActionButton disabled={busy} onClick={onStart}>
          {busy ? '正在打开会话…' : '开始计划'}
        </BoardActionButton>
      </div>
    </div>
  )
}
