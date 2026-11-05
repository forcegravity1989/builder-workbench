import { Modal } from './milestones-panels.jsx'
import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import Flag from 'lucide-react/dist/esm/icons/flag.js'
import Ellipsis from 'lucide-react/dist/esm/icons/ellipsis.js'
import { day } from './milestones-sdlc.js'
import { dayWidth, labelWidth } from './milestones-calendar.js'
// eslint-disable-next-line no-unused-vars
const { React, useState, useRef, useEffect, CircleHelp, X } = window.BWPrototypeDependencies

function FloatingPanel({ anchor, label, close, children, className = '' }) {
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

export function MilestoneAxis({ milestones, planning, start, width, onOpen, onRemove }) {
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
  useEffect(() => setSelected(null), [planning, milestones])
  const undated = milestones.filter((m) => !m.date)
  const open = (event, items) => setSelected({ anchor: event.currentTarget, items })
  return (
    <>
      <section
        className="ml-roadmap"
        aria-label="关键里程碑，与特性共用日轴"
        style={{ width: width + labelWidth }}
      >
        <div className="ml-sticky-label">
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
                {nodeWidth >= 80 && (
                  <div className="ml-milestone-caption">
                    <button
                      className="ml-node-summary"
                      title={group.items.map((m) => m.outcome).join('；')}
                      onClick={(e) => open(e, group.items)}
                    >
                      {title}
                    </button>
                    {planning && (
                      <button
                        className="ml-node-more"
                        aria-label={`${group.date} 更多操作`}
                        title="编辑或删除里程碑"
                        onClick={(e) => open(e, group.items)}
                      >
                        <Ellipsis size={15} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
      {selected && (
        <FloatingPanel
          anchor={selected.anchor}
          label="里程碑详情与操作"
          close={() => setSelected(null)}
        >
          {selected.items.map((item) => (
            <section className="ml-node-detail" key={item.id}>
              <small>{item.date || `${item.month} · 未指定日期`}</small>
              <p>{item.outcome}</p>
              {planning && (
                <div className="ml-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setSelected(null)
                      onOpen(item)
                    }}
                  >
                    编辑
                  </button>
                  <button
                    className="btn btn-ghost ml-delete-milestone"
                    aria-label={`删除里程碑：${item.outcome}`}
                    onClick={() => {
                      setSelected(null)
                      onRemove(item.id)
                    }}
                  >
                    删除
                  </button>
                </div>
              )}
            </section>
          ))}
        </FloatingPanel>
      )}
    </>
  )
}

export function MilestoneEditor({ item, planning, save, remove, close }) {
  const [draft, setDraft] = useState(item)
  return (
    <Modal title={planning ? (item.id ? '编辑里程碑' : '添加里程碑') : '里程碑'} close={close}>
      {planning ? (
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
              value={draft.date}
              required={!item.month}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
          </label>
          {item.month && !draft.date && (
            <p className="muted">原规划仅记录 {item.month}，尚未指定日期。</p>
          )}
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
            {item.id && (
              <button
                type="button"
                className="btn btn-ghost ml-delete-milestone"
                onClick={() => remove(item.id)}
              >
                删除里程碑
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={close}>
              取消
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={!draft.outcome.trim() || (!draft.date && !item.month)}
            >
              保存
            </button>
          </footer>
        </form>
      ) : (
        <>
          <p className="muted">{item.date || `${item.month} · 未指定日期`}</p>
          <p className="ml-info-text">{item.outcome}</p>
        </>
      )}
    </Modal>
  )
}

export function MilestoneGuide({ planning }) {
  const [step, setStep] = useState(null)
  const button = useRef(null)
  const seenKey = 'bw-milestone-tour-seen'
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
  const steps = [
    [
      '添加与编排',
      planning
        ? '从这里添加特性或里程碑。旗帜旁的 ⋯ 可以编辑、删除节点。'
        : '点击「规划里程碑」开始编排，添加特性与关键日期。',
      planning ? '.ml-sdlc-toolbar' : '.ml-milestone-heading .btn-primary'
    ],
    [
      '调整时间',
      '在计划视图拖特性条身换版本，拉两端调时长；拖版本表头调整整版。',
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
