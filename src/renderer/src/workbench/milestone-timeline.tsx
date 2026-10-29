import { useEffect, useRef, useState } from 'react'
import { MilestoneField } from './milestone-field'
import { MilestoneIconButton } from './milestone-icon-button'
import { Button } from '@/components/ui/button'
import { MilestoneVersionRow } from './milestone-version-row'
import { Diamond, ExternalLink, GripVertical, Plus, Trash2 } from 'lucide-react'
import {
  reorderMilestoneFeature,
  pickMilestoneVersion,
  type MilestoneDraft,
  type MilestoneFeature,
  type ScheduledVersion
} from '../../../shared/workbench/project-milestones'

const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000
const iso = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10)
const width = 28
const labelWidth = 230
type Props = {
  draft: MilestoneDraft
  month: string
  editing: boolean
  busy: boolean
  edit(update: (draft: MilestoneDraft) => MilestoneDraft): void
  editField(update: (draft: MilestoneDraft) => MilestoneDraft): void
  open(version: ScheduledVersion, feature: MilestoneFeature): void
  remove(feature: MilestoneFeature): void
  rename(id: string, version: string): void
  started: Set<string>
  onScroll(x: number, y: number): void
  scrollX: number
  scrollY: number
  locate: string | null
  notify(message: string): void
  saveVersion(version: ScheduledVersion): void
  addFeature(): void
  newFeature: string | null
}
export function MilestoneTimeline(props: Props) {
  const { draft, month, editing, edit } = props
  const enabled = editing && !props.busy
  const versions = draft.versions
    .filter(
      (v) =>
        v.timeWindow &&
        Number.isFinite(day(v.timeWindow.start)) &&
        day(v.timeWindow.end) >= day(v.timeWindow.start)
    )
    .sort((a, b) => a.timeWindow!.start.localeCompare(b.timeWindow!.start))
  const features = draft.material.features.filter((f) => f.month === month)
  const origin = versions.length
    ? Math.min(...versions.map((v) => day(v.timeWindow!.start)))
    : day(`${month}-01`)
  const end = versions.length
    ? Math.max(...versions.map((v) => day(v.timeWindow!.end)))
    : Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0) / 86400000
  const canvasWidth = Math.max(600, (end - origin + 1) * width)
  const viewport = useRef<HTMLDivElement>(null)
  const draggedRow = useRef<{ id: string; y: number; moved: boolean } | null>(null)
  const pointer = useRef<{
    id: string
    kind: 'pre' | 'release'
    start: number
    moved: boolean
    version: ScheduledVersion | null
  } | null>(null)
  const ignoreClick = useRef(false)
  const [hover, setHover] = useState<{ key: string; version: ScheduledVersion | null } | null>(null)
  const tickCount = Number.isFinite(origin) ? Math.min(1100, Math.ceil((end - origin + 1) / 7)) : 0
  const initialScroll = useRef({ x: props.scrollX, y: props.scrollY })
  useEffect(() => {
    if (viewport.current) {
      viewport.current.scrollLeft = initialScroll.current.x
      viewport.current.scrollTop = initialScroll.current.y
    }
  }, [])
  const located = versions.find((item) => item.cycleId === props.locate)
  const locatePosition = located ? day(located.timeWindow!.start) : day(`${props.locate}-01`)
  useEffect(() => {
    if (!props.locate || !viewport.current || !Number.isFinite(origin)) {
      return
    }
    if (Number.isFinite(locatePosition)) {
      viewport.current.scrollTo({
        left: Math.max(0, (locatePosition - origin) * width),
        behavior: 'smooth'
      })
    }
  }, [props.locate, locatePosition, origin])
  function move(id: string, kind: 'pre' | 'release', target: ScheduledVersion) {
    if (!enabled) {
      return
    }
    const ref = { version: target.version, cycleId: target.cycleId }
    const f = draft.material.features.find((item) => item.id === id)
    if (!f) {
      return
    }
    const pre = kind === 'pre' ? target : versions.find((v) => v.cycleId === f.pre?.cycleId)
    const release =
      kind === 'release' ? target : versions.find((v) => v.cycleId === f.release?.cycleId)
    if (pre?.timeWindow && release?.timeWindow && pre.timeWindow.start > release.timeWindow.end) {
      props.notify('Pre 不能晚于 Release，已保留原安排')
      return
    }
    edit((d) => ({
      ...d,
      material: {
        ...d.material,
        features: d.material.features.map((item) =>
          item.id === id ? { ...item, [kind]: ref } : item
        )
      }
    }))
  }
  const today = day(new Date().toISOString().slice(0, 10))
  return (
    <div
      ref={viewport}
      className="wb-ml-scroll"
      onScroll={(e) => props.onScroll(e.currentTarget.scrollLeft, e.currentTarget.scrollTop)}
    >
      <div
        className="wb-ml-canvas"
        style={{ width: canvasWidth + labelWidth + (editing && versions.length ? 130 : 0) }}
      >
        <div className="wb-ml-date-row">
          <div className="wb-ml-label">特性 / 负责人</div>
          <div className="wb-ml-track" style={{ width: canvasWidth }}>
            {Array.from({ length: tickCount }, (_, i) => (
              <span key={i} style={{ left: i * 7 * width }}>
                {iso(origin + i * 7).slice(5)}
              </span>
            ))}
          </div>
        </div>
        <MilestoneVersionRow
          draft={draft}
          versions={versions}
          editing={editing}
          disabled={props.busy}
          canvasWidth={canvasWidth}
          origin={origin}
          started={props.started}
          rename={props.rename}
          save={props.saveVersion}
        />
        {features.map((f, row) => (
          <div key={f.id} className="wb-ml-row" data-milestone-feature={f.id}>
            <div className="wb-ml-label wb-ml-feature">
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
                    e.currentTarget.setPointerCapture(e.pointerId)
                  }}
                  onPointerMove={(e) => {
                    const drag = draggedRow.current
                    if (drag && Math.abs(e.clientY - drag.y) >= 5) {
                      drag.moved = true
                    }
                  }}
                  onPointerUp={(e) => {
                    const drag = draggedRow.current
                    draggedRow.current = null
                    const target = document
                      .elementFromPoint(e.clientX, e.clientY)
                      ?.closest<HTMLElement>('[data-milestone-feature]')
                    const to = target?.dataset.milestoneFeature
                    if (!drag?.moved || !target || !to || !viewport.current?.contains(target)) {
                      return
                    }
                    edit((d) => ({
                      ...d,
                      material: {
                        ...d.material,
                        features: reorderMilestoneFeature(d.material.features, drag.id, to)
                      }
                    }))
                  }}
                  onPointerCancel={() => {
                    draggedRow.current = null
                  }}
                  onLostPointerCapture={() => {
                    draggedRow.current = null
                  }}
                  onKeyDown={(e) => {
                    const next = features[row + (e.key === 'ArrowUp' ? -1 : 1)]
                    if (e.altKey && ['ArrowUp', 'ArrowDown'].includes(e.key) && next) {
                      e.preventDefault()
                      edit((d) => ({
                        ...d,
                        material: {
                          ...d.material,
                          features: reorderMilestoneFeature(d.material.features, f.id, next.id)
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
              {editing && (
                <MilestoneIconButton
                  className="wb-ml-remove"
                  label={`移除 ${f.title || '新特性'}`}
                  disabled={!enabled}
                  onClick={() => props.remove(f)}
                >
                  <Trash2 size={14} />
                </MilestoneIconButton>
              )}
            </div>
            <div
              className="wb-ml-track wb-ml-deliveries"
              style={{ width: canvasWidth, backgroundSize: `${7 * width}px 100%` }}
            >
              {today >= origin && today <= end && (
                <i className="wb-ml-today" style={{ left: (today - origin) * width }} />
              )}
              {(['pre', 'release'] as const).map((kind) => {
                const version = versions.find(
                  (v) => v.cycleId === f[kind]?.cycleId && v.version === f[kind]?.version
                )
                const preview =
                  hover?.key === `${f.id}:${kind}` ? (hover.version ?? version) : version
                const left = preview ? (day(preview.timeWindow!.start) - origin) * width + 6 : 6
                return (
                  <button
                    key={kind}
                    className={`wb-ml-node ${kind} ${hover?.key === `${f.id}:${kind}` ? 'moving' : ''}`}
                    style={{ left, top: kind === 'pre' ? 8 : 56 }}
                    title={editing ? '拖到版本时间窗口；Shift + 左右键移动' : '进入对应版本'}
                    onPointerDown={(e) => {
                      if (!enabled || !versions.length || e.button !== 0) {
                        return
                      }
                      pointer.current = {
                        id: f.id,
                        kind,
                        start: e.clientX,
                        moved: false,
                        version: null
                      }
                      e.currentTarget.setPointerCapture(e.pointerId)
                    }}
                    onPointerMove={(e) => {
                      const drag = pointer.current,
                        el = viewport.current
                      if (!drag || !el) {
                        return
                      }
                      if (Math.abs(e.clientX - drag.start) < 5 && !drag.moved) {
                        return
                      }
                      drag.moved = true
                      const bounds = el.getBoundingClientRect()
                      if (e.clientX > bounds.right - 45) {
                        el.scrollLeft += 18
                      }
                      if (e.clientX < bounds.left + labelWidth + 35) {
                        el.scrollLeft -= 18
                      }
                      const date =
                        origin + (e.clientX - bounds.left + el.scrollLeft - labelWidth) / width
                      drag.version = pickMilestoneVersion(versions, date)
                      setHover({ key: `${f.id}:${kind}`, version: drag.version })
                    }}
                    onPointerUp={() => {
                      const drag = pointer.current
                      pointer.current = null
                      setHover(null)
                      if (drag?.moved) {
                        ignoreClick.current = true
                        if (drag.version) {
                          move(f.id, kind, drag.version)
                        }
                      }
                    }}
                    onPointerCancel={() => {
                      pointer.current = null
                      setHover(null)
                      ignoreClick.current = true
                    }}
                    onKeyDown={(e) => {
                      if (
                        !enabled ||
                        !versions.length ||
                        !e.shiftKey ||
                        !['ArrowLeft', 'ArrowRight'].includes(e.key)
                      ) {
                        return
                      }
                      e.preventDefault()
                      const at = version ? versions.indexOf(version) : -1
                      const target =
                        versions[
                          Math.max(
                            0,
                            Math.min(versions.length - 1, at + (e.key === 'ArrowLeft' ? -1 : 1))
                          )
                        ]
                      move(f.id, kind, target)
                    }}
                    onClick={() => {
                      if (ignoreClick.current) {
                        ignoreClick.current = false
                        return
                      }
                      if (version) {
                        props.open(version, f)
                      } else if (editing && versions.length) {
                        move(f.id, kind, versions[0])
                      }
                    }}
                  >
                    <strong>
                      <span>
                        <Diamond size={10} />
                        {kind === 'pre' ? 'Pre版本' : 'Release版本'}
                      </span>
                      {version && <ExternalLink size={13} />}
                    </strong>
                    <small>{preview?.version ?? (f[kind] ? '对应版本缺少排期' : '安排版本')}</small>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {!features.length && (
          <div className="wb-ml-empty-row">
            <div className="wb-ml-label">{versions.length ? '还没有特性' : '先登记版本'}</div>
            <div className="wb-ml-track wb-ml-empty-grid" style={{ width: canvasWidth }}>
              <span>
                {versions.length
                  ? '在下方添加特性，拖动安排 Pre / Release。'
                  : '登记名称和日期后，在这里安排特性。'}
              </span>
            </div>
          </div>
        )}
        {editing && versions.length > 0 && (
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
