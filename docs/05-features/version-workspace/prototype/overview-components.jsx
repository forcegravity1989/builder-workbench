import { IconAction } from './g2-icon-action.jsx'
import { repository, baseline, stages } from './overview-data.js'
// Official references are design inputs; they do not define BW's workflow or persistence.
export function ReferencePanel() {
  return (
    <>
      <p>
        本轮补充核对的业界参考 · 2026-10-27。以下是设计取舍的依据，不是产品已实现或用户研究的证明。
      </p>
      <h3>Linear · 按需求看阶段与里程碑</h3>
      <p>
        借鉴项目内分阶段组织工作，并从概览进入相关成果的方式。本稿让两个大需求分别呈现当前工作与本版范围；不用任务完成比例推导目标达成，也不把所有需求合成一个
        G2 状态。
      </p>
      <a href="https://linear.app/docs/project-milestones" target="_blank" rel="noreferrer">
        Project milestones · 官方文档 ↗
      </a>
      <h3>GitHub · 评审面向具体修订</h3>
      <p>
        借鉴评论、认可、要求修改的区分。待审入口定位具体成果及修订，修改后可以重新评审；PR
        合入、用户可用和人工验收分别保留事实。
      </p>
      <a
        href="https://docs.github.com/en/pull-requests/reference/pull-request-reviews"
        target="_blank"
        rel="noreferrer"
      >
        Pull request reviews · 官方文档 ↗
      </a>
      <h3>LaunchDarkly · 逐步向使用者开放</h3>
      <p>
        借鉴逐步开放能力时明确使用者范围的思路。本稿呈现 MVP 试用人群、包或部署依据、已知问题和后续
        Issue；不引入流量分配、功能开关服务或自动发布能力。
      </p>
      <a
        href="https://launchdarkly.com/docs/home/releases/progressive-rollouts"
        target="_blank"
        rel="noreferrer"
      >
        Progressive rollouts · 官方文档 ↗
      </a>
      <hr />
      <h3>BW 自己的依据</h3>
      <p>
        沿用当前壳、导航与设计系统。月度选择、按周反馈、每个 B
        版本一次正式人工验收、缺证据保持未知，来自本仓原则和本轮交接；不将业界工具的规则移植成 BW
        协议。
      </p>
      <p>
        <a href="spec.md#v08-overview-draft" target="_blank" rel="noreferrer">
          本轮规格草案 ↗
        </a>{' '}
        · <a href="version-overview-journey.html">审阅旅程 ↗</a>
      </p>
    </>
  )
}
const {
  // Used by the shared JSX build factory.
  // eslint-disable-next-line no-unused-vars
  React,
  useEffect,
  useRef,
  X,
  ArrowUpRight,
  GitBranch,
  ChevronRight
} = window.BWPrototypeDependencies

export function Dialog({ title, children, close, wide = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const element = ref.current
    element.showModal()
    return () => element.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={`ov-dialog ${wide ? 'wide' : ''}`}
      aria-label={title}
      onCancel={close}
    >
      <header>
        <h2>{title}</h2>
        <IconAction icon={X} label="关闭对话框" onClick={close} />
      </header>
      <div className="ov-dialog-body">{children}</div>
    </dialog>
  )
}

export function SectionTitle({ id, title, extra }) {
  return (
    <div className="ov-section-title" id={id}>
      <h2>{title}</h2>
      <span className="muted">{extra}</span>
    </div>
  )
}

export function Feature({ feature, scenario, openArtifact, openSession }) {
  const [expanded, setExpanded] = window.BWPrototypeDependencies.useState(false)
  const [stage, setStage] = window.BWPrototypeDependencies.useState(null)
  const rows = stage ? feature.artifacts.filter((row) => row[0] === stage) : feature.artifacts
  return (
    <article className="ov-feature" aria-label={feature.title}>
      <div className="ov-feature-head">
        <button
          className="ov-feature-toggle"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          <ChevronRight size={16} className={expanded ? 'ov-rotate' : ''} />
          <strong>{feature.title}</strong>
        </button>
        <a
          className="ov-issue"
          href={`${repository}/issues/${feature.id}`}
          target="_blank"
          rel="noreferrer"
        >
          #{feature.id}
        </a>
        <span className="muted">{feature.owner}</span>
        <span className="ov-chip">{feature.stage}</span>
      </div>
      <div className="ov-feature-summary">
        <div>
          <span className="ov-label">本版承担</span>
          <p>{feature.scope}</p>
        </div>
        <button
          className="ov-next"
          onClick={() =>
            openArtifact(
              feature,
              feature.artifacts.find((row) => row[4] === feature.reviewKeys[0]) ||
                feature.artifacts[5]
            )
          }
        >
          {feature.next}
          <ArrowUpRight size={15} />
        </button>
      </div>
      {expanded && (
        <div className="ov-feature-detail">
          <div className="ov-purpose">
            <span className="ov-label">整体目标</span>
            <span>{feature.purpose}</span>
          </div>
          <div className="ov-stages" aria-label={`${feature.title}成果类别`}>
            <button aria-pressed={stage === null} onClick={() => setStage(null)}>
              全部成果
            </button>
            {stages.map((name) => (
              <button key={name} aria-pressed={stage === name} onClick={() => setStage(name)}>
                {name}
              </button>
            ))}
          </div>
          <div className="ov-artifacts">
            {rows.map((row) => (
              <button
                key={row[0]}
                className="ov-artifact"
                onClick={() => openArtifact(feature, row)}
              >
                <span className="ov-label">{row[0]}</span>
                <span>
                  <strong>{row[1]}</strong>
                  <small>{row[3]}</small>
                </span>
                <span className="ov-chip">{row[2]}</span>
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
          <div className="ov-feature-bottom">
            <span className="muted">后续 B · {feature.later}</span>
            <button className="ov-link" onClick={() => openSession(feature)}>
              <GitBranch size={14} />
              工作会话
            </button>
          </div>
          {scenario === 'repair' && (
            <p className="ov-note">本版设计可返回修改；先行 B 的承诺与人工验收仍保留在历史版本。</p>
          )}
        </div>
      )}
    </article>
  )
}

export function SourcePanel() {
  return (
    <>
      <p>
        除下列正式计划快照与可打开的仓库文档外，本页进展、PR、会话、试用与历史结论均为演示。切换情景不会写入真实材料。
      </p>
      <table className="ov-source-table">
        <tbody>
          <tr>
            <th>正式承诺</th>
            <td>
              <a
                href={`${repository}/blob/${baseline}/.bw/planning/v0.8/data.json`}
                target="_blank"
                rel="noreferrer"
              >
                v0.8 计划 · {baseline.slice(0, 8)}
              </a>
              ；归档 PR #446。G2 原文保留，MVP 的具体边界仍是候选。
            </td>
          </tr>
          <tr>
            <th>共同输入</th>
            <td>
              <a
                href={`${repository}/blob/d69058d15aad9362456dbe353b9318275fa2b9e4/docs/05-features/version-workspace/overview-design-inputs.md`}
                target="_blank"
                rel="noreferrer"
              >
                PR #458 共享设计输入
              </a>
              ；读取时尚未合入，本分支仅引用。
            </td>
          </tr>
          <tr>
            <th>最新成果</th>
            <td>
              建议：从明确关联的 Issue/PR
              与所属宿主工作树读取，记录文件、提交或草稿修订、读取时间。未合入成果不覆盖正式承诺；本原型尚未接入。
            </td>
          </tr>
          <tr>
            <th>历史验收</th>
            <td>
              建议：沿既有 committed planRef 与验收修订固定读回。当前 PR/Issue
              动态另列，不能回写当时结论。
            </td>
          </tr>
          <tr>
            <th>缺证据</th>
            <td>
              区分未记录、读取失败、来源过期。没有正式计划时显示“承诺尚未确认”，保留草稿入口，不从
              PR 或会话补造承诺。
            </td>
          </tr>
          <tr>
            <th>跨版身份</th>
            <td>
              首轮用完整仓库 Issue 引用 #334 / #440 演示关联，G2
              只作本版目标归组。跨版大需求最终身份、导航和存储由主会话协调。
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        <a href="spec.md#v08-overview-draft">阅读规格草案与待审选择</a> ·{' '}
        <a href="intent.md">意图草案</a>
      </p>
    </>
  )
}
