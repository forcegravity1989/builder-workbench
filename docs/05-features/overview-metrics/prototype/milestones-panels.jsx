import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import { versions, calendarSample, parseCalendar } from './milestones-data.js'
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

export function CalendarPanel({ calendar, apply, close }) {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [source, setSource] = useState('')
  const [fixture, setFixture] = useState(false)
  const validate = () => {
    try {
      setPreview(parseCalendar(text))
      setError('')
    } catch (e) {
      setError(e.message)
      setPreview(null)
    }
  }
  return (
    <Modal title="工作日历" close={close} wide>
      <p className="ml-callout">
        尚未取得真实华为工作日历。此处验证“提供材料 → 核对日期 →
        用于规划”的交互；没有连接华为系统，也不验证其文件格式。
      </p>
      <div className="ml-calendar-layout">
        <section>
          <h3>1. 提供日历材料</h3>
          <p className="muted">
            目标体验：将日历文件或截图交给原生会话，模型整理出日期与工作／休息安排，再由人核对。当前仅支持粘贴或载入已整理的文本。
          </p>
          <label className="field">
            来源说明
            <input
              className="input"
              aria-label="日历来源说明"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="文件名称、发布方、适用范围"
            />
          </label>
          <textarea
            className="input calendar-input"
            aria-label="日历文本"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setPreview(null)
              setFixture(false)
            }}
            placeholder="2026-11-02,工作,来源说明"
          />
          <div className="ml-actions">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setText(calendarSample())
                setSource('虚构的 2026-11 工作日历')
                setPreview(null)
                setFixture(true)
                setError('')
              }}
            >
              填入演示样本
            </button>
            <label className="btn btn-secondary">
              载入文本
              <input
                className="sr-only"
                type="file"
                accept=".txt,.csv"
                aria-label="载入已整理的日历文本"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) {
                    return
                  }
                  setPreview(null)
                  setError('')
                  if (file.size > 100000) {
                    setError('演示仅接受 100 KB 以内的文本。')
                    return
                  }
                  try {
                    setText(await file.text())
                    setSource(file.name)
                    setFixture(false)
                    setPreview(null)
                    setError('')
                  } catch {
                    setError('文件读取失败，请重新选择。')
                  }
                }}
              />
            </label>
          </div>
          <p className="muted">
            演示文本：一行一个日期，格式为“2026-11-DD,工作或休息,说明”。未提供的日期保持未知。
          </p>
        </section>
        <section>
          <h3>2. 核对安排</h3>
          {!preview ? (
            <div className="ml-empty">先解析材料，再核对工作日、休息日与调班。</div>
          ) : (
            <>
              <p>
                {Object.keys(preview).length}/30 天有记录 ·{' '}
                {Object.values(preview).filter((d) => d.work).length} 个工作日
              </p>
              <div className="calendar-grid">
                {Array.from({ length: 30 }, (_, i) => {
                  const date = `2026-11-${String(i + 1).padStart(2, '0')}`
                  const day = preview[date]
                  return (
                    <div
                      key={date}
                      className={day ? (day.work ? 'workday' : 'restday') : 'unknown'}
                    >
                      <b>{i + 1}</b>
                      <small>{day ? (day.work ? '工作' : '休息') : '未知'}</small>
                    </div>
                  )
                })}
              </div>
              <p className="muted">
                应用后仅提示安排冲突、计算已知可用日期；不会移动里程碑或改已确认的截止时间。
              </p>
            </>
          )}
          {calendar && <p className="muted">当前已应用：{calendar.source}</p>}
        </section>
      </div>
      {error && (
        <p role="alert" className="ml-error">
          {error}
        </p>
      )}
      <footer>
        <button className="btn btn-secondary" onClick={validate}>
          解析并预览
        </button>
        <button
          className="btn btn-primary"
          disabled={!preview || !source.trim()}
          onClick={() => {
            apply({ source: source.trim(), fixture, days: preview })
            close()
          }}
        >
          核对后用于演示规划
        </button>
      </footer>
    </Modal>
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
            setError('本演示旅程先交 MVP，再在后续 B 版本完善；后续版本应晚于先行版本。')
            return
          }
          const firstDay = 2 + versions.indexOf(value.target) * 7
          const dueDay = Number(value.due.slice(-2))
          if (dueDay < firstDay || dueDay > firstDay + 6) {
            setError('截止时间应落在目标 B 版本的日期范围内；可一并调整目标版本。')
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
            onChange={(e) => field('title', e.target.value)}
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
              onChange={(e) => field('owner', e.target.value)}
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
              aria-label="先行 B 版本"
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
              aria-label="目标 B 版本"
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
            onChange={(e) => field('due', e.target.value)}
          />
        </label>
        <label className="field">
          取舍理由
          <textarea
            className="input"
            aria-label="取舍理由"
            required
            value={value.reason}
            onChange={(e) => field('reason', e.target.value)}
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
            保存演示安排
          </button>
        </footer>
      </form>
    </Modal>
  )
}

export function VersionBridge({ item, version, step, close }) {
  const early = version === item.first
  const related = item.selected && (early || version === item.target)
  return (
    <Modal title={`${version} · 版本总览衔接预览`} close={close} wide>
      <div className="ml-callout">
        #334
        由另一窗口设计。本页仅校准跳转时要带入的需求、版本和本版交付，不代表双方协议或新版本总览已实现。
      </div>
      <p className="eyebrow">
        {related
          ? `${item.id} · ${item.owner}`
          : !item.selected
            ? `${item.id} · 本月暂不安排`
            : '未关联当前需求'}{' '}
        · 演示版本
      </p>
      <h2>{related ? item.title : `${version} 尚未纳入当前需求`}</h2>
      <div className="ml-bridge-grid">
        <section>
          <h3>本版交付</h3>
          <p>{!related ? '未安排，不推断交付范围。' : early ? item.mvp : item.later}</p>
          <p className="muted">
            {!related
              ? '返回月度规划可选择另一需求，或调整版本安排。'
              : early
                ? '对齐规格与高保真后，接上开发、测试，形成可运行的 MVP。'
                : '承接部分用户的试用问题，收敛本月约定范围；不重写先行版本的验收。'}
          </p>
        </section>
        <section>
          <h3>{item.selected ? '大需求整体安排' : '候选安排 · 未纳入本月'}</h3>
          <p>
            {item.first} 先行 MVP → {item.target} 后续完善
          </p>
          <p>截止 {item.due} · 每个 B 版本一次正式验收</p>
        </section>
      </div>
      <div className="ml-artifact-row">
        <span>规格 / 高保真</span>
        <span>Plan / 开发 / 测试</span>
        <span>试用 / 人工验收</span>
      </div>
      <p className="muted">
        成果均未接真实读取。此刻演示关注：
        {!related
          ? '未关联版本不能冒充本需求成果。'
          : step === 2
            ? '3 位内部用户试用，收集反馈；试用不是第二次正式验收。'
            : step === 4
              ? '大需求完成后的 bug 与衍生小需求继续进入 Issue workflow；不会自动关闭 Issue。'
              : early
                ? '从设计收敛接到可试用交付，不能止于文档。'
                : '按反馈修理、完善，保留原承诺与前版证据。'}
      </p>
      <footer>
        <a
          className="btn btn-secondary"
          href="../version-workspace/version-workspace-prototype.html"
          target="_blank"
          rel="noreferrer"
        >
          查看现有版本工作区原型
        </a>
        <button className="btn btn-primary" onClick={close}>
          返回月度规划
        </button>
      </footer>
    </Modal>
  )
}

export function ReferencePanel({ close }) {
  return (
    <Modal title="设计依据" close={close}>
      <p className="muted">
        2026-10-27 核对官方资料。本稿借鉴交互思路，产品规则以人工澄清与仓内原则为准。
      </p>
      <section className="ml-reference">
        <h3>
          <a href="https://linear.app/docs/initiatives" target="_blank" rel="noreferrer">
            Linear · Initiatives ↗
          </a>
        </h3>
        <p>借鉴：把方向、优先级、主导人和目标日期放在同一规划视图，再连接执行。</p>
        <p className="muted">
          取舍：不照搬组织层级或手设健康灯；BW 保留一项大需求跨 B 版本的整体身份。
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
          取舍：不照搬六周周期、团队人数或立项角色。月度先取舍，具体规格与可试用交付在 B
          版本中收敛。
        </p>
      </section>
      <p>
        本轮五步旅程来自你的明确方向：月度选择 → 先行 MVP → 部分用户试用 → 后续完善 → Issue
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
        项目总览既是呈现入口，也是项目总里程碑的规划入口。月份只是查看和调整的一段；本稿仅用 2026-11
        演示。
      </p>
      <div className="ml-bridge-grid">
        <section>
          <h3>正式总览</h3>
          <p>读取已合入项目主干的材料，展示可追溯的正式安排。</p>
          <p className="muted">编辑草案、采纳模型建议、核对选择，都不会直接覆盖正式总览。</p>
        </section>
        <section>
          <h3>规划草案</h3>
          <p>在总览直接编辑，也可借助原生会话持续讨论。先决定做什么、优先级、目标 B 版本和截止。</p>
          <p className="muted">本页仅保存浏览器演示草案，没有读取真实主干或写入规划分支。</p>
        </section>
      </div>
      <h3>建议的材料评审路径 · 待主会话协调</h3>
      <ol className="ml-source-steps">
        <li>从正式安排进入规划草案。</li>
        <li>
          复用项目固定分支 <code>bw/project</code> 保存项目层规划。
        </li>
        <li>核对后提交 PR / MR，由人评审合入项目主干。</li>
        <li>更新代码后重读正式总览；B 版本中的具体交付范围继续在版本计划里收敛。</li>
      </ol>
      <p className="ml-callout">
        现有 bw/project
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

export function MetricsPanel({ close }) {
  return (
    <Modal title="项目背景与指标" close={close} wide>
      <div className="ml-bridge-grid">
        <section>
          <h3>Builders’ Workbench</h3>
          <p>帮助 Builder 用 AI 时代的方式构建产品、完成项目。</p>
          <p className="muted">方向由人决定，复用原生会话、任务和工作树推进交付。</p>
          <a
            href="../../01-principles/03-press-release-faq-flywheel.md"
            target="_blank"
            rel="noreferrer"
          >
            查看产品主张
          </a>
        </section>
        <section>
          <h3>北极星</h3>
          <p>未定义</p>
          <p className="muted">不以提交量、PR 数或演示进度代替项目健康。</p>
        </section>
      </div>
      <h3>指标入口保留</h3>
      <table className="table">
        <thead>
          <tr>
            <th>业务指标</th>
            <th>读数</th>
            <th>规划用途</th>
          </tr>
        </thead>
        <tbody>
          {['纳入项目数', '每周闭环 Issue 数', '使用周一屏项目数', '计划制定时长'].map((name) => (
            <tr key={name}>
              <td>{name}</td>
              <td>未读取</td>
              <td>讨论时按需引用</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>项目统计：提交 · 合入 PR · 开放 Issue — 均未读取。</p>
      <p className="muted">
        生产指标继续沿现有采集、来源详情与配置会话。此原型未接采集；指标不是所有里程碑的统一验收门槛。
      </p>
    </Modal>
  )
}
