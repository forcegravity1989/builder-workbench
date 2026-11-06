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

function SettingToggle({ title, description, checked, onChange }) {
  return (
    <div className="set-row">
      <div className="set-text">
        <div className="set-title">{title}</div>
        <div className="set-desc">{description}</div>
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          role="switch"
          aria-label={title}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="knob" />
      </label>
    </div>
  )
}

export function ExperimentalSettings({
  value,
  onChange,
  sample,
  onSampleChange,
  pet,
  onPetChange,
  onBack
}) {
  const [project, setProject] = React.useState('Builder Workbench')
  const active = project === 'Builder Workbench' ? value : sample
  const save = project === 'Builder Workbench' ? onChange : onSampleChange
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
        </header>
        <section className="ov-experiment-section" aria-labelledby="experiment-project">
          <h2 id="experiment-project">按项目设置</h2>
          <div className="set-group">
            <div className="ov-project-scope">
              <h3>版本总览统计</h3>
              <label htmlFor="overview-project">适用项目</label>
              <select
                className="input"
                id="overview-project"
                value={project}
                onChange={(event) => setProject(event.target.value)}
              >
                <option>Builder Workbench</option>
                <option>示例项目</option>
              </select>
              <p className="set-desc">仅在本机对「{project}」的所有版本生效。</p>
            </div>
            <SettingToggle
              title="SDLC 实际过程统计"
              description="开启后读取本项目的阶段证据，在版本总览中显示特性历程与来源入口。"
              checked={active.sdlc}
              onChange={(sdlc) => save({ ...active, sdlc })}
            />
            <SettingToggle
              title="AI 生产力统计"
              description="开启后读取本项目任务关联 PR 中的报告，在版本总览中显示生产力读数。"
              checked={active.ai}
              onChange={(ai) => save({ ...active, ai })}
            />
          </div>
        </section>
        <section className="ov-experiment-section" aria-labelledby="experiment-global">
          <h2 id="experiment-global">全局设置</h2>
          <p className="set-desc">以下设置适用于本机所有项目。</p>
          <SettingToggle
            title="宠物"
            description="右下角漂浮的动画宠物。"
            checked={pet}
            onChange={onPetChange}
          />
        </section>
        <p className="ov-note">
          原型注释: 版本总览使用 Builder Workbench 的固定快照。此处的设置只用于预览。
        </p>
      </div>
    </>
  )
}
