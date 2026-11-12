import { FeatureTimeline } from './overview-timeline.jsx'
import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import { repository, baseline, snapshot, material, relatedVersions } from './overview-data.js'
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
          范围说明，未重建完整特性树；当时真实阶段保持未知，历史版同样默认展示明确标注的模拟横轴。
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
    </>
  )
}
