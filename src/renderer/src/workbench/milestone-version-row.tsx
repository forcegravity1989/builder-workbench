import { MilestoneField } from './milestone-field'
import { MilestoneVersionEditor } from './milestone-version-editor'
import type { MilestoneDraft, ScheduledVersion } from '../../../shared/workbench/project-milestones'

export function MilestoneVersionRow({
  draft,
  versions,
  editing,
  disabled,
  canvasWidth,
  origin,
  started,
  rename,
  save
}: {
  draft: MilestoneDraft
  versions: ScheduledVersion[]
  editing: boolean
  disabled: boolean
  canvasWidth: number
  origin: number
  started: Set<string>
  rename(id: string, version: string): void
  save(version: ScheduledVersion): void
}) {
  const at = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000
  return (
    <div className="wb-ml-version-row">
      <div className="wb-ml-label">目标版本</div>
      <div
        className="wb-ml-track"
        style={{ width: canvasWidth + (editing && versions.length ? 130 : 0) }}
      >
        {versions.map((v) => (
          <div
            className="wb-ml-window"
            key={v.cycleId}
            style={{
              left: (at(v.timeWindow!.start) - origin) * 28,
              width: (at(v.timeWindow!.end) - at(v.timeWindow!.start) + 1) * 28
            }}
          >
            <MilestoneField
              label="版本名称"
              value={v.version}
              editable={editing && !disabled && !started.has(v.cycleId)}
              onChange={(value) => rename(v.cycleId, value)}
            />
            {editing ? (
              <MilestoneVersionEditor
                draft={draft}
                version={v}
                started={started.has(v.cycleId)}
                startedVersions={started}
                disabled={disabled}
                save={save}
              />
            ) : (
              <small>
                {v.timeWindow!.start.slice(5)} — {v.timeWindow!.end.slice(5)}
              </small>
            )}
          </div>
        ))}
        {editing && (
          <div className="wb-ml-new-version" style={{ left: versions.length ? canvasWidth : 12 }}>
            <MilestoneVersionEditor
              draft={draft}
              startedVersions={started}
              disabled={disabled}
              save={save}
            />
          </div>
        )}
      </div>
    </div>
  )
}
