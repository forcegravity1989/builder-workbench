import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import { calendarDays } from './milestones-data.js'
import { historicalRows, outcomeLabel, sourceUrl } from './milestones-history.js'
// eslint-disable-next-line no-unused-vars
const { React, useState, useRef, useEffect, X } = window.BWPrototypeDependencies
export function Modal({ title, close, children, wide = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`ml-dialog ${wide ? 'wide' : ''}`}
      onCancel={close}
    >
      <header>
        <h2>{title}</h2>
        <IconAction label="关闭对话框" icon={X} onClick={close} />
      </header>
      {children}
    </dialog>
  )
}

export function CalendarPanel({ anchor, close }) {
  const [month, setMonth] = useState(11)
  const ref = useRef(null)
  const days = calendarDays(month)
  const offset = (days[0].weekday + 6) % 7
  useEffect(() => {
    const previous = document.activeElement
    ref.current.focus()
    const outside = (event) => {
      if (!ref.current?.contains(event.target)) {
        close()
      }
    }
    const escape = (event) => {
      if (event.key === 'Escape') {
        close()
      }
    }
    addEventListener('pointerdown', outside)
    addEventListener('keydown', escape)
    return () => {
      removeEventListener('pointerdown', outside)
      removeEventListener('keydown', escape)
      if (previous?.isConnected) {
        previous.focus()
      }
    }
  }, [close])
  const left = Math.max(12, Math.min(innerWidth - 310, (anchor?.right || innerWidth) - 298))
  const top =
    (anchor?.bottom || 80) + 350 < innerHeight
      ? anchor.bottom + 8
      : Math.max(12, (anchor?.top || innerHeight) - 342)
  return (
    <section
      ref={ref}
      className="ml-calendar-popover"
      role="dialog"
      aria-label="工作日历"
      tabIndex={-1}
      style={{ left, top }}
    >
      <header>
        <h3>2026 年 {month} 月</h3>
        <div className="ml-actions">
          <button aria-label="上个月" disabled={month === 10} onClick={() => setMonth(10)}>
            ‹
          </button>
          <button aria-label="下个月" disabled={month === 11} onClick={() => setMonth(11)}>
            ›
          </button>
          <IconAction label="关闭日历" icon={X} onClick={close} />
        </div>
      </header>
      <div className="calendar-grid">
        {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
          <span className="ml-weekday" key={d}>
            {d}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`blank${i}`} />
        ))}
        {days.map((d) => (
          <div key={d.date} className={d.overtime ? 'overtime' : d.work ? 'workday' : 'restday'}>
            <b>{d.day}</b>
            {d.overtime && <small>班</small>}
          </div>
        ))}
      </div>
      <footer>
        <span>BW 预置工作日历</span>
        <span>班 · 周六加班</span>
      </footer>
      <p className="ml-footnote">原型注释: 加班日仅示意，未核验真实华为数据。</p>
    </section>
  )
}

export function ReferencePanel({ close }) {
  return (
    <Modal title="设计依据" close={close}>
      <p className="muted">
        原型注释: 2026-10-29
        核对官方资料。本稿借鉴交互思路，产品规则以人工澄清与仓内原则为准；此入口仅供原型评审，不进入产品界面。
      </p>
      <section className="ml-reference">
        <h3>
          <a
            href="https://support.atlassian.com/jira-software-cloud/docs/edit-and-reorder-work-items-on-the-timeline/"
            target="_blank"
            rel="noreferrer"
          >
            Jira · 时间轴就地编辑与排序 ↗
          </a>
        </h3>
        <p>
          借鉴：在对象附近建立排期、直接改日期和拖动排序。BW
          先登记版本，再在泳道添加特性；拖节点只改变版本引用。
        </p>
      </section>
      <section className="ml-reference">
        <h3>
          <a
            href="https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-roadmap-layout"
            target="_blank"
            rel="noreferrer"
          >
            GitHub Projects · Roadmap ↗
          </a>
        </h3>
        <p>借鉴：已有日期字段决定时间位置，关键节点帮助读轴。不从发布记录反推版本排期。</p>
      </section>
      <section className="ml-reference">
        <h3>
          <a href="https://linear.app/docs/initiatives" target="_blank" rel="noreferrer">
            Linear · Initiatives ↗
          </a>
        </h3>
        <p>借鉴：把方向、优先级、主导人和目标日期放在同一规划视图，再连接执行。</p>
        <p className="muted">取舍：不照搬组织层级或手设健康灯；BW 保留一项特性跨版本的整体身份。</p>
      </section>
      <section className="ml-reference">
        <h3>
          <a href="https://linear.app/docs/use-cycles" target="_blank" rel="noreferrer">
            Linear · Cycles ↗
          </a>
        </h3>
        <p>借鉴：工作节奏与发布节奏分开考虑，未来周期可调整。</p>
        <p className="muted">取舍：不把每周反馈等同于每周发布，也不照搬固定周期或自动结转规则。</p>
      </section>
      <section className="ml-reference">
        <h3>
          <a href="https://basecamp.com/shapeup/1.2-chapter-03" target="_blank" rel="noreferrer">
            Basecamp · Shape Up / Set Boundaries ↗
          </a>
        </h3>
        <p>借鉴：先讨论值得投入多少精力，再收敛问题与范围。</p>
        <p className="muted">
          取舍：不照搬六周周期、团队人数或立项角色。月度先取舍，具体规格与可试用交付在版本中收敛。
        </p>
      </section>
      <p>
        原型注释: 本轮五步旅程来自人工澄清：月度选择 → Pre版本 → 部分用户试用 → Release版本交付 →
        Issue 持续改善。
      </p>
      <footer>
        <a className="btn btn-secondary" href="spec.md" target="_blank" rel="noreferrer">
          查看完整规格
        </a>
        <button className="btn btn-primary" onClick={close}>
          返回原型
        </button>
      </footer>
    </Modal>
  )
}

export function VersionBridge({ item, version, plan, close }) {
  const pre = item?.pre === version,
    release = item?.release === version
  const v = plan.versions.find((entry) => entry.id === version)
  return (
    <Modal title={`${v.name || '未命名版本'} · 版本总览`} close={close} wide>
      <p className="ml-footnote">
        原型注释: #334
        衔接预览。真实特性对应关系、来源定位与返回字段仍待接入；原型返回保留当前草案和视口。
      </p>
      <h3>{item?.title || '版本工作'}</h3>
      <div className="ml-source-columns">
        <section>
          <h3>里程碑安排</h3>
          {pre && (
            <p>
              <b>Pre版本：</b>
              {v.start} — {v.end}
            </p>
          )}
          {release && (
            <p>
              <b>Release版本：</b>
              {v.start} — {v.end}
            </p>
          )}
          {!pre && !release && <p>本版未关联当前特性。</p>}
          {(pre || release) && <p className="muted">负责人：{item.owner}</p>}
        </section>
        <section>
          <h3>版本计划与实际交付</h3>
          <p>尚未读取</p>
          <p className="muted">
            项目版本发布不代表本特性已交付Pre或Release，实际范围与验收以版本材料为准。
          </p>
        </section>
      </div>
      <footer>
        <a
          className="btn btn-secondary"
          href="../version-overview/prototype.html"
          target="_blank"
          rel="noreferrer"
        >
          查看版本总览原型 ↗
        </a>
        <button className="btn btn-primary" onClick={close}>
          返回来源视图
        </button>
      </footer>
    </Modal>
  )
}
export function HistoryVersion({ plan, close }) {
  const rows = historicalRows.filter((r) => r.planVersion === plan.version)
  return (
    <Modal title={`${plan.version} · 真实版本材料`} close={close} wide>
      <p>原型注释: 此处只读 .bw 计划与人工验收；未记录排期的历史版本不绘入时间轴。</p>
      {rows.map((r) => (
        <details className="ml-source-item" key={r.id}>
          <summary>
            {r.displayGoal} · {r.title}
          </summary>
          <p>
            {outcomeLabel(r.result?.decision?.outcome)} ·{' '}
            {r.result?.decision?.recordedAt || '未记录验收时间'}
          </p>
          <p className="ml-info-text">{r.scope}</p>
          <p className="ml-info-text">{r.result?.decision?.reason || r.result?.note}</p>
        </details>
      ))}
      <footer>
        <a
          className="btn btn-secondary"
          href={sourceUrl(`.bw/planning/${plan.version}/data.json`)}
          target="_blank"
          rel="noreferrer"
        >
          查看原计划 ↗
        </a>
        <button className="btn btn-primary" onClick={close}>
          返回来源视图
        </button>
      </footer>
    </Modal>
  )
}
export function PlanningReviewPanel({ state, changes, submit, markMerged, publish, close }) {
  const dirty = changes.length > 0
  return (
    <Modal
      title={
        dirty && state.review !== 'merged'
          ? '核对本次变更'
          : state.review === 'merged'
            ? '已合入，待更新'
            : '已提交，待合入'
      }
      close={close}
    >
      {dirty && state.review !== 'merged' ? (
        <>
          {changes.map((c, i) => (
            <div className="ml-confirm-row" key={i}>
              <strong>{c.title}</strong>
              <p>{c.detail}</p>
            </div>
          ))}
          <footer>
            <button className="btn btn-secondary" onClick={close}>
              继续修改
            </button>
            <button className="btn btn-primary" onClick={submit}>
              {state.review === 'open' ? '更新评审' : '提交评审'}
            </button>
          </footer>
        </>
      ) : state.review === 'merged' ? (
        <>
          <p>正式总览将更新为最近已提交并合入的规划。</p>
          {dirty && <p>另有未提交修改，更新后继续保留。</p>}
          <footer>
            <button className="btn btn-primary" onClick={publish}>
              更新正式安排
            </button>
          </footer>
        </>
      ) : (
        <>
          <p>已提交的规划正在等待 PR / MR 合入。</p>
          <footer>
            <button className="btn btn-secondary" onClick={close}>
              返回总览
            </button>
          </footer>
          <div className="ml-prototype-controls">
            <button className="btn btn-ghost" onClick={markMerged}>
              原型注释: 模拟人工已合入
            </button>
          </div>
        </>
      )}
      <p className="ml-footnote">
        原型注释: 此处演示 bw/project → PR/MR → 主干的状态；没有真实 Git
        写入。还原仅针对最近提交后的修改，阶段成果仍由人确认。
      </p>
    </Modal>
  )
}
