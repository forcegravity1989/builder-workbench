import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import { repository, baseline, stages, snapshot, material } from './overview-data.js'
// Official references are design inputs; they do not define BW's workflow or persistence.
export function ReferencePanel() {
  return (
    <>
      <p>
        原型注释: 本轮补充核对的业界参考 ·
        2026-10-28。以下是设计取舍的依据，不是产品已实现或用户研究的证明。
      </p>
      <h3>Claude · AI-native SDLC</h3>
      <p>
        原型注释: 参考 Plan、Design、Build、Test、Deploy、Maintain
        六阶段及可回返的制品链。结合本次确认，实施 Plan
        放在开发阶段；intent、spec、原型设计是独立评审对象。阶段、成果是否认可、版本验收分别表达，不照搬自动审批机制。
      </p>
      <a
        href="https://claude.com/resources/articles/the-ai-native-sdlc-playbook"
        target="_blank"
        rel="noreferrer"
      >
        The AI-native SDLC playbook · 官方原文 ↗
      </a>
      <h3>Linear · 按需求看阶段与里程碑</h3>
      <p>
        原型注释:
        借鉴项目内分阶段组织工作，并从概览进入相关成果的方式。本稿让两个大需求分别呈现当前工作与本版范围；不用任务完成比例推导目标达成，也不把所有需求合成一个
        G2 状态。
      </p>
      <a href="https://linear.app/docs/project-milestones" target="_blank" rel="noreferrer">
        Project milestones · 官方文档 ↗
      </a>
      <h3>GitHub · 评审面向具体修订</h3>
      <p>
        原型注释: 借鉴评论、认可、要求修改的区分。待审入口定位具体成果及修订，修改后可以重新评审；PR
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
        原型注释:
        借鉴逐步开放能力时明确使用者范围的思路。发布成果记录版本、包与使用范围；反馈统一进入目标下的
        Issue，不另建 MVP 反馈列表，也不引入流量分配、功能开关服务或自动发布能力。
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
        原型注释: 沿用当前壳、导航与设计系统。月度选择、按周反馈、每个 B
        版本一次正式人工验收、缺证据保持未知，来自本仓原则和本轮交接；不将业界工具的规则移植成 BW
        协议。
      </p>
      <p>
        原型注释:
        <a href="spec.md" target="_blank" rel="noreferrer">
          本轮规格草案 ↗
        </a>{' '}
        · <a href="journey.html">审阅旅程 ↗</a>
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

export function Feature({ feature, openArtifact, openSession }) {
  const [expanded, setExpanded] = window.BWPrototypeDependencies.useState(false)
  const [stage, setStage] = window.BWPrototypeDependencies.useState(feature.currentStage)
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
          <span className="ov-label">本版承担 · {feature.goalId}</span>
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
                key={row[4]}
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
          {stage && rows.length === 0 && <p className="ov-inline-empty">此阶段尚无已记录成果</p>}
          <div className="ov-feature-bottom">
            <button
              className="ov-link"
              onClick={() =>
                openArtifact(
                  feature,
                  feature.artifacts.find((row) => row[4] === 'issues')
                )
              }
            >
              目标 {feature.goalId} 的关联 Issue ↗
            </button>
            <button className="ov-link" onClick={() => openSession(feature)}>
              <GitBranch size={14} />
              工作会话
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

export function SourcePanel() {
  return (
    <>
      <p>
        原型注释: 本稿使用 BW 自身的只读材料与 GitHub 快照，不是持续联网的数据接口。采集时间：
        {snapshot.source.checkedAt}。
      </p>
      <dl>
        <dt>版本中</dt>
        <dd>
          <a href={material('v0.8')} target="_blank" rel="noreferrer">
            v0.8 计划 · {baseline.slice(0, 8)}
          </a>
          ；Issue/PR 来自 GitHub 原生字段。
        </dd>
        <dt>交付后</dt>
        <dd>
          <a href={material('v0.7', 'acceptance')} target="_blank" rel="noreferrer">
            v0.7 归档验收
          </a>
          ；计划严格读取其 planRef.sourceCommit：
          {snapshot.acceptance.planRef.sourceCommit.slice(0, 8)}。
        </dd>
        <dt>未制定计划</dt>
        <dd>原型注释: v0.9 是未创建版本的布局示例，不是实际计划或新编号协议。</dd>
        <dt>工作会话</dt>
        <dd>
          原型注释: Git 分支已核对；未读取 BW 宿主登记、会话、连接状态，不用 Git 数据推断运行事实。
        </dd>
        <dt>历史需求 / 任务</dt>
        <dd>
          原型注释: 历史大需求示例只呈现 #334 与 #383，依据 v0.7 计划关联与 Issue 的 v0.7
          范围说明，未重建完整特性树；当时阶段保持未知。历史小任务名称另于{' '}
          {snapshot.source.historicalTitlesReadAt} 读取，不用当前 Issue 状态覆盖验收时状态。
        </dd>
        <dt>小任务范围</dt>
        <dd>
          原型注释: 这份快照的小任务样本来自 G4；真实实现应纳入各目标下明确的小需求 /
          bug，不以目标序号判断任务类型，也不按时间强制把 MVP 反馈移出 Issue。
        </dd>
        <dt>AI workflow</dt>
        <dd>
          原型注释:
          表中“待核对”和下方空值来自尚未解析会话，并不表示未使用流程或没有人工介入。本轮只画视图，未创建执行器、会话统计库或自动质量判定。
        </dd>
      </dl>
      <p>
        原型注释:
        当前设计文档可编辑；任务分支的源文件与固定快照分别标识。临时编辑不改写来源，也不回写
        GitHub。
      </p>
      <p>
        <a
          href={`${repository}/blob/d69058d15aad9362456dbe353b9318275fa2b9e4/docs/05-features/version-workspace/overview-design-inputs.md`}
        >
          共同设计输入 PR #458
        </a>
      </p>
    </>
  )
}
