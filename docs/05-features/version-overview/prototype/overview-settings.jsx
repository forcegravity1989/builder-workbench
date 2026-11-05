// eslint-disable-next-line no-unused-vars
const { React } = window.BWPrototypeDependencies

export function SettingsIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
      <path d="m9 3-.6 2.3-2 .9-2.1-.6-2 3.5 1.6 1.7v2.4l-1.6 1.7 2 3.5 2.1-.6 2 .9L9 21h4l.6-2.3 2-.9 2.1.6 2-3.5-1.6-1.7v-2.4l1.6-1.7-2-3.5-2.1.6-2-.9L13 3Z" />
    </svg>
  )
}

export function ExperimentalSettings({ value, onChange, onBack }) {
  const rows = [
    {
      id: 'sdlc',
      title: 'SDLC 实际过程统计',
      description: '开启后读取本项目的阶段证据，在总览中显示特性历程与来源入口。'
    },
    {
      id: 'ai',
      title: 'AI 生产力统计',
      description: '开启后读取本项目任务关联 PR 中的报告，在版本总览中显示生产力读数。'
    }
  ]
  return (
    <>
      <div className="ov-top">
        <span>设置</span>
        <span>›</span>
        <span>实验性功能</span>
      </div>
      <div className="ov-settings-content">
        <button className="ov-link ov-settings-back" onClick={onBack}>
          ← 返回版本总览
        </button>
        <header className="ov-settings-heading">
          <h1>实验性功能</h1>
          <p>按需开启，选择后立即生效。</p>
        </header>
        <section className="ov-experiment-section" aria-labelledby="experiment-project">
          <h2 id="experiment-project">项目统计</h2>
          <p className="ov-settings-scope">
            适用项目 · <strong>Builder Workbench</strong>
            <span>项目内所有版本</span>
          </p>
          <div className="set-group">
            {rows.map((row) => (
              <div className="set-row" key={row.id}>
                <div className="set-text">
                  <div className="set-title" id={`experiment-${row.id}`}>
                    {row.title}
                    <span className="ov-chip">实验</span>
                  </div>
                  <div className="set-desc" id={`experiment-${row.id}-description`}>
                    {row.description}
                  </div>
                </div>
                <div className="set-ctl">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      role="switch"
                      aria-labelledby={`experiment-${row.id}`}
                      aria-describedby={`experiment-${row.id}-description`}
                      checked={value[row.id]}
                      onChange={(event) => onChange({ ...value, [row.id]: event.target.checked })}
                    />
                    <span className="knob" />
                  </label>
                </div>
              </div>
            ))}
          </div>
          <p className="ov-settings-help">
            两项默认关闭。关闭后停止对应采集并隐藏统计，已有材料保留；版本、目标、任务、计划和人工验收继续可用。
          </p>
        </section>
        <p className="ov-note">
          原型注释: 沿用 Orca「设置 → 实验性功能」入口与开关样式，新增条目按项目生效。这里仅通过 URL
          保存当前预览，不写入真实设置，也不发起远端采集。开启后展示原有固定快照，生产实现与验证结论见本特性 STATUS。
        </p>
      </div>
    </>
  )
}
