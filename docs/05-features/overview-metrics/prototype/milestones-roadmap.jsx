import { Modal } from './milestones-panels.jsx'
import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import Flag from 'lucide-react/dist/esm/icons/flag.js'
import { InlineField } from './milestones-fields.jsx'
import { day } from './milestones-sdlc.js'
import { dayWidth, labelWidth } from './milestones-calendar.js'
// eslint-disable-next-line no-unused-vars
const { React, useState, useRef, useEffect, CircleHelp, X } = window.BWPrototypeDependencies

export function FloatingPanel({ anchor, label, close, children, className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    const panel = ref.current
    const place = () => {
      const rect = anchor.getBoundingClientRect()
      panel.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - panel.offsetWidth - 12))}px`
      panel.style.top = `${Math.max(12, Math.min(rect.bottom + 8, innerHeight - panel.offsetHeight - 12))}px`
    }
    panel.showPopover()
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      panel.hidePopover()
    }
  }, [anchor, label])
  return (
    <div
      ref={ref}
      popover="auto"
      role="dialog"
      aria-label={label}
      className={`ml-floating-panel ${className}`}
      onToggle={(e) => {
        if (e.newState === 'closed') {
          close()
        }
      }}
    >
      {children}
    </div>
  )
}

function MilestoneCaption({ item, planning, onChange, onRemove, onRead }) {
  return (
    <div className="ml-milestone-caption">
      {planning ? (
        <InlineField
          value={item.outcome}
          label={`${item.date || item.month} 里程碑成果`}
          multiline
          maxLength={200}
          className="ml-node-summary"
          change={(outcome) => onChange({ ...item, outcome })}
        />
      ) : (
        <button className="ml-node-summary" title={item.outcome} onClick={onRead}>
          {item.outcome}
        </button>
      )}
      {planning && (
        <button
          className="ml-node-remove"
          aria-label={`删除里程碑：${item.outcome}`}
          title="删除里程碑，可撤销"
          onClick={() => onRemove(item.id)}
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

export function MilestoneAxis({ milestones, planning, start, width, onAdd, onChange, onRemove }) {
  const [selected, setSelected] = useState(null)
  const groups = []
  for (const item of milestones
    .filter((m) => m.date)
    .toSorted((a, b) => a.date.localeCompare(b.date))) {
    const last = groups.at(-1)
    if (last?.date === item.date) {
      last.items.push(item)
    } else {
      groups.push({
        date: item.date,
        left: (day(item.date) - start) * dayWidth + dayWidth / 2,
        items: [item]
      })
    }
  }
  useEffect(() => setSelected(null), [planning])
  const undated = milestones.filter((m) => !m.date)
  const open = (event, items) =>
    setSelected({ anchor: event.currentTarget, ids: items.map((item) => item.id) })
  const selectedItems = selected ? milestones.filter((m) => selected.ids.includes(m.id)) : []
  return (
    <>
      <section
        className="ml-roadmap"
        aria-label="关键里程碑，与特性共用日轴"
        style={{ width: width + labelWidth }}
      >
        <div className="ml-sticky-label">
          {planning && (
            <IconAction className="ml-cell-add" label="添加里程碑" icon={Flag} onClick={onAdd} />
          )}
          <strong>关键里程碑</strong>
          {undated.length > 0 && (
            <button className="ml-undated" onClick={(e) => open(e, undated)}>
              未指定日期 · {undated.length}
            </button>
          )}
        </div>
        <div className="ml-roadmap-dates" style={{ width }}>
          {groups.map((group, i) => {
            const nodeWidth = Math.max(
              28,
              Math.min(
                208,
                group.left - (groups[i - 1]?.left ?? -Infinity) - 12,
                (groups[i + 1]?.left ?? Infinity) - group.left - 12
              )
            )
            const title =
              group.items.length > 1 ? `${group.items.length} 个里程碑` : group.items[0].outcome
            return (
              <div
                className="ml-milestone-node"
                key={group.date}
                style={{ left: group.left - nodeWidth / 2, width: nodeWidth }}
              >
                <button
                  className="ml-milestone-date"
                  style={{ left: nodeWidth / 2 }}
                  aria-label={`${group.date} ${title}`}
                  title={`${group.date} ${group.items.map((m) => m.outcome).join('；')}`}
                  onClick={(e) => open(e, group.items)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    open(e, group.items)
                  }}
                >
                  <Flag size={17} />
                  {nodeWidth >= 90 && <span>{group.date.slice(5).replace('-', '/')}</span>}
                  {group.items.length > 1 && nodeWidth >= 90 && <small>{group.items.length}</small>}
                </button>
                {nodeWidth >= 80 &&
                  (group.items.length === 1 ? (
                    <MilestoneCaption
                      item={group.items[0]}
                      planning={planning}
                      onChange={onChange}
                      onRemove={onRemove}
                      onRead={(e) => open(e, group.items)}
                    />
                  ) : (
                    <button
                      className="ml-milestone-caption ml-group-summary"
                      onClick={(e) => open(e, group.items)}
                    >
                      {title}
                    </button>
                  ))}
              </div>
            )
          })}
        </div>
      </section>
      {selectedItems.length > 0 && (
        <FloatingPanel anchor={selected.anchor} label="里程碑详情" close={() => setSelected(null)}>
          {selectedItems.map((item) => (
            <section className="ml-node-detail" key={item.id}>
              {planning ? (
                <input
                  className="input ml-inline ml-node-date-input"
                  type="date"
                  aria-label={`里程碑日期：${item.outcome}`}
                  defaultValue={item.date}
                  onBlur={(e) => {
                    const date = e.currentTarget.value
                    if (date && e.currentTarget.validity.valid && date !== item.date) {
                      onChange({ ...item, date })
                      setSelected(null)
                    } else {
                      e.currentTarget.value = item.date
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      e.currentTarget.value = item.date
                      e.currentTarget.blur()
                    }
                    if (e.key === 'Enter') {
                      e.currentTarget.blur()
                    }
                  }}
                />
              ) : (
                <small>{item.date || `${item.month} · 未指定日期`}</small>
              )}
              {planning ? (
                <MilestoneCaption
                  item={item}
                  planning
                  onChange={onChange}
                  onRemove={(id) => {
                    setSelected(null)
                    onRemove(id)
                  }}
                />
              ) : (
                <p>{item.outcome}</p>
              )}
            </section>
          ))}
        </FloatingPanel>
      )}
    </>
  )
}

export function AddMilestone({ item, save, close }) {
  const [draft, setDraft] = useState(item)
  return (
    <Modal title="添加里程碑" close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save({ ...draft, outcome: draft.outcome.trim() })
        }}
      >
        <label className="ml-milestone-field">
          日期
          <input
            className="input"
            type="date"
            required
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
        </label>
        <label className="ml-milestone-field">
          预期成果
          <textarea
            aria-label="预期成果"
            className="input"
            rows={4}
            maxLength={200}
            required
            value={draft.outcome}
            placeholder="例如：发布 1.0，完成首次正式推广"
            onChange={(e) => setDraft({ ...draft, outcome: e.target.value })}
          />
        </label>
        <footer>
          <button type="button" className="btn btn-secondary" onClick={close}>
            取消
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={!draft.outcome.trim() || !draft.date}
          >
            添加
          </button>
        </footer>
      </form>
    </Modal>
  )
}

export function MilestoneGuide({ planning }) {
  const [step, setStep] = useState(null)
  const button = useRef(null)
  const seenKey = 'bw-milestone-free-timeline-tour-seen'
  const close = () => {
    setStep(null)
    try {
      localStorage.setItem(seenKey, 'yes')
    } catch {
      /* Optional tour preference. */
    }
  }
  useEffect(() => {
    if (planning) {
      try {
        if (
          !localStorage.getItem(seenKey) &&
          !localStorage.getItem('bw-milestone-guide-dismissed')
        ) {
          setStep(0)
        }
      } catch {
        /* Manual help remains available. */
      }
    } else {
      setStep(null)
    }
  }, [planning])
  const viewingActual = planning && document.querySelector('.ml-show-actual input:checked')
  const steps = [
    [
      '添加与编排',
      viewingActual
        ? '取消「显示实际」回到计划，左侧表头的旗帜和列表加号分别添加里程碑或特性。'
        : planning
          ? '左侧表头的旗帜和列表加号分别添加里程碑和特性。新增从今天或正在浏览的未来日期开始，负责人选填。'
          : '点击「规划里程碑」开始编排，添加特性与关键日期。',
      viewingActual
        ? '.ml-show-actual'
        : planning
          ? '.ml-roadmap .ml-cell-add'
          : '.ml-milestone-heading .btn-primary'
    ],
    [
      '调整时间',
      '拖 Build 或 Maintain 调日期，两端可跨版本伸缩。扳手添加 Maintain，× 删除特性；悬停或聚焦 Maintain 时，上方的垃圾桶只删除这一段。误操作可撤销。',
      '.ml-delivery-bar'
    ],
    [
      '提交评审',
      '修改先保存在本机。提交生成或更新 PR，合入后再更新正式安排。',
      '.ml-milestone-heading .btn-primary'
    ]
  ]
  const current = step === null ? null : steps[step]
  const track = document.querySelector('.ml-timeline-scroll')
  const bounds = track?.getBoundingClientRect()
  const headerBottom =
    document.querySelector('.ml-board-header')?.getBoundingClientRect().bottom || 0
  const visibleBar =
    step === 1 &&
    bounds &&
    [...document.querySelectorAll(current[2])].find((el) => {
      const rect = el.getBoundingClientRect()
      return (
        rect.left >= bounds.left + labelWidth &&
        rect.right <= bounds.right &&
        rect.top >= Math.max(bounds.top, headerBottom, 0) &&
        rect.bottom <= Math.min(bounds.bottom, innerHeight)
      )
    })
  const anchor =
    current &&
    (step === 1
      ? visibleBar || track || button.current
      : document.querySelector(current[2]) || button.current)
  useEffect(() => {
    if (!anchor) {
      return
    }
    anchor.classList.add('ml-tour-target')
    return () => anchor.classList.remove('ml-tour-target')
  }, [anchor])
  return (
    <span className="ml-help" ref={button}>
      <IconAction
        label="里程碑操作引导"
        icon={CircleHelp}
        onClick={() => (step === null ? setStep(0) : close())}
      />
      {current && anchor && (
        <FloatingPanel anchor={anchor} label={current[0]} close={close} className="ml-tour-panel">
          <header>
            <strong>{current[0]}</strong>
            <IconAction label="关闭引导" icon={X} onClick={close} />
          </header>
          <p>{current[1]}</p>
          <footer>
            <button className="btn btn-ghost" onClick={close}>
              跳过
            </button>
            <span>{step + 1} / 3</span>
            <button
              className="btn btn-primary"
              onClick={() => (step === 2 ? close() : setStep(step + 1))}
            >
              {step === 2 ? '知道了' : '下一步'}
            </button>
          </footer>
        </FloatingPanel>
      )}
    </span>
  )
}
