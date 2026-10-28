import { fixedVersions } from './milestones-data.js'
import { historyPlans } from './milestones-history.js'
const {
  // eslint-disable-next-line no-unused-vars
  React,
  useState,
  useEffect,
  useRef,
  LayoutDashboard,
  BookOpen,
  CalendarClock,
  GitBranch,
  ChevronRight,
  Check
} = window.BWPrototypeDependencies
export function Sidebar({ empty, onVersion, onInfo, onHome }) {
  return (
    <aside className="ml-sidebar" aria-label="项目导航">
      <div className="ml-brand">
        <span className="ml-logo">W</span>
        <strong>Workbench</strong>
      </div>
      <button className="ml-nav" onClick={() => onInfo('项目墙', '原型注释: 复用当前项目墙入口。')}>
        <LayoutDashboard size={16} />
        项目墙
      </button>
      <div className="ml-project-name">Builders’ Workbench</div>
      <button
        className="ml-nav"
        onClick={() => onInfo('任务', '原型注释: 复用原生任务列表，原型不读写 Issue。')}
      >
        <Check size={16} />
        任务
      </button>
      <button className="ml-nav" onClick={() => onInfo('自动化', '原型注释: 复用原生自动化入口。')}>
        <CalendarClock size={16} />
        自动化
      </button>
      <button className="ml-nav active" aria-current="page" onClick={onHome}>
        <LayoutDashboard size={16} />
        项目总览
      </button>
      <button className="ml-nav" onClick={() => onInfo('知识库', '原型注释: 复用已有知识库入口。')}>
        <BookOpen size={16} />
        知识库
      </button>
      <div className="ml-nav-rule" />
      <div className="ml-sidebar-label">版本</div>
      <button
        className="ml-nav"
        onClick={() =>
          onInfo('新建版本', '原型注释: 复用原生版本准备入口，不在此改变固定版本与时间范围。')
        }
      >
        ＋ 新建版本
      </button>
      {!empty &&
        [
          ...fixedVersions.map((v) => ({ id: v.id, date: v.start.slice(5).replace('-', '/') })),
          ...historyPlans.toReversed().map((p) => ({ id: p.version, date: '历史' }))
        ].map((v) => (
          <details key={v.id} open={v.id === 'v1.0.1'}>
            <summary>
              <ChevronRight size={13} />
              {v.id}
              <small>{v.date}</small>
            </summary>
            <div className="ml-subnav">
              {['总览', '计划', '任务', '验收'].map((name) => (
                <button
                  key={name}
                  onClick={() =>
                    name === '总览'
                      ? onVersion(v.id)
                      : onInfo(
                          `${v.id} · ${name}`,
                          '原型注释: 沿用该版本原生入口，本稿不创建会话或工作树。'
                        )
                  }
                >
                  {name}
                </button>
              ))}
            </div>
          </details>
        ))}
      <div className="ml-nav-rule" />
      <div className="ml-sidebar-label">项目工作区</div>
      <button
        className="ml-nav"
        onClick={() => onInfo('原生工作区', '原型注释: 保留未归版工作树入口。')}
      >
        <GitBranch size={15} />
        未归版工作树
      </button>
      <button
        className="ml-nav"
        onClick={() => onInfo('其他项目', '原型注释: 保留当前项目切换入口。')}
      >
        <ChevronRight size={15} />
        其他项目
      </button>
      <div className="ml-sidebar-bottom">
        <span className="avatar">Y</span>yuzhup
      </div>
    </aside>
  )
}
export function ProjectContext() {
  return (
    <>
      <div className="ml-motto">
        <small>高效执行四原则 · FranklinCovey 4DX</small>
        <p>聚焦至关重要目标 · 贯彻引领指标 · 设立振奋人心的记分牌 · 保持相互担责的节奏</p>
      </div>
      <div className="ml-context">
        <section className="ml-card">
          <h2>Builders’ Workbench</h2>
          <p>让 builders 更快、更好地做项目</p>
          <dl>
            <dt>目标用户</dt>
            <dd>Builder、Leader</dd>
            <dt>目标方向</dt>
            <dd>更多项目纳入 Workbench 管理</dd>
            <dt>远端</dt>
            <dd>forcegravity1989/builder-workbench</dd>
          </dl>
        </section>
        <section className="ml-card">
          <h2>北极星</h2>
          <p className="ml-empty-value">未配置</p>
        </section>
      </div>
    </>
  )
}

export function Scoreboard({ theme }) {
  const frame = useRef(null)
  const [height, setHeight] = useState(530)
  useEffect(() => {
    const resize = (e) => {
      if (
        e.source === frame.current?.contentWindow &&
        e.origin === location.origin &&
        e.data?.type === 'bw-scoreboard-height' &&
        Number.isFinite(e.data.height)
      ) {
        setHeight(Math.max(250, Math.min(1500, e.data.height)))
      }
    }
    addEventListener('message', resize)
    return () => removeEventListener('message', resize)
  }, [])
  useEffect(() => {
    frame.current?.contentWindow?.postMessage(
      { type: 'bw-prototype-theme', theme },
      location.origin === 'null' ? '*' : location.origin
    )
  }, [theme])
  return (
    <iframe
      ref={frame}
      title="记分牌 · 复用最新指标原型"
      className="ml-scoreboard"
      src="prototype/scoreboard.html?embed=scoreboard"
      style={{ height }}
      onLoad={() =>
        frame.current?.contentWindow?.postMessage(
          { type: 'bw-prototype-theme', theme },
          location.origin === 'null' ? '*' : location.origin
        )
      }
    />
  )
}
