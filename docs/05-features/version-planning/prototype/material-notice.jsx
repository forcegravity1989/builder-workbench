import { React } from 'react'
import { Info } from 'lucide-react'

export function PrototypeMaterialNotice({ view, firstEntry, onScenario, onStartRequest }) {
  const label = view === 'monday' ? '计划' : '验收'
  return (
    <div className="prototype-material-scenario">
      <label>
        原型场景
        <select
          className={view === 'monday' ? 'input' : undefined}
          value={firstEntry ? 'first' : 'selected'}
          onChange={(event) => onScenario(event.target.value)}
        >
          <option value="first">首次进入 · 旧数据 · 无会话</option>
          <option value="selected">已选版本 · 右侧业务板示例</option>
        </select>
      </label>
      {firstEntry && (
        <div className="material-problem" role="alert">
          {view === 'monday' && <Info />}
          <span>v0.3、v0.4 的{label}数据文件格式有问题，暂无法读取。</span>
          <button
            className={`btn ${view === 'monday' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => {
              const file = view === 'monday' ? 'data.json' : 'acceptance.json'
              onStartRequest(
                `请核对 .bw/planning/v0.3/${file} 和 .bw/planning/v0.4/${file} 的格式问题。带入${label} Skill 和当前固定工作区；先说明问题与处理方案，经我确认后使用材料服务处理，保留原件，不伪造指标或人工结论。`
              )
            }}
          >
            在会话中处理
          </button>
        </div>
      )}
    </div>
  )
}
