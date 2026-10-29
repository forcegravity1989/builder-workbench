import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { GripVertical, Plus, X } from 'lucide-react'
import { MilestoneField } from './milestone-field'
import { MilestoneIconButton } from './milestone-icon-button'
import { MilestoneVersionRow } from './milestone-version-row'
import { MilestoneDeliveryNode } from './milestone-delivery-node'
import {
  reorderMilestoneFeature,
  type MilestoneDraft,
  type MilestoneFeature,
  type ScheduledVersion
} from '../../../shared/workbench/project-milestones'
import {
  latestMilestoneMonth,
  milestoneCalendar,
  milestoneDay,
  milestoneToday,
  milestoneTargets,
  targetWindow,
  materializeMilestoneWeek,
  type MilestoneTarget,
  type MilestoneWeek
} from '../../../shared/workbench/milestone-calendar'

const width = 24
const labelWidth = 230
export type MilestoneLocation = { date: string; sequence: number }
type Props = {
  draft: MilestoneDraft
  editing: boolean
  busy: boolean
  edit(update: (draft: MilestoneDraft) => MilestoneDraft): void
  editField(update: (draft: MilestoneDraft) => MilestoneDraft): void
  open(version: ScheduledVersion, feature: MilestoneFeature): void
  remove(feature: MilestoneFeature): void
  rename(id: string, version: string): void
  started: Set<string>
  onScroll(x: number, y: number): void
  scrollX: number | null
  scrollY: number
  locate: MilestoneLocation | null
  notify(message: string): void
  registerWeek(week: MilestoneWeek, name: string): void
  addFeature(): void
  newFeature: string | null
}
export function MilestoneTimeline(props: Props) {
  const { draft, editing, edit } = props
  const enabled = editing && !props.busy
  const { versions, weeks, start: origin, end } = milestoneCalendar(draft)
  const targets = milestoneTargets(draft, weeks)
  const features = draft.material.features
  const canvasWidth = (end - origin + 1) * width
  const viewport = useRef<HTMLDivElement>(null)
  const draggedRow = useRef<{ id: string; y: number; moved: boolean } | null>(null)
  const pan = useRef<{ x: number; left: number } | null>(null)
  const [hover, setHover] = useState<{ key: string; target: MilestoneTarget | null } | null>(null)
  const [rowDrop, setRowDrop] = useState<{ id: string; side: 'before' | 'after' } | null>(null)
  const initial = useRef({ x: props.scrollX, y: props.scrollY, month: latestMilestoneMonth(draft) })
  const previousOrigin = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = viewport.current
    if (!el) {
      return
    }
    if (previousOrigin.current === null) {
      el.scrollLeft =
        initial.current.x ??
        Math.max(0, (milestoneDay(`${initial.current.month}-01`) - origin) * width)
      el.scrollTop = initial.current.y
    } else if (previousOrigin.current !== origin) {
      el.scrollLeft += (previousOrigin.current - origin) * width
    }
    previousOrigin.current = origin
  }, [origin])
  const appliedLocation = useRef<MilestoneLocation | null>(props.locate)
  useLayoutEffect(() => {
    if (props.locate && props.locate !== appliedLocation.current && viewport.current) {
      viewport.current.scrollLeft = Math.max(0, (milestoneDay(props.locate.date) - origin) * width)
      appliedLocation.current = props.locate
    }
  }, [props.locate, origin])
  useLayoutEffect(() => {
    const el = viewport.current
    const row =
      props.newFeature &&
      el?.querySelector<HTMLElement>(`[data-milestone-feature="${CSS.escape(props.newFeature)}"]`)
    if (el && row) {
      el.scrollTop = Math.max(0, row.offsetTop - el.clientHeight + row.clientHeight)
    }
  }, [props.newFeature])

  function move(id: string, kind: 'pre' | 'release', target: MilestoneTarget) {
    if (!enabled) {
      return
    }
    const used =
      'week' in target
        ? materializeMilestoneWeek(draft, target.week, crypto.randomUUID())
        : { draft, version: target.version }
    const feature = used.draft.material.features.find((f) => f.id === id)
    if (!feature) {
      return
    }
    const locate = (ref: MilestoneFeature['pre']) =>
      used.draft.versions.find((v) => v.cycleId === ref?.cycleId && v.version === ref.version)
    const pre = kind === 'pre' ? used.version : locate(feature.pre)
    const release = kind === 'release' ? used.version : locate(feature.release)
    if (pre?.timeWindow && release?.timeWindow && pre.timeWindow.start > release.timeWindow.end) {
      props.notify('Pre 不能晚于 Release，已保留原安排')
      return
    }
    const ref = { version: used.version.version, cycleId: used.version.cycleId }
    edit(() => ({
      ...used.draft,
      material: {
        ...used.draft.material,
        features: used.draft.material.features.map((f) => (f.id === id ? { ...f, [kind]: ref } : f))
      }
    }))
  }
  const center = (window: MilestoneWeek) =>
    ((milestoneDay(window.start) + milestoneDay(window.end) + 1) / 2 - origin) * width
  function rowTarget(x: number, y: number) {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-milestone-feature]')
    const id = row?.dataset.milestoneFeature
    if (!row || !id || !viewport.current?.contains(row)) {
      return null
    }
    const bounds = row.getBoundingClientRect()
    return {
      id,
      side: y > bounds.top + bounds.height / 2 ? ('after' as const) : ('before' as const)
    }
  }
  const stopPan = () => {
    pan.current = null
  }
  const stopOrdering = () => {
    draggedRow.current = null
    setRowDrop(null)
  }
  const today = milestoneDay(milestoneToday())
  return (
    <div
      ref={viewport}
      className="wb-ml-scroll"
      aria-label="特性交付泳道"
      onScroll={(e) => props.onScroll(e.currentTarget.scrollLeft, e.currentTarget.scrollTop)}
      onPointerDown={(e) => {
        if (
          e.button !== 0 ||
          (e.target as HTMLElement).closest('button,input,[data-ml-stop-pan]')
        ) {
          return
        }
        pan.current = { x: e.clientX, left: e.currentTarget.scrollLeft }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (pan.current) {
          e.currentTarget.scrollLeft = pan.current.left + pan.current.x - e.clientX
        }
      }}
      onPointerUp={stopPan}
      onPointerCancel={stopPan}
      onLostPointerCapture={stopPan}
    >
      <div className="wb-ml-canvas" style={{ width: canvasWidth + labelWidth }}>
        <MilestoneVersionRow
          draft={draft}
          versions={versions}
          weeks={weeks}
          editing={editing}
          disabled={props.busy}
          canvasWidth={canvasWidth}
          origin={origin}
          started={props.started}
          rename={props.rename}
          registerWeek={props.registerWeek}
        />
        {features.map((f, row) => {
          const versionFor = (kind: 'pre' | 'release') =>
            versions.find((v) => v.cycleId === f[kind]?.cycleId && v.version === f[kind]?.version)
          const previewFor = (kind: 'pre' | 'release') =>
            hover?.key === `${f.id}:${kind}` && hover.target
              ? targetWindow(hover.target)
              : versionFor(kind)?.timeWindow
          const pre = previewFor('pre'),
            release = previewFor('release')
          const stacked = !pre || !release || Math.abs(center(pre) - center(release)) < 148
          return (
            <div
              key={f.id}
              className={`wb-ml-row${stacked ? ' stacked' : ''}${rowDrop?.id === f.id ? ` wb-ml-drop-${rowDrop.side}` : ''}`}
              data-milestone-feature={f.id}
            >
              <div className="wb-ml-label wb-ml-feature" data-ml-stop-pan>
                {editing && (
                  <MilestoneIconButton
                    className="wb-ml-grip"
                    disabled={!enabled}
                    label={`排序 ${f.title || '新特性'}`}
                    title="拖动排序；Alt + 上下键"
                    onPointerDown={(e) => {
                      if (e.button !== 0) {
                        return
                      }
                      e.preventDefault()
                      e.currentTarget.focus({ preventScroll: true })
                      draggedRow.current = { id: f.id, y: e.clientY, moved: false }
                      setRowDrop(null)
                      e.currentTarget.setPointerCapture(e.pointerId)
                    }}
                    onPointerMove={(e) => {
                      const drag = draggedRow.current
                      const el = viewport.current
                      if (!drag || !el || (!drag.moved && Math.abs(e.clientY - drag.y) < 5)) {
                        return
                      }
                      drag.moved = true
                      const bounds = el.getBoundingClientRect()
                      if (e.clientY > bounds.bottom - 30) {
                        el.scrollTop += 14
                      }
                      if (e.clientY < bounds.top + 86) {
                        el.scrollTop -= 14
                      }
                      const target = rowTarget(e.clientX, e.clientY)
                      setRowDrop(target?.id === drag.id ? null : target)
                    }}
                    onPointerUp={(e) => {
                      const drag = draggedRow.current
                      draggedRow.current = null
                      setRowDrop(null)
                      const target = rowTarget(e.clientX, e.clientY)
                      if (!enabled || !drag?.moved || !target) {
                        return
                      }
                      edit((d) => ({
                        ...d,
                        material: {
                          ...d.material,
                          features: reorderMilestoneFeature(
                            d.material.features,
                            drag.id,
                            target.id,
                            target.side
                          )
                        }
                      }))
                    }}
                    onPointerCancel={stopOrdering}
                    onLostPointerCapture={stopOrdering}
                    onKeyDown={(e) => {
                      const next = features[row + (e.key === 'ArrowUp' ? -1 : 1)]
                      if (enabled && e.altKey && ['ArrowUp', 'ArrowDown'].includes(e.key) && next) {
                        e.preventDefault()
                        edit((d) => ({
                          ...d,
                          material: {
                            ...d.material,
                            features: reorderMilestoneFeature(
                              d.material.features,
                              f.id,
                              next.id,
                              e.key === 'ArrowUp' ? 'before' : 'after'
                            )
                          }
                        }))
                      }
                    }}
                  >
                    <GripVertical size={15} />
                  </MilestoneIconButton>
                )}
                <div>
                  <MilestoneField
                    label="特性名称"
                    autoFocus={f.id === props.newFeature}
                    value={f.title}
                    editable={enabled}
                    onChange={(title) =>
                      props.editField((d) => ({
                        ...d,
                        material: {
                          ...d.material,
                          features: d.material.features.map((v) =>
                            v.id === f.id ? { ...v, title } : v
                          )
                        }
                      }))
                    }
                  />
                  <small>
                    <MilestoneField
                      label="负责人"
                      value={f.owner}
                      editable={enabled}
                      onChange={(owner) =>
                        props.editField((d) => ({
                          ...d,
                          material: {
                            ...d.material,
                            features: d.material.features.map((v) =>
                              v.id === f.id ? { ...v, owner } : v
                            )
                          }
                        }))
                      }
                    />
                  </small>
                </div>
              </div>
              <div className="wb-ml-track wb-ml-week-grid" style={{ width: canvasWidth }}>
                {hover?.key.startsWith(`${f.id}:`) && hover.target && (
                  <div
                    className="wb-ml-drop-target"
                    style={{
                      left: (milestoneDay(targetWindow(hover.target).start) - origin) * width,
                      width:
                        (milestoneDay(targetWindow(hover.target).end) -
                          milestoneDay(targetWindow(hover.target).start) +
                          1) *
                        width
                    }}
                  />
                )}
                {today >= origin && today <= end && (
                  <i className="wb-ml-today" style={{ left: (today - origin) * width }} />
                )}
                {(['pre', 'release'] as const).map((kind) => {
                  const version = versionFor(kind)
                  const window = previewFor(kind)
                  const active = hover?.key === `${f.id}:${kind}`
                  const name =
                    active && hover.target
                      ? 'version' in hover.target
                        ? hover.target.version.version
                        : '新版本'
                      : version?.version
                  const left = window ? center(window) - 69 : 6
                  return (
                    <MilestoneDeliveryNode
                      key={kind}
                      kind={kind}
                      version={version}
                      name={name ?? (f[kind] ? '对应版本缺少排期' : '安排版本')}
                      active={active}
                      left={left}
                      top={stacked ? (kind === 'pre' ? 10 : 54) : 26}
                      enabled={enabled}
                      editing={editing}
                      draft={draft}
                      origin={origin}
                      end={end}
                      targets={targets}
                      viewport={viewport}
                      hover={(target) =>
                        setHover(target ? { key: `${f.id}:${kind}`, target } : null)
                      }
                      move={(target) => move(f.id, kind, target)}
                      open={() => version && props.open(version, f)}
                    />
                  )
                })}
              </div>
              {editing && (
                <div className="wb-ml-row-actions" data-ml-stop-pan>
                  <MilestoneIconButton
                    label={`移除 ${f.title || '新特性'}`}
                    disabled={!enabled}
                    onClick={() => props.remove(f)}
                  >
                    <X size={14} />
                  </MilestoneIconButton>
                </div>
              )}
            </div>
          )
        })}
        {!features.length && (
          <div className="wb-ml-empty-row">
            <div className="wb-ml-label" />
            <div className="wb-ml-track wb-ml-week-grid" style={{ width: canvasWidth }} />
          </div>
        )}
        {editing && (
          <div className="wb-ml-add-feature">
            <Button variant="ghost" size="xs" disabled={!enabled} onClick={props.addFeature}>
              <Plus size={13} />
              添加特性
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
