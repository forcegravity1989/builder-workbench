import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import {
  fixedVersions,
  versionById,
  versionIndex,
  validRequirement,
  calendarDays
} from './milestones-data.js'
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
        原型注释: 2026-10-27 核对官方资料。本稿借鉴交互思路，产品规则以人工澄清与仓内原则为准。
      </p>
      <section className="ml-reference">
        <h3>
          <a href="https://linear.app/docs/initiatives" target="_blank" rel="noreferrer">
            Linear · Initiatives ↗
          </a>
        </h3>
        <p>借鉴：把方向、优先级、主导人和目标日期放在同一规划视图，再连接执行。</p>
        <p className="muted">
          取舍：不照搬组织层级或手设健康灯；BW 保留一项大需求跨版本的整体身份。
        </p>
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

export function EditRequirement({ item, save, close }) {
  const [value, setValue] = useState({ ...item }),
    [error, setError] = useState('')
  const field = (key, v) => setValue((d) => ({ ...d, [key]: v }))
  return (
    <Modal title={item.title ? `调整需求 · ${item.title}` : '添加支撑需求'} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const cleaned = {
            ...value,
            title: value.title.trim(),
            owner: value.owner.trim(),
            preScope: value.preScope.trim(),
            releaseScope: value.releaseScope.trim()
          }
          if (versionIndex(cleaned.pre) > versionIndex(cleaned.release)) {
            setError('Pre版本不能晚于Release版本。')
            return
          }
          if (!validRequirement(cleaned)) {
            setError('请填写名称、负责人，并把截止放在Release版本的固定范围内。')
            return
          }
          save(cleaned)
          close()
        }}
      >
        <label className="field">
          需求名称
          <input
            className="input"
            aria-label="需求名称"
            required
            maxLength={80}
            value={value.title}
            onInput={(e) => field('title', e.currentTarget.value)}
          />
        </label>
        <div className="ml-form-grid">
          <label className="field">
            负责人
            <input
              className="input"
              aria-label="负责人"
              required
              value={value.owner}
              onInput={(e) => field('owner', e.currentTarget.value)}
            />
          </label>
          <label className="field">
            优先级
            <select
              className="input"
              aria-label="优先级"
              value={value.priority}
              onChange={(e) => field('priority', Number(e.target.value))}
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  P{n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Pre版本
            <select
              className="input"
              aria-label="Pre版本"
              value={value.pre}
              onChange={(e) => field('pre', e.target.value)}
            >
              {fixedVersions.map((v) => (
                <option key={v.id}>{v.id}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Release版本
            <select
              className="input"
              aria-label="Release版本"
              value={value.release}
              onChange={(e) => {
                const version = e.currentTarget.value
                setValue((d) => ({ ...d, release: version, due: versionById[version].target }))
              }}
            >
              {fixedVersions.map((v) => (
                <option key={v.id}>{v.id}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          交付截止
          <input
            className="input"
            type="date"
            aria-label="交付截止"
            required
            min={versionById[value.release].start}
            max={versionById[value.release].end}
            value={value.due}
            onInput={(e) => field('due', e.currentTarget.value)}
          />
        </label>
        <label className="field">
          Pre交付说明（选填）
          <textarea
            className="input"
            aria-label="Pre交付说明"
            value={value.preScope}
            onInput={(e) => field('preScope', e.currentTarget.value)}
          />
        </label>
        <label className="field">
          Release交付说明（选填）
          <textarea
            className="input"
            aria-label="Release交付说明"
            value={value.releaseScope}
            onInput={(e) => field('releaseScope', e.currentTarget.value)}
          />
        </label>
        {error && (
          <p className="ml-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button className="btn btn-secondary" type="button" onClick={close}>
            取消
          </button>
          <button className="btn btn-primary" type="submit">
            保存安排
          </button>
        </footer>
      </form>
    </Modal>
  )
}
export function EditMilestone({ value, save, close }) {
  const [draft, setDraft] = useState({ ...value })
  const field = (key, value) => setDraft((d) => ({ ...d, [key]: value }))
  return (
    <Modal title="编辑阶段成果" close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.title.trim() || !draft.outcome.trim()) {
            return
          }
          save({ title: draft.title.trim(), outcome: draft.outcome.trim() })
          close()
        }}
      >
        <label className="field">
          阶段成果
          <input
            className="input"
            aria-label="阶段成果"
            required
            value={draft.title}
            onInput={(e) => field('title', e.currentTarget.value)}
          />
        </label>
        <label className="field">
          要达到的能力结果
          <textarea
            className="input"
            aria-label="能力结果"
            required
            value={draft.outcome}
            onInput={(e) => field('outcome', e.currentTarget.value)}
          />
        </label>
        <footer>
          <button className="btn btn-secondary" type="button" onClick={close}>
            取消
          </button>
          <button className="btn btn-primary" type="submit">
            保存阶段成果
          </button>
        </footer>
      </form>
    </Modal>
  )
}
export function VersionBridge({ item, version, close }) {
  const pre = item?.included && item.pre === version,
    release = item?.included && item.release === version
  return (
    <Modal title={`${version} · 版本总览`} close={close} wide>
      <p className="ml-footnote">
        原型注释: #334
        衔接预览。真实需求对应关系、来源定位与返回字段仍待接入；原型返回保留当前草案和视口。
      </p>
      <h3>{item?.title || '版本工作'}</h3>
      <div className="ml-source-columns">
        <section>
          <h3>里程碑安排</h3>
          {pre && (
            <p>
              <b>Pre版本：</b>
              {item.preScope || '交付范围待收敛'}
            </p>
          )}
          {release && (
            <p>
              <b>Release版本：</b>
              {item.releaseScope || '交付范围待收敛'}
            </p>
          )}
          {!pre && !release && <p>本版未关联当前需求。</p>}
          {(pre || release) && (
            <p className="muted">
              {item.owner} · 截止 {item.due}
            </p>
          )}
        </section>
        <section>
          <h3>版本计划与实际交付</h3>
          <p>尚未读取</p>
          <p className="muted">
            项目版本发布不代表本需求已交付Pre或Release，实际范围与验收以版本材料为准。
          </p>
        </section>
      </div>
      <footer>
        <a
          className="btn btn-secondary"
          href="../version-workspace/version-workspace-prototype.html"
          target="_blank"
          rel="noreferrer"
        >
          查看版本工作区原型 ↗
        </a>
        <button className="btn btn-primary" onClick={close}>
          返回来源视图
        </button>
      </footer>
    </Modal>
  )
}
export function HistoryDetail({ item, close }) {
  const decision = item.result?.decision
  return (
    <Modal title={`${item.planVersion} · ${item.displayGoal}`} close={close} wide>
      <h3>{item.title}</h3>
      <p className="muted">负责人：{item.owner}</p>
      <div className="ml-source-columns">
        <section>
          <h3>当版交付约定</h3>
          <p className="ml-info-text">{item.scope || '未记录'}</p>
          <details>
            <summary>当版验收标准</summary>
            <p className="ml-info-text">{item.criterion || '未记录'}</p>
          </details>
        </section>
        <section>
          <h3>当版人工验收</h3>
          <p>{outcomeLabel(decision?.outcome)}</p>
          {decision && (
            <p className="muted">
              {decision.recordedAt} · {decision.source}
            </p>
          )}
          <p className="ml-info-text">{decision?.reason || item.result?.note || '未记录说明'}</p>
          {item.result?.nextStep && (
            <>
              <h3>后续安排</h3>
              <p className="ml-info-text">{item.result.nextStep}</p>
            </>
          )}
        </section>
      </div>
      <p className="muted">需求级 Pre / Release 对应关系：未记录，不由项目发布或验收结论推定。</p>
      <footer>
        <a
          className="btn btn-secondary"
          href={sourceUrl(item.planPath)}
          target="_blank"
          rel="noreferrer"
        >
          原计划 ↗
        </a>
        {item.acceptancePath && (
          <a
            className="btn btn-secondary"
            href={sourceUrl(item.acceptancePath)}
            target="_blank"
            rel="noreferrer"
          >
            原验收 ↗
          </a>
        )}
        <button className="btn btn-primary" onClick={close}>
          返回历史回看
        </button>
      </footer>
    </Modal>
  )
}
export function HistoryVersion({ plan, close }) {
  const rows = historicalRows.filter((r) => r.planVersion === plan.version)
  return (
    <Modal title={`${plan.version} · 真实版本材料`} close={close} wide>
      <p>计划、人工验收和项目发布分别读取，不能互相代替。</p>
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
export function PlanningReviewPanel({ chosen, milestone, stage, setStage, publish, close }) {
  if (!['draft', 'review', 'merged'].includes(stage)) {
    return (
      <Modal title="规划评审" close={close}>
        <p>先核对当前草案。</p>
      </Modal>
    )
  }
  return (
    <Modal
      title={
        stage === 'draft'
          ? '核对里程碑安排'
          : stage === 'review'
            ? '规划评审中'
            : '已合入，等待更新'
      }
      close={close}
      wide
    >
      <h3>{milestone.title}</h3>
      <p>{milestone.outcome}</p>
      {stage === 'draft' ? (
        <>
          {chosen.map((r) => (
            <div className="ml-confirm-row" key={r.id}>
              <strong>{r.title}</strong>
              <p>
                {r.owner} · Pre {r.pre} → Release {r.release} · 截止 {r.due}
              </p>
            </div>
          ))}
          <footer>
            <button className="btn btn-secondary" onClick={close}>
              继续规划
            </button>
            <button
              className="btn btn-primary"
              disabled={!chosen.length}
              onClick={() => setStage('review')}
            >
              提交规划评审
            </button>
          </footer>
        </>
      ) : stage === 'review' ? (
        <>
          <p>等待人在 PR / MR 中评审合入，正式安排仍保持原快照。</p>
          <footer>
            <button className="btn btn-secondary" onClick={close}>
              返回总览
            </button>
          </footer>
          <div className="ml-prototype-controls">
            <p>原型注释: 此处未创建真实 PR/MR。</p>
            <button className="btn btn-ghost" onClick={() => setStage('merged')}>
              原型注释: 模拟人工已合入
            </button>
          </div>
        </>
      ) : (
        <>
          <p>更新代码后，正式总览重读已合入的安排。</p>
          <footer>
            <button className="btn btn-secondary" onClick={close}>
              稍后更新
            </button>
            <button className="btn btn-primary" onClick={publish}>
              更新正式安排
            </button>
          </footer>
        </>
      )}
      <p className="ml-footnote">
        原型注释: 只模拟评审与更新状态，bw/project
        材料路径、事务和真实写入尚未确定。阶段成果达成仍由人另行确认，不由提交或合入推定。
      </p>
    </Modal>
  )
}
