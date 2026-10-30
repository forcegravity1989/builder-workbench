import { FeatureTimeline } from './overview-timeline.jsx'
import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import { repository, baseline, snapshot, material, relatedVersions } from './overview-data.js'
// Official references are design inputs; they do not define BW's workflow or persistence.
export function ReferencePanel() {
  return (
    <>
      <p>原型注释: 以下是设计取舍的依据，不是产品已实现或用户研究的证明。</p>
      <h3>Claude · AI-native SDLC</h3>
      <p>
        原型注释: 参考 Plan、Design、Build、Test、Deploy、Maintain
        对工作过程的分析，以及持续测试与回返。BW 按已确认的工作方式：已有 Issue 的
        intent、spec、原型共同评审，以设计 PR 合入标记通过；详细设计、Plan 与开发一起推进，以实现 PR
        合入标记开发交付。SDLC 的 Plan 表示意图收敛；详细实施 Plan 仍属于 Build，
        通常留在原生会话，不增加 plan.md 入库要求。阶段、成果认可、版本交付与实际部署分别取据。
      </p>
      <a
        href="https://claude.com/resources/articles/the-ai-native-sdlc-playbook"
        target="_blank"
        rel="noreferrer"
      >
        The AI-native SDLC playbook · 官方原文 ↗
      </a>
      <h3>vis Timeline · 时间刻度与事件节点</h3>
      <p>
        原型注释: 借鉴官方组件对时点事件和起止区间的区分。横向按小时比例呈现过程时段，
        端点显示日期、时分与时区；版本验收节点独立标记，具体特性是否随版交付另行取据。
        日历历时包含等待，测试可重叠；不引入该库或新增阶段协议。
      </p>
      <a
        href="https://visjs.github.io/vis-timeline/docs/timeline/"
        target="_blank"
        rel="noreferrer"
      >
        Timeline · 官方文档 ↗
      </a>
      <h3>Linear · 按需求看阶段与里程碑</h3>
      <p>
        原型注释:
        借鉴项目内分阶段组织工作，并从概览进入相关成果的方式。本稿让两个特性分别呈现当前工作与本版范围；不用任务完成比例推导目标达成，也不把所有需求合成一个
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
        Issue，不另建反馈列表，也不引入流量分配、功能开关服务或自动发布能力。
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
        原型注释: 沿用当前壳、导航与设计系统。以项目实际版本讨论范围与交付，不强制 C/B
        命名。规划节奏不决定版本身份；每版一次正式人工验收，缺证据保持未知。不将业界工具的规则移植成
        BW 协议。
      </p>
      <p>
        原型注释: 横轴统一为 Plan / Design / Build / Test / Deploy / Maintain。
        周一09:00是周期基线，计划、设计、开发 PR 合入和验收 PR 合入分别提供阶段依据；
        仅在无法识别开发 PR 时用特性 Issue
        关闭兜底。验收还要求目标人工达成，同目标多特性暂沿整体结论。
        首版称首次交付，后续明确关联版本承接 Maintain。Deploy 暂无实际部署时间，显示未跟踪，
        不用验收或发布记录补齐。日历历时含等待，不是人工工时。
      </p>
      <p>
        原型注释:
        <a href="spec.md" target="_blank" rel="noreferrer">
          规格 ↗
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

export function HintButton({ id, text, className = '', current = false, onClick, children }) {
  return (
    <span className="ov-hint">
      <button
        type="button"
        className={className}
        aria-describedby={id}
        aria-current={current ? 'page' : undefined}
        onClick={onClick}
      >
        {children}
      </button>
      <span id={id} className="ov-tooltip" role="tooltip">
        {text}
      </span>
    </span>
  )
}

export function Feature({ feature, selectedVersion, focusRequest, openVersion }) {
  const [expanded, setExpanded] = window.BWPrototypeDependencies.useState(!!feature.previewExpanded)
  const cardRef = useRef(null)
  const toggleRef = useRef(null)
  const versions = relatedVersions(feature.id)
  useEffect(() => {
    if (focusRequest?.id !== feature.id) {
      return
    }
    setExpanded(true)
    const frame = requestAnimationFrame(() => {
      cardRef.current?.scrollIntoView({ block: 'start' })
      toggleRef.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [focusRequest, feature.id, setExpanded])
  return (
    <article ref={cardRef} className="ov-feature" aria-label={feature.title}>
      <div className="ov-feature-head">
        <button
          ref={toggleRef}
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
      {expanded && (
        <div className="ov-feature-detail">
          <div className="ov-version-tags" aria-label="关联版本">
            <span className="ov-label">关联版本</span>
            {versions.map((v) => (
              <HintButton
                key={v.version}
                id={`version-${feature.id}-${v.version}`}
                text={`关联目标：${v.scope}`}
                className="ov-version-tag"
                current={v.version === selectedVersion}
                onClick={() => openVersion(v.scene, feature.id)}
              >
                {v.version}
              </HintButton>
            ))}
          </div>
          <FeatureTimeline feature={feature} />
        </div>
      )}
    </article>
  )
}

export function SourcePanel() {
  return (
    <>
      <p>
        原型注释: 本稿使用 BW 自身的只读材料与 GitHub 快照，不是持续联网的数据接口。v0.8
        计划快照时间：
        {snapshot.source.checkedAt}。
      </p>
      <p>
        原型注释: 计划、验收及本任务 PR 分批只读刷新：
        {snapshot.pulls
          .filter((pr) => pr.readAt)
          .map((pr) => (
            <span key={pr.number}>
              {' '}
              #{pr.number} · {pr.readAt}；
            </span>
          ))}
        仅更新编号、标题、链接、状态、草稿标记与合入时间，不代表其他材料同步刷新。
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
          <a
            href={material('v0.7', 'acceptance', snapshot.source.historicalCorrectionCommit)}
            target="_blank"
            rel="noreferrer"
          >
            v0.7 归档验收
          </a>
          ；计划严格读取其 planRef.sourceCommit：
          {snapshot.acceptance.planRef.sourceCommit.slice(0, 8)}。历史材料采集于{' '}
          {snapshot.source.historicalReadAt}。
        </dd>
        <dt>未制定计划</dt>
        <dd>原型注释: v0.9 是未创建版本的布局示例，不是实际计划或新编号协议。</dd>
        <dt>工作会话</dt>
        <dd>
          原型注释: Git 分支已核对；未读取 BW 宿主登记、会话、连接状态，不用 Git 数据推断运行事实。
        </dd>
        <dt>历史需求 / 任务</dt>
        <dd>
          原型注释: 历史特性示例只呈现 #383，依据 v0.7 计划关联与 Issue 的 v0.7
          范围说明，未重建完整特性树；当时真实阶段保持未知，历史版同样默认展示明确标注的模拟横轴。历史任务名称另于{' '}
          {snapshot.source.historicalTitlesReadAt} 读取，不用当前 Issue 状态覆盖验收时状态。
        </dd>
        <dt>小任务范围</dt>
        <dd>
          原型注释:
          按真实计划的各目标显示全部任务数量，进入原生目标任务屏；显式选取的特性主单只是展示样本，没有写回真实标签。没有特性标记时使用普通任务入口，不改目标名称或补造任务类型。
        </dd>
        <dt>AI workflow</dt>
        <dd>
          原型注释: 六项人工介入／返工口径沿 workflow 正本。此处读取 PR #505
          已发表的指标评论作为真实单任务样例，#469
          尚不在这份版本计划内，不计入版本汇总。生产接线只处理目标内
          Issue；指标独立刷新并保留来源采集时间，读取失败不显示为零。
        </dd>
      </dl>
      <p>
        原型注释: “刷新版本数据”重新加载静态页面；“刷新指标”只重读本地来源快照。两者都不冒充实时
        provider 查询。生产页分别刷新版本事实和目标内的 workflow 报告。
      </p>
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
