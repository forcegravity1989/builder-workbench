import { Modal } from './milestones-panels.jsx'
import { day } from './milestones-sdlc.js'
import { dayWidth, labelWidth } from './milestones-calendar.js'
// eslint-disable-next-line no-unused-vars
const { React, useState, Plus } = window.BWPrototypeDependencies

export function MilestoneAxis({ milestones, planning, start, width, onOpen, visibleDate }) {
  const lanes = []
  for (const item of milestones
    .filter((m) => m.date)
    .toSorted((a, b) => a.date.localeCompare(b.date))) {
    const left = (day(item.date) - start) * dayWidth + dayWidth / 2
    let lane = lanes.find((row) => row.at(-1).left + 224 <= left)
    if (!lane) {
      lanes.push((lane = []))
    }
    lane.push({ item, left })
  }
  const undated = milestones.filter((m) => !m.date)
  return (
    <section
      className="ml-roadmap"
      aria-label="关键里程碑，与特性共用日轴"
      style={{ width: width + labelWidth }}
    >
      <div className="ml-sticky-label">
        <strong>关键里程碑</strong>
        {planning && (
          <button
            className="btn btn-ghost"
            onClick={() => onOpen({ date: visibleDate(), outcome: '' })}
          >
            <Plus size={13} />
            添加里程碑
          </button>
        )}
        {undated.map((m) => (
          <button className="ml-undated" key={m.id} onClick={() => onOpen(m)}>
            {m.month} · 未指定日期
            <br />
            {m.outcome}
          </button>
        ))}
      </div>
      <div className="ml-roadmap-dates" style={{ width }}>
        {lanes.length ? (
          lanes.map((lane, index) => (
            <div className="ml-roadmap-lane" key={index}>
              {lane.map(({ item, left }, i) => (
                <button
                  className="ml-milestone-node"
                  key={item.id}
                  style={{ marginLeft: left - (i ? lane[i - 1].left + 208 : 0) }}
                  aria-label={`${item.date} ${item.outcome}`}
                  title={`${item.date} ${item.outcome}`}
                  onClick={() => onOpen(item)}
                >
                  <span className="ml-milestone-date">
                    <i aria-hidden="true" />
                    {item.date.replaceAll('-', '/')}
                  </span>
                  <span className="ml-milestone-outcome">{item.outcome}</span>
                </button>
              ))}
            </div>
          ))
        ) : (
          <p className="ml-roadmap-empty">
            {undated.length
              ? '选择已有里程碑，补充具体日期'
              : '添加重要交付节点，如 11/05 正式推广'}
          </p>
        )}
      </div>
    </section>
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
          <p className="muted">关键节点独立设定；调整特性或版本不会自动改变此日期。</p>
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

export function MilestoneGuide() {
  const key = 'bw-milestone-guide-dismissed'
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) !== 'yes'
    } catch {
      return true
    }
  })
  return (
    <details
      className="ml-guide"
      open={open}
      onToggle={(e) => {
        setOpen(e.currentTarget.open)
        try {
          localStorage.setItem(key, e.currentTarget.open ? 'no' : 'yes')
        } catch {
          /* Guide preference is optional. */
        }
      }}
    >
      <summary>操作说明</summary>
      <div>
        <p>
          <strong>1 · 定节点</strong>点「规划里程碑」开始，添加日期与预期成果；点节点可修改或删除。
        </p>
        <p>
          <strong>2 · 排特性</strong>添加特性后拖条身换版本，拉两端调时长；拖版本表头调整整版。
        </p>
        <p>
          <strong>3 · 提交评审</strong>修改先留在本机。提交生成或更新 PR，合入后再更新正式安排。
        </p>
      </div>
    </details>
  )
}
