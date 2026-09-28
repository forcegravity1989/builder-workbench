import { React } from 'react'
import { Check, Copy, Plus, X } from 'lucide-react'
import { Field, Lamp, lampNames } from './shared.jsx'
import { metrics, remote } from './snapshot.js'

function PrototypeDialogs({ copied, copyText, goals, metricPrep, modal, setModal, update }) {
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
          {modal.type === 'goal' &&
            (() => {
              const g = goals.find((x) => x.id === modal.id)
              return (
                <div className="goal-editor">
                  <label>
                    交付件
                    <Field
                      label="补充交付件"
                      value={g.delivery}
                      onChange={(v) => update(g.id, 'delivery', v)}
                      rows={2}
                    />
                  </label>
                  <label>
                    验收标准
                    <Field
                      label="验收标准"
                      value={g.criteria}
                      onChange={(v) => update(g.id, 'criteria', v)}
                      rows={3}
                      placeholder="验收点、旅程或质量要求"
                    />
                  </label>
                  <label>
                    关联指标
                    <select
                      className="input"
                      aria-label="关联指标"
                      value={g.metricId}
                      onChange={(e) => update(g.id, 'metricId', e.target.value)}
                    >
                      <option value="">不承诺指标</option>
                      {metrics
                        .filter((m) => m.kind === 'script')
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button className="btn btn-ghost" onClick={() => metricPrep(null)}>
                    <Plus />
                    准备新指标
                  </button>
                </div>
              )
            })()}
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
                .bw。尚无本期读数；旧人工读数不进入当前目录和趋势。旧计划基线不当作当前值。总览指标迁移作为新增独立特性走六环，已形成待确认设计，尚未实现。
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
