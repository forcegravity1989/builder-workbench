import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type {
  MilestoneDraft,
  MilestoneVersion,
  ScheduledVersion
} from '../../../shared/workbench/project-milestones'
import { MilestoneField } from './milestone-field'

export function MilestoneVersionEditor({
  draft,
  existing,
  busy,
  updateVersion,
  edit
}: {
  draft: MilestoneDraft
  existing: MilestoneVersion[]
  busy: boolean
  updateVersion(id: string, values: Partial<ScheduledVersion>): void
  edit(update: (d: MilestoneDraft) => MilestoneDraft): void
}) {
  const [versionEditor, setVersionEditor] = useState(false)
  return (
    <Popover open={versionEditor} onOpenChange={setVersionEditor}>
      <PopoverTrigger asChild>
        <button className="wb-btn wb-btn-secondary wb-btn-sm" disabled={busy}>
          版本与日期
        </button>
      </PopoverTrigger>
      <PopoverContent className="wb-ml-versions" align="end">
        <strong>版本与日期</strong>
        {draft.versions.map((v) => {
          const started = existing.find((item) => item.cycleId === v.cycleId)?.started
          return (
            <div className="wb-ml-version-edit" key={v.cycleId}>
              <MilestoneField
                label="版本名称"
                value={v.version}
                editable={!started && !busy}
                onChange={(version) => updateVersion(v.cycleId, { version })}
              />
              {!existing.some((item) => item.cycleId === v.cycleId) && (
                <button
                  className="wb-btn wb-btn-ghost wb-btn-sm"
                  disabled={busy}
                  aria-label={`撤销登记 ${v.version || '新版本'}`}
                  onClick={() =>
                    edit((d) => ({
                      ...d,
                      versions: d.versions.filter((item) => item.cycleId !== v.cycleId),
                      material: {
                        ...d.material,
                        features: d.material.features.map((f) => ({
                          ...f,
                          pre: f.pre?.cycleId === v.cycleId ? null : f.pre,
                          release: f.release?.cycleId === v.cycleId ? null : f.release
                        }))
                      }
                    }))
                  }
                >
                  <X size={13} />
                  撤销登记
                </button>
              )}
              {started && <small>已开始计划，名称沿真实版本</small>}
              <div>
                <label>
                  开始
                  <input
                    type="date"
                    aria-label={`${v.version} 开始日期`}
                    disabled={busy}
                    value={v.timeWindow?.start ?? ''}
                    onChange={(e) =>
                      updateVersion(v.cycleId, {
                        timeWindow: {
                          start: e.target.value,
                          end: v.timeWindow?.end || e.target.value
                        }
                      })
                    }
                  />
                </label>
                <label>
                  结束
                  <input
                    type="date"
                    aria-label={`${v.version} 结束日期`}
                    disabled={busy}
                    value={v.timeWindow?.end ?? ''}
                    onChange={(e) =>
                      updateVersion(v.cycleId, {
                        timeWindow: {
                          start: v.timeWindow?.start || e.target.value,
                          end: e.target.value
                        }
                      })
                    }
                  />
                </label>
              </div>
            </div>
          )
        })}
        <button
          className="wb-btn wb-btn-secondary"
          disabled={busy}
          onClick={() =>
            edit((d) => ({
              ...d,
              versions: [...d.versions, { version: '', cycleId: crypto.randomUUID() }]
            }))
          }
        >
          <Plus size={14} />
          登记版本
        </button>
        <small>通用日历 · 加班日数据尚未接入</small>
      </PopoverContent>
    </Popover>
  )
}
