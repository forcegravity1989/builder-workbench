import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  ScheduledVersionSchema,
  type MilestoneDraft,
  type ScheduledVersion
} from '../../../shared/workbench/project-milestones'

export function MilestoneVersionEditor({
  draft,
  version,
  started,
  startedVersions,
  disabled,
  save
}: {
  draft: MilestoneDraft
  version?: ScheduledVersion
  started?: boolean
  startedVersions?: Set<string>
  disabled: boolean
  save(version: ScheduledVersion): void
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<ScheduledVersion>({
    version: '',
    cycleId: '',
    timeWindow: { start: '', end: '' }
  })
  const [error, setError] = useState('')
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setValue(
            version
              ? structuredClone(version)
              : { version: '', cycleId: crypto.randomUUID(), timeWindow: { start: '', end: '' } }
          )
          setError('')
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          disabled={disabled}
          aria-label={version ? `编辑 ${version.version} 日期` : '登记版本'}
        >
          {version ? (
            `${version.timeWindow?.start.slice(5)} — ${version.timeWindow?.end.slice(5)}`
          ) : (
            <>
              <Plus size={13} />
              版本
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="wb-ml-versions" align="end">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (disabled) {
              return
            }
            const parsed = ScheduledVersionSchema.safeParse(value)
            if (!parsed.success || !parsed.data.timeWindow) {
              setError('请填写版本名称和有效的起止日期')
              return
            }
            const candidate = parsed.data
            if (
              draft.versions.some(
                (v) =>
                  v.cycleId !== candidate.cycleId &&
                  v.version.toLowerCase() === candidate.version.toLowerCase()
              )
            ) {
              setError('版本名称已存在')
              return
            }
            const versions = draft.versions
              .filter((v) => v.cycleId !== candidate.cycleId)
              .concat(candidate)
            const conflict = draft.material.features.find((f) => {
              const pre = versions.find((v) => v.cycleId === f.pre?.cycleId)?.timeWindow
              const release = versions.find((v) => v.cycleId === f.release?.cycleId)?.timeWindow
              return pre && release && pre.start > release.end
            })
            if (conflict) {
              setError(`${conflict.title || '特性'}：Pre 不能晚于 Release`)
              return
            }
            save(candidate)
            setOpen(false)
          }}
        >
          <strong>{version ? '版本日期' : '登记版本'}</strong>
          {!version && (
            <label>
              版本
              <select
                aria-label="选择版本"
                disabled={disabled}
                value={
                  draft.versions.some((v) => v.cycleId === value.cycleId) ? value.cycleId : 'new'
                }
                onChange={(event) => {
                  const picked = draft.versions.find((v) => v.cycleId === event.target.value)
                  setValue(
                    picked
                      ? {
                          ...structuredClone(picked),
                          timeWindow: picked.timeWindow ?? { start: '', end: '' }
                        }
                      : {
                          version: '',
                          cycleId: crypto.randomUUID(),
                          timeWindow: { start: '', end: '' }
                        }
                  )
                  setError('')
                }}
              >
                <option value="new">新建版本</option>
                {draft.versions
                  .filter((v) => !v.timeWindow)
                  .map((v) => (
                    <option key={v.cycleId} value={v.cycleId}>
                      {v.version} · 补排期
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            版本名称
            <input
              aria-label="登记版本名称"
              value={value.version}
              disabled={disabled || started || startedVersions?.has(value.cycleId)}
              onChange={(e) => setValue((v) => ({ ...v, version: e.target.value }))}
            />
          </label>
          {(started || startedVersions?.has(value.cycleId)) && (
            <small>已开始计划，名称沿真实版本</small>
          )}
          <div className="wb-ml-version-dates">
            <label>
              开始
              <input
                type="date"
                aria-label="版本开始日期"
                disabled={disabled}
                value={value.timeWindow?.start ?? ''}
                onChange={(e) =>
                  setValue((v) => ({
                    ...v,
                    timeWindow: { start: e.target.value, end: v.timeWindow?.end || e.target.value }
                  }))
                }
              />
            </label>
            <label>
              结束
              <input
                type="date"
                aria-label="版本结束日期"
                disabled={disabled}
                value={value.timeWindow?.end ?? ''}
                onChange={(e) =>
                  setValue((v) => ({
                    ...v,
                    timeWindow: {
                      start: v.timeWindow?.start || e.target.value,
                      end: e.target.value
                    }
                  }))
                }
              />
            </label>
          </div>
          {error && <p role="alert">{error}</p>}
          <footer>
            <Button variant="ghost" size="xs" type="button" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              size="xs"
              type="submit"
              disabled={disabled}
              className="bg-foreground text-background hover:bg-foreground/90"
            >
              {version ? '保存' : '添加版本'}
            </Button>
          </footer>
        </form>
      </PopoverContent>
    </Popover>
  )
}
