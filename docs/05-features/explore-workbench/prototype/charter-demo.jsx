const { React, createRoot, ChevronRight, X } = window.BWPrototypeDependencies

const initialVision = '让社区借书更方便。'
const revisedVision = '每周都有人带一本书来，也带一本书回家。'
const facts = [
  ['项目负责人', '林小满'],
  ['想做什么', '让邻居用手机预约周末的图书交换。'],
  ['对标', '—'],
  ['愿景', initialVision],
  ['项目群', '—']
]

function ProjectCard({ expanded }) {
  return (
    <div className="demo-overview">
      <h4>总览</h4>
      <section className="demo-card">
        <header className="demo-card-title">
          <span data-pointer-target="expand" className="demo-expand">
            <ChevronRight size={14} className={expanded ? 'demo-chevron-open' : ''} />
            <strong>周末书集</strong>
          </span>
          <span data-pointer-target="edit" title="编辑项目信息" className="demo-edit-icon">
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14.364 13.634a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506l4.013-4.009a1 1 0 0 0-3.004-3.004z" />
              <path d="M14.487 7.858A1 1 0 0 1 14 7V2M20 19.645V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l2.516 2.516M8 18h1" />
            </svg>
          </span>
        </header>
        {expanded && (
          <dl className="demo-facts">
            {facts.map(([label, value]) => (
              <React.Fragment key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
      </section>
    </div>
  )
}

function ProjectSettings({ time, vision }) {
  const changed = time >= 4400 && vision !== initialVision
  const reviewing = time >= 7400
  const fields = [['项目名称 *', '周末书集'], ...facts]
  return (
    <aside className="demo-settings">
      <header>
        <div>
          <small>项目设置</small>
          <h4>周末书集</h4>
        </div>
        <X size={16} />
      </header>
      <div className="demo-settings-scroll">
        <div className="demo-type">
          <span>项目类型</span>
          <span className="demo-value">团队项目 ⌄</span>
        </div>
        <strong>项目信息</strong>
        <dl className="demo-fields">
          {fields.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt>{label}</dt>
              <dd
                className={
                  label === '愿景' && time >= 4200 && !reviewing
                    ? 'demo-value is-typing'
                    : 'demo-value'
                }
                data-pointer-target={label === '愿景' ? 'vision' : undefined}
              >
                {label === '愿景' ? vision : value}
                {label === '愿景' && time >= 4200 && time < 6200 && <span className="demo-caret" />}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
      <footer className="demo-settings-footer">
        {changed && (
          <>
            <span className="btn btn-ghost">撤销修改</span>
            <span className="btn btn-primary" data-pointer-target="review">
              提交评审
            </span>
          </>
        )}
      </footer>
      {reviewing && (
        <section className="demo-review">
          <strong>本次修改</strong>
          <p>愿景：{revisedVision}</p>
          <span className="btn btn-primary">确认提交</span>
        </section>
      )}
    </aside>
  )
}

const pointerPhases = [
  { start: 280, click: 950, target: 'expand' },
  { start: 1540, click: 2540, target: 'edit' },
  { start: 3240, click: 4200, target: 'vision' },
  { start: 6350, click: 7400, target: 'review' }
]

function DemoPointer({ time, container }) {
  const pointerRef = React.useRef(null)
  const position = React.useRef({ x: 24, y: 22, target: '', fromX: 24, fromY: 22 })
  const phase = pointerPhases.findLast((entry) => time >= entry.start)
  React.useLayoutEffect(() => {
    if (!phase || !container.current || !pointerRef.current) {
      return
    }
    const target = container.current.querySelector(`[data-pointer-target="${phase.target}"]`)
    if (!target) {
      return
    }
    const scene = container.current.getBoundingClientRect()
    const rect = target.getBoundingClientRect()
    const state = position.current
    if (state.target !== phase.target) {
      state.target = phase.target
      state.fromX = state.x
      state.fromY = state.y
    }
    const progress = Math.min(1, (time - phase.start) / (phase.click - phase.start - 160))
    const eased = 1 - (1 - progress) ** 3
    state.x =
      state.fromX + (rect.left - scene.left + Math.min(rect.width / 2, 25) - state.fromX) * eased
    state.y = state.fromY + (rect.top - scene.top + rect.height / 2 - state.fromY) * eased
    pointerRef.current.style.transform = `translate(${state.x}px, ${state.y}px)`
  }, [time, phase, container])

  if (!phase) {
    return null
  }
  const ring = time >= phase.click && time < phase.click + 460
  const ringProgress = (time - phase.click) / 460
  return (
    <div className="demo-pointer" ref={pointerRef} aria-hidden="true">
      {ring && (
        <span
          className="demo-click-ring"
          style={{ opacity: 1 - ringProgress, transform: `scale(${0.45 + ringProgress})` }}
        />
      )}
      <span>➤</span>
    </div>
  )
}

function CharterDemo({ time }) {
  const container = React.useRef(null)
  const letterCount = Math.floor((time - 4400) / 82) + 1
  const vision = time >= 4400 ? revisedVision.slice(0, letterCount) : initialVision
  return (
    <div className="demo-workbench" ref={container} aria-label="模拟的项目总览与项目信息设置">
      <ProjectCard expanded={time >= 950} />
      {time >= 2540 && <ProjectSettings time={time} vision={vision} />}
      <DemoPointer time={time} container={container} />
    </div>
  )
}

window.createCharterPreview = (node) => {
  const root = createRoot(node)
  return {
    render(time) {
      root.render(<CharterDemo time={time} />)
    },
    unmount() {
      root.unmount()
    }
  }
}
