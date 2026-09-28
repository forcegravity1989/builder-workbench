import { React, useState } from 'react'

export function PrototypeMaterialNotice({ view, setDraft, setNotice }) {
  const [show, setShow] = useState(false)
  const label = view === 'monday' ? '计划' : '验收'
  return (
    <div className="prototype-material-scenario">
      <label>
        <input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} />{' '}
        原型场景：数据文件格式有问题
      </label>
      {show && (
        <div className="material-problem">
          <span>v0.3、v0.4 的{label}数据文件格式有问题，暂无法读取。</span>
          <button
            className="btn btn-ghost"
            onClick={() => {
              const file = view === 'monday' ? 'data.json' : 'acceptance.json'
              setDraft(
                `请核对 .bw/planning/v0.3/${file} 和 .bw/planning/v0.4/${file} 的格式问题。带入${label} Skill 和当前固定工作区；先说明问题与处理方案，经我确认后使用材料服务处理，保留原件，不伪造指标或人工结论。`
              )
              setNotice('原型说明：新建原生会话并自动发送处理请求；不会直接迁移文件。')
            }}
          >
            在会话中处理
          </button>
        </div>
      )}
    </div>
  )
}
