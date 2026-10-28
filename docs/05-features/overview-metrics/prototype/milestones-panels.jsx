import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import { versions, calendarDays, versionFacts } from './milestones-data.js'
const {
  // React is used by the shared JSX build factory.
  // eslint-disable-next-line no-unused-vars
  React,
  useState,
  useRef,
  useEffect,
  X
} = window.BWPrototypeDependencies

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

export function EditRequirement({ item, save, close }) {
  const [value, setValue] = useState({ ...item })
  const [error, setError] = useState('')
  const field = (name, v) => setValue({ ...value, [name]: v })
  return (
    <Modal title={`调整需求 · ${item.id}`} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (![value.title, value.owner, value.reason].every((text) => text.trim())) {
            setError('需求名称、主导 Builder 和取舍理由不能只有空格。')
            return
          }
          if (versions.indexOf(value.first) >= versions.indexOf(value.target)) {
            setError('原型注释: 本例先交 MVP，再在后续版本完善；后续版本应晚于先行版本。')
            return
          }
          const firstDay = 2 + versions.indexOf(value.target) * 7
          const dueDay = Number(value.due.slice(-2))
          if (dueDay < firstDay || dueDay > firstDay + 6) {
            setError('截止时间应落在目标版本的日期范围内；可一并调整目标版本。')
            return
          }
          save({
            ...value,
            title: value.title.trim(),
            owner: value.owner.trim(),
            reason: value.reason.trim()
          })
          close()
        }}
      >
        <label className="field">
          大需求
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
            主导 Builder
            <input
              className="input"
              aria-label="主导 Builder"
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
            先行 MVP
            <select
              className="input"
              aria-label="先行版本"
              value={value.first}
              onChange={(e) => field('first', e.target.value)}
            >
              {versions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="field">
            后续完善
            <select
              className="input"
              aria-label="目标版本"
              value={value.target}
              onChange={(e) => field('target', e.target.value)}
            >
              {versions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          本月约定范围的截止时间
          <input
            className="input"
            aria-label="需求截止时间"
            type="date"
            min="2026-11-02"
            max="2026-11-29"
            required
            value={value.due}
            onInput={(e) => field('due', e.currentTarget.value)}
          />
        </label>
        <label className="field">
          取舍理由
          <textarea
            className="input"
            aria-label="取舍理由"
            required
            value={value.reason}
            onInput={(e) => field('reason', e.currentTarget.value)}
          />
        </label>
        {error && (
          <p role="alert" className="ml-error">
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

export function VersionBridge({ item, version, close }) {
  const [retried, setRetried] = useState(false)
  const fact = versionFacts[version]
  const related = item?.selected && (version === item.first || version === item.target)
  return (
    <Modal title={`${version} · 版本总览`} close={close} wide>
      <p className="ml-footnote">
        原型注释: #334
        衔接预览，状态为模拟材料读回。正式跳转将使用同一需求与版本上下文，路由与持久化尚待统筹。
      </p>
      <div className="ml-section-head">
        <h3>{item?.title || '版本工作'}</h3>
        <span className="tag tag-outline">{fact.label}</span>
      </div>
      <p>{fact.source}</p>
      {retried && <p role="alert">暂时无法读取，请稍后重试。</p>}
      <p className="muted">{fact.detail}</p>
      <div className="ml-bridge-grid">
        <section>
          <h3>月度安排</h3>
          <p>
            {related
              ? version === item.first
                ? `先行 MVP：${item.mvp}`
                : `后续完善：${item.later}`
              : '本版未关联当前需求。'}
          </p>
          {related && (
            <p className="muted">
              {item.owner} · 整体约定截止 {item.due}
            </p>
          )}
        </section>
        <section>
          <h3>版本计划</h3>
          <p>
            {fact.plan === false
              ? '尚未开始计划'
              : fact.plan === null
                ? '未能读取计划'
                : '已形成版本计划'}
          </p>
          <p className="muted">
            {fact.plan === false
              ? '本版范围和任务尚未确认。'
              : fact.plan === null
                ? '状态未知，不显示零任务或未开始。'
                : '具体范围、任务和验收以本版材料为准。'}
          </p>
        </section>
      </div>
      <footer>
        {fact.plan === null && (
          <button className="btn btn-secondary" onClick={() => setRetried(true)}>
            重试读取
          </button>
        )}
        <a
          className="btn btn-secondary"
          href="../version-workspace/version-workspace-prototype.html"
          target="_blank"
          rel="noreferrer"
        >
          查看版本工作区原型 ↗
        </a>
        <button className="btn btn-primary" onClick={close}>
          返回里程碑
        </button>
      </footer>
    </Modal>
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
          取舍：不照搬六周周期、团队人数或立项角色。月度先取舍，具体规格与可试用交付在版本
          版本中收敛。
        </p>
      </section>
      <p>
        原型注释: 本轮五步旅程来自人工澄清：月度选择 → 先行 MVP → 部分用户试用 → 后续完善 → Issue
        持续改善。
      </p>
      <footer>
        <a className="btn btn-secondary" href="spec.md" target="_blank" rel="noreferrer">
          查看完整规格与待审选择
        </a>
        <button className="btn btn-primary" onClick={close}>
          返回原型
        </button>
      </footer>
    </Modal>
  )
}

export function PlanningSourcePanel({ close }) {
  return (
    <Modal title="项目里程碑在哪里规划" close={close} wide>
      <p>
        项目总览既是呈现入口，也是项目总里程碑的规划入口。日常展示连续泳道；点“规划里程碑”进入左右工作区。左侧可直接编辑，右侧复用原生模型会话。
      </p>
      <div className="ml-bridge-grid">
        <section>
          <h3>正式总览</h3>
          <p>读取已合入项目主干的材料，展示可追溯的正式安排。</p>
          <p className="muted">编辑草案、采纳模型建议、核对选择，都不会直接覆盖正式总览。</p>
        </section>
        <section>
          <h3>规划草案</h3>
          <p>
            左侧直接编辑与右侧原生会话共同维护同一份草案。先决定做什么、优先级、目标版本和截止。
          </p>
          <p className="muted">
            原型注释: 本页仅保存浏览器演示草案，没有读取真实主干或写入规划分支。
          </p>
        </section>
      </div>
      <h3>建议的材料评审路径 · 待主会话协调</h3>
      <ol className="ml-source-steps">
        <li>从正式安排进入规划草案。</li>
        <li>
          复用项目固定分支 <code>bw/project</code> 保存项目层规划。
        </li>
        <li>核对后提交 PR / MR，由人评审合入项目主干。</li>
        <li>更新代码后重读正式总览；版本中的具体交付范围继续在版本计划里收敛。</li>
      </ol>
      <p className="ml-callout">
        原型注释: 现有 bw/project
        承载项目名片评审；扩展到里程碑仍是建议。材料路径、事务与双机并发规则尚未确定，本原型不建立持久化协议。
      </p>
      <footer>
        <button className="btn btn-primary" onClick={close}>
          返回规划草案
        </button>
      </footer>
    </Modal>
  )
}

export function PlanningReviewPanel({ chosen, stage, setStage, publish, close }) {
  if (!['draft', 'review', 'merged'].includes(stage)) {
    return (
      <Modal title="规划评审" close={close}>
        <p>先进入规划草案，核对修改后再提交评审。</p>
      </Modal>
    )
  }
  return (
    <Modal
      title={
        stage === 'draft'
          ? '核对规划并提交评审'
          : stage === 'review'
            ? '规划评审中'
            : '规划已合入，等待更新总览'
      }
      close={close}
      wide
    >
      <div className="ml-review-route">
        <span>
          规划草案 <code>bw/project</code>
        </span>
        <span aria-hidden="true">→</span>
        <span>PR / MR 人审</span>
        <span aria-hidden="true">→</span>
        <span>项目主干</span>
        <span aria-hidden="true">→</span>
        <span>正式总览</span>
      </div>
      {stage === 'draft' ? (
        <>
          <p>
            核对本月做哪些大需求、优先次序、目标版本
            版本与截止。提交评审后，正式总览继续保留主干中的原安排。
          </p>
          {chosen.map((item) => (
            <div className="ml-confirm-row" key={item.id}>
              <strong>
                P{item.priority} · {item.title}
              </strong>
              <p>
                {item.owner} · {item.first} MVP → {item.target} 后续完善 · 截止 {item.due}
              </p>
              <small>{item.reason}</small>
            </div>
          ))}
          <footer>
            <button className="btn btn-secondary" onClick={close}>
              继续调整
            </button>
            <button className="btn btn-primary" onClick={() => setStage('review')}>
              提交规划评审
            </button>
          </footer>
        </>
      ) : stage === 'review' ? (
        <>
          <h3>规划等待人工评审合入</h3>
          <p>
            草案已经提交，正式安排尚未更新。评审意见可继续带回规划会话；合入仍由人在 PR/MR 中完成。
          </p>
          <div className="ml-callout">待评审的规划：2026 年 11 月 · {chosen.length} 项大需求</div>
          <footer>
            <button className="btn btn-secondary" onClick={close}>
              返回总览
            </button>
          </footer>
          <div className="ml-prototype-controls">
            <p>原型注释: 当前未创建真实 PR/MR。下面只模拟人在代码平台完成合入后的读回状态。</p>
            <button className="btn btn-ghost" onClick={() => setStage('merged')}>
              原型注释: 模拟人工已合入
            </button>
          </div>
        </>
      ) : (
        <>
          <h3>新规划已进入项目主干</h3>
          <p>
            本机总览仍展示更新前的材料。更新代码后，重读主干中的正式安排；不会把浏览器草案直接当作正式结果。
          </p>
          <footer>
            <button className="btn btn-secondary" onClick={close}>
              稍后更新
            </button>
            <button className="btn btn-primary" onClick={publish}>
              更新正式总览
            </button>
          </footer>
        </>
      )}
      <p className="ml-footnote">
        原型注释: 此流程只模拟可见状态，不调用 Git、PR/MR 或 BW 运行时。bw/project
        的规划材料归属、事务和并发策略待统筹确认。
      </p>
    </Modal>
  )
}
