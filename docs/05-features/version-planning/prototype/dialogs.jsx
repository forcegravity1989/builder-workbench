import { React, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { Lamp, lampNames } from './shared.jsx'
import { original, remote } from './snapshot.js'

function PlanningSourcePreview({ modal }) {
  const snapshotCommit = 'f20f04ae57d510178c710c71216b9b734082c28e'
  const [selected, setSelected] = useState(modal.source || '')
  const excerpt = `# ${original.results.version_label} 验收记录摘录\n\n${original.results.task_summary}\n${original.results.goals.map((goal) => `\n## ${goal.label} ${goal.title}\n${goal.note}\n历史记录读数：${goal.reading || '未取得'}（非本期脚本实测）`).join('\n')}`
  return (
    <div className="source-copy">
      <p>
        原型示意：使用固定评审快照演示来源选择；未连接真实归档，也不表示快照已通过生产归档核验。
      </p>
      <p>请选择本次进展的依据；仅关联来源，不覆盖已写进展。</p>
      <select
        className="input"
        aria-label="进展来源验收记录"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="" disabled>
          尚未关联来源
        </option>
        <option value={snapshotCommit}>
          {original.results.version_label} · f20f04ae · 固定评审快照示例
        </option>
      </select>
      {selected ? (
        <>
          <p>
            来源：{original.results.version_label} · {snapshotCommit}（只读）
          </p>
          <pre>{excerpt}</pre>
          <details>
            <summary>原始材料（历史快照）</summary>
            <pre>{JSON.stringify(original.results, null, 2)}</pre>
          </details>
          {selected !== modal.source && (
            <button className="btn btn-secondary" onClick={() => modal.onSource(selected)}>
              作为进展来源（演示）
            </button>
          )}
        </>
      ) : (
        <p>尚未关联来源。生产中由人选择可核验的归档记录；缺少材料时保持未关联。</p>
      )}
    </div>
  )
}

function PrototypeDialogs({ copied, copyText, modal, setModal }) {
  return (
    <div className="dialog-backdrop" onClick={() => setModal(null)}>
      <section
        className="dialog review-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={modal.title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{modal.title}</h2>
          {modal.type === 'text' && (
            <button className="btn btn-secondary copy-action" onClick={copyText}>
              {copied === modal.text ? <Check /> : <Copy />}
              {copied === modal.text ? '已复制' : '复制'}
            </button>
          )}
          <button
            className="btn btn-icon btn-ghost"
            aria-label="关闭"
            onClick={() => setModal(null)}
          >
            <X />
          </button>
        </header>
        <div className="dialog-content">
          {modal.type === 'text' && <pre>{modal.text}</pre>}
          {modal.type === 'planning-source' && <PlanningSourcePreview modal={modal} />}
          {modal.type === 'scope' && (
            <div className="source-copy">
              <p>
                新增独立特性：总览指标迁移。让 Builder 与 Leader
                在项目总览读取真实指标，并在版本计划中选用同一指标资产。
              </p>
              <p>
                范围：迁入 main 的指标定义、采集与读数能力；展示项目 / 特性归属及引领性 /
                滞后性关系；与周一目标选取、周五实际值共用数据。
              </p>
              <p>
                按六环交付：intent → spec → 实现设计 → TDD → 验收点 E2E → 用户旅程
                E2E。当前只演示页面位置和真实指标目录，各环尚未确认或实施。
              </p>
            </div>
          )}
          {modal.type === 'source' && (
            <div className="source-copy">
              <p>
                交互原型：编辑仅保留在本页内存，未连接 Orca、保存仓内文件、修改 GitHub 或发起 PR。
              </p>
              <p>
                布局延续第三版与仓内设计系统。计划 /
                验收保留左侧分支会话；总览、任务走侧栏的独立页面。
              </p>
              <p>
                任务复用落点已核对：TaskPageContent → GitHubItemDialog → ConversationTabDescription
                / GitHubMarkdownComposer →
                runWorkItemBodyUpdate。当前页面模拟该交互，未打包原生组件或连接真实保存接口。
              </p>
              <p>
                会话为导航示意，未读取实际 Orca 记录。名称由 Orca
                产生；版本和周次为关联上下文，不强制改标题。
              </p>
              <p>
                纪要严格使用仓内 minutes-template.md
                的三节标题及列表结构，从右侧当前目标生成。缺失项保持待明确，不补造负责人、日期或读数。
              </p>
              <p>
                指标定义和脚本来自 main 的
                .bw。尚无本期读数；旧人工读数不进入当前目录和趋势。旧计划基线不当作当前值。此原型使用历史快照，不执行实际采集。
              </p>
              <p>
                Issue 状态与正文读取于 {remote.readAt}。关闭 Issue 不自动等于目标达成。归档 PR
                尚未读取；点击归档只准备会话消息，不提交或合入 PR。
              </p>
              <div className="signal-legend">
                {Object.entries(lampNames).map(([tone, name]) => (
                  <span key={tone}>
                    <Lamp tone={tone} />
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {modal.type === 'route' && <p>沿用现有 Orca / BW 入口，本轮不扩展该界面。</p>}
        </div>
      </section>
    </div>
  )
}
export { PrototypeDialogs }
