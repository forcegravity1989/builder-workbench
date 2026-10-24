const {
  React,
  useState,
  useEffect,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  Plus,
  X,
  Target,
  GitPullRequest,
  BrainCircuit,
  Pencil,
  Check,
  ArrowUp,
  MessageSquare,
  Copy,
  ChartNoAxesCombined,
  RefreshCw,
  GitBranch,
  CalendarClock
} = window.BWPrototypeDependencies
import {
  metricCatalog,
  taskKind,
  sendTargets,
  quickLaunchAgents,
  minutesRequestPrompt
} from './g3-model.js'
export { React }
export function Icon({ name, size = 16 }) {
  if (name === 'annotate-mode') {
    // vendor 冻结、无 MessageSquarePlus：气泡 + 加号用两枚图标组合。
    return (
      <span className="g3-annotate-glyph" aria-hidden="true">
        <MessageSquare size={size} />
        <Plus size={Math.round(size * 0.58)} />
      </span>
    )
  }
  const Component =
    {
      down: ChevronDown,
      right: ChevronRight,
      arrow: ArrowUpRight,
      plus: Plus,
      close: X,
      target: Target,
      pr: GitPullRequest,
      agent: BrainCircuit,
      edit: Pencil,
      check: Check,
      send: ArrowUp,
      annotate: MessageSquare,
      chat: MessageSquare,
      copy: Copy,
      metric: ChartNoAxesCombined,
      refresh: RefreshCw,
      branch: GitBranch,
      automation: CalendarClock
    }[name] || Target
  return <Component size={size} aria-hidden="true" />
}
export function IconButton({ name, label, href, className = '', ...props }) {
  const [tip, setTip] = useState(null)
  const show = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setTip({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 232)),
      top: rect.bottom + 32 > window.innerHeight ? rect.top - 32 : rect.bottom + 4
    })
  }
  const Control = href ? 'a' : 'button'
  return (
    <span className="g3-icon-wrap" onMouseLeave={() => setTip(null)}>
      <Control
        className={`g3-icon-button ${className}`}
        aria-label={label}
        href={href}
        {...(href ? { target: '_blank', rel: 'noreferrer' } : {})}
        {...props}
        onMouseEnter={show}
        onFocus={show}
        onBlur={() => setTip(null)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setTip(null)
          }
        }}
      >
        <Icon name={name} />
      </Control>
      {tip && (
        <span className="g3-tooltip" aria-hidden="true" style={tip}>
          {label}
        </span>
      )}
    </span>
  )
}
export function Field({ label, value, onChange, placeholder, rows = 2 }) {
  return (
    <label className="g3-field">
      <span>{label}</span>
      <textarea
        rows={rows}
        value={value || ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
// 对象级动作按钮：图标 + 短动词文字（业界通行「动词 + 宾语」，AI 角色由图标与
// 弹窗标题承载，不写进按钮）。2026-10-22 真机反馈轮替换纯小图标，解决动作点隐蔽。
export function ActionButton({ icon = 'agent', children, className = '', ...props }) {
  return (
    <button type="button" className={`g3-action-button ${className}`} {...props}>
      <Icon name={icon} size={14} /> {children}
    </button>
  )
}
// 发送指令弹窗：对齐 Orca 原生发送菜单（「发送至」运行中会话 + 不可用原因 +
// 「新建智能体」快捷启动），顶部指令预览是 BW 包装层加的——原生菜单不显示
// 待发送文本，人确认「发什么、发给谁」后再发送。演示不真正发送。
export function SendPopover({ request, rect, onPick, onClose }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const POP_W = 340
  const POP_H = 320
  const left = Math.max(16, Math.min(rect.left, window.innerWidth - POP_W - 16))
  const below = rect.bottom + 8
  const top =
    below + POP_H > window.innerHeight - 16
      ? Math.max(16, Math.min(rect.top - POP_H - 8, window.innerHeight - POP_H - 16))
      : below
  return (
    <div
      className="g3-send-pop"
      role="dialog"
      aria-label={`发送指令给计划助手（${request.kind}）`}
      style={{ left, top }}
    >
      <header>
        <Icon name="send" size={13} />
        <strong>发送指令给计划助手</strong>
        <IconButton name="close" label="关闭发送弹窗" onClick={onClose} />
      </header>
      <div className="g3-send-preview" aria-label="待发送指令预览">
        <small>{request.kind}</small>
        <p>{request.text}</p>
      </div>
      <p className="g3-send-label">发送至</p>
      <div className="g3-send-targets">
        {sendTargets.map((target) => (
          <button
            key={target.id}
            type="button"
            disabled={!target.eligible}
            title={target.eligible ? `发送到「${target.name}」` : target.state}
            onClick={() => target.eligible && onPick(target)}
          >
            <span className={`g3-dot ${target.stateKind}`} aria-hidden="true" />
            <span className="g3-send-name">{target.name}</span>
            <small>{target.state}</small>
          </button>
        ))}
      </div>
      <p className="g3-send-label">新建智能体</p>
      <div className="g3-send-targets">
        {quickLaunchAgents.map((agent) => (
          <button key={agent.id} type="button" onClick={() => onPick({ ...agent, launched: true })}>
            <Icon name="agent" size={14} />
            <span className="g3-send-name">{agent.name}</span>
            <small>{agent.note}</small>
          </button>
        ))}
      </div>
      <footer className="g3-annotation">
        对齐 Orca 原生发送菜单（会话列表 + 快捷启动复用原生组件）；指令预览为 BW
        包装层新增。演示不真正发送。
      </footer>
    </div>
  )
}
function Lines({ text, empty = '待明确' }) {
  return (
    <div className="g3-lines">
      {(text || empty)
        .split('\n')
        .filter((line) => line.trim())
        .map((line, i) => (
          <p key={i}>{line}</p>
        ))}
    </div>
  )
}
function AnnotationMarkers({ numbers, object, onOpenPanel }) {
  if (!numbers.length) {
    return null
  }
  return (
    <span className="g3-annot-markers">
      {numbers.map((n) => (
        <button
          key={n}
          className="g3-annot-marker"
          title={`批注 ${n} · 打开板面批注窗`}
          aria-label={`板面批注 ${n}（${object}）`}
          onClick={() => onOpenPanel()}
        >
          {n}
        </button>
      ))}
    </span>
  )
}
function MetricCommitment({ goal, commit, onCommit, onCollect, markers }) {
  const metric = commit ? metricCatalog.find((m) => m.id === commit.id) : null
  return (
    <div className="g3-metric-block" data-annotate={`${goal.goalId} · 指标承诺`}>
      <h3>指标承诺{markers}</h3>
      {metric ? (
        <div className="g3-metric-row">
          <label className="g3-metric-select">
            <Icon name="metric" size={14} />
            <select
              aria-label={`${goal.goalId} 指标承诺`}
              value={commit.id}
              onChange={(e) => onCommit(e.target.value ? { id: e.target.value, target: '' } : null)}
            >
              <option value="">移除指标承诺</option>
              {metricCatalog.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <span className="g3-metric-current">
            当前 <strong title="本期尚未采集">{metric.current ?? '—'}</strong>
          </span>
          <label className="g3-metric-target">
            {metric.current == null ? '目标草案' : '目标'}
            <input
              aria-label={`${goal.goalId} 指标目标值`}
              value={commit.target}
              placeholder="本版目标值"
              onChange={(e) => onCommit({ ...commit, target: e.target.value })}
            />
          </label>
          <button className="g3-metric-collect" onClick={onCollect}>
            <Icon name="refresh" size={13} /> 采集
          </button>
        </div>
      ) : (
        <select
          className="g3-metric-add"
          aria-label={`${goal.goalId} 添加指标承诺（可选）`}
          value=""
          onChange={(e) => e.target.value && onCommit({ id: e.target.value, target: '' })}
        >
          <option value="">添加指标承诺（可选）</option>
          {metricCatalog.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
export function GoalRow({
  goal,
  tasks,
  expanded,
  toggle,
  update,
  commit,
  onCommit,
  onCollect,
  sendRequest,
  startTask,
  annotationNumbers,
  onOpenPanel,
  onDelete,
  editing,
  setEditing
}) {
  const goalTarget = `${goal.goalId} 目标`
  const headTarget = `${goal.goalId} · 目标句`
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  useEffect(() => {
    if (!expanded) {
      setConfirmingDelete(false)
    }
  }, [expanded])
  return (
    <article
      className={`g3-goal ${expanded ? 'open' : ''}`}
      id={`goal-${goal.goalId}`}
      data-annotate={goalTarget}
    >
      <div className="g3-goal-head" data-annotate={headTarget}>
        <button
          className="g3-goal-toggle"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? '收起' : '展开'} ${goal.goalId}`}
        >
          <Icon name={expanded ? 'down' : 'right'} size={14} />
          <span className="g3-goal-id">{goal.goalId}</span>
          {!editing && <strong>{goal.title || '待明确目标'}</strong>}
        </button>
        {editing && (
          <textarea
            className="g3-title-input"
            rows={1}
            aria-label={`${goal.goalId} 目标`}
            value={goal.title}
            onChange={(e) => update('title', e.target.value)}
          />
        )}
        <AnnotationMarkers
          numbers={[
            ...(annotationNumbers[headTarget] || []),
            ...(annotationNumbers[goalTarget] || [])
          ]}
          object={goalTarget}
          onOpenPanel={onOpenPanel}
        />
        <span className="g3-goal-count">{tasks.length} Issue</span>
        {expanded && !confirmingDelete && (
          <>
            <IconButton
              name={editing ? 'check' : 'edit'}
              label={editing ? '结束编辑目标' : '编辑目标'}
              onClick={() => setEditing(!editing)}
            />
            <IconButton
              name="close"
              label={`删除目标 ${goal.goalId}`}
              onClick={() => setConfirmingDelete(true)}
            />
          </>
        )}
        {expanded && confirmingDelete && (
          <span className="g3-goal-confirm">
            <button className="danger" onClick={() => onDelete(goal.goalId)}>
              确认删除
            </button>
            <button onClick={() => setConfirmingDelete(false)}>取消</button>
          </span>
        )}
      </div>
      {!expanded && (
        <div className="g3-goal-meta">
          <span>{goal.owner || '负责人待明确'}</span>
          {goal.deadline && <span>{goal.deadline}</span>}
        </div>
      )}
      {expanded && (
        <div className="g3-goal-body">
          <div className="g3-goal-meta">
            {editing ? (
              <>
                <label>
                  负责人{' '}
                  <input
                    aria-label={`${goal.goalId} 负责人`}
                    value={goal.owner || ''}
                    onChange={(e) => update('owner', e.target.value)}
                  />
                </label>
                <label>
                  计划完成{' '}
                  <input
                    aria-label={`${goal.goalId} 计划完成`}
                    value={goal.deadline || ''}
                    placeholder="日期或版本"
                    onChange={(e) => update('deadline', e.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <span>{goal.owner || '负责人待明确'}</span>
                <span>{goal.deadline || '计划完成待明确'}</span>
              </>
            )}
          </div>
          <div className="g3-commitment">
            <div className="g3-acceptance" data-annotate={`${goal.goalId} · 验收标准`}>
              {editing ? (
                <Field
                  label="验收标准"
                  value={goal.acceptance}
                  onChange={(v) => update('acceptance', v)}
                  rows={3}
                  placeholder="谁做什么操作、看到什么结果；涉及数值时写口径和目标值"
                />
              ) : (
                <>
                  <h3>
                    验收标准
                    <AnnotationMarkers
                      numbers={annotationNumbers[`${goal.goalId} · 验收标准`] || []}
                      object={`${goal.goalId} · 验收标准`}
                      onOpenPanel={onOpenPanel}
                    />
                  </h3>
                  <Lines text={goal.acceptance} />
                </>
              )}
            </div>
            <MetricCommitment
              goal={goal}
              commit={commit}
              onCommit={onCommit}
              onCollect={onCollect}
              markers={
                <AnnotationMarkers
                  numbers={annotationNumbers[`${goal.goalId} · 指标承诺`] || []}
                  object={`${goal.goalId} · 指标承诺`}
                  onOpenPanel={onOpenPanel}
                />
              }
            />
          </div>
          <div className="g3-task-head">
            <h3>
              关联 Issue <span>{tasks.length}</span>
            </h3>
            <ActionButton
              onClick={(e) =>
                sendRequest(
                  `按 ${goal.goalId} 验收标准核对已有 Issue，给出拆解与关联建议`,
                  '拆解请求',
                  e.currentTarget.getBoundingClientRect()
                )
              }
            >
              拆解 Issue
            </ActionButton>
          </div>
          <div className="g3-tasks">
            {tasks.length ? (
              tasks.map((task) => {
                const taskTarget = `${goal.goalId} · #${task.number}`
                const kind = taskKind(task.labels)
                return (
                  <div className="g3-task" key={task.number} data-annotate={taskTarget}>
                    <a
                      href={
                        task.url ||
                        `https://github.com/forcegravity1989/builder-workbench/issues/${task.number}`
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="g3-id">#{task.number}</span>
                      {task.title?.replace(/^【.*?】/, '') || '标题未读到'}
                    </a>
                    <span
                      className={`g3-task-kind ${kind === 'Bug' ? 'bug' : ''}`}
                      title="按 issue-state 规范标签推导；无 Bug/缺陷 标签默认按 Feature 显示"
                    >
                      {kind}
                    </span>
                    <span className="g3-task-state">
                      {task.state === 'CLOSED'
                        ? '已关闭'
                        : task.state === 'OPEN'
                          ? '开放'
                          : '状态未知'}
                    </span>
                    <AnnotationMarkers
                      numbers={annotationNumbers[taskTarget] || []}
                      object={taskTarget}
                      onOpenPanel={onOpenPanel}
                    />
                    <IconButton
                      name="arrow"
                      label={`开工 #${task.number}（G2 衔接）`}
                      onClick={() => startTask(task)}
                    />
                  </div>
                )
              })
            ) : (
              <p className="g3-empty">与计划助手核对已有 Issue，再按验收标准拆解。</p>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
// 纪要空态骨架卡（2026-10-22 真机反馈轮定结构；第八轮减注释密度）：没有纪要或
// 助手尚未整理时也显示固定结构——「共识 / 遗留」两块占位 + 「未生成」徽章 +
// 整理动作在卡上，界面结构稳定可预见，人能看到纪要生成后的样子。
// 第八轮修正：原空态塞了 4 段说明文字 + 1 个区块小注，「闭环 = …由人标记」在
// 骨架卡 / 纪要卡 / tooltip 出现三次；占位灰条带边框配虚线卡，看着像加载坏了而不是空态。
// 现只保留脚部一句，占位条改细去边框；「批注模式入口 / 会议 ID 可提供」这类操作指引
// 移到「整理纪要」的发送弹窗指令预览——那里才是人要动手的地方，不该常驻板面。
// disabledReason：计划未建时生产会禁用「整理纪要」，原型的禁用按钮必须给出原因，
// 否则卡上最显眼的动作是个按不动又不说明的死按钮。
export function MinutesSkeleton({ sendRequest, disabled = false, disabledReason = '' }) {
  return (
    <article className="g3-minutes skeleton" aria-label="会议纪要（未生成）">
      <div className="g3-minutes-head">
        <span className="g3-status">未生成</span>
        <span className="g3-minutes-actions">
          <ActionButton
            disabled={disabled}
            title={disabled ? disabledReason : undefined}
            onClick={(e) =>
              sendRequest(
                minutesRequestPrompt,
                '整理纪要请求',
                e.currentTarget.getBoundingClientRect()
              )
            }
          >
            整理纪要
          </ActionButton>
        </span>
      </div>
      <div className="g3-minutes-section">
        <strong>共识</strong>
        <p className="g3-skeleton-line" aria-hidden="true" />
      </div>
      <div className="g3-minutes-section">
        <strong>遗留</strong>
        <p className="g3-skeleton-line" aria-hidden="true" />
      </div>
      <div className="g3-minutes-foot">
        <span className="g3-muted">
          {disabled ? disabledReason : '由计划助手汇总评审会批注生成，经人工确认后生效。'}
        </span>
      </div>
    </article>
  )
}
export function MinutesCard({
  minutes,
  update,
  // 可选定制（验收屏复用）：默认值保持计划屏行为不变。
  // 「与计划助手基于纪要调整目标」按钮已退役（2026-10-22 真机反馈轮，人决定：
  // 整理纪要后 Skill SOP 自然引导），故不再接收 sendRequest / showAgent。
  showFollowupStatus = true,
  followupHint = '闭环 = 版本计划已按该条修改，由人标记',
  footNote = '纪要独立保存，认可随归档 PR 评审表达。'
}) {
  const [editing, setEditing] = useState(false)
  const setPoint = (key, index, text) =>
    update({
      [key]: minutes[key].map((point, i) =>
        i === index ? (key === 'consensus' ? text : { ...point, text }) : point
      )
    })
  const removePoint = (key, index) => update({ [key]: minutes[key].filter((_, i) => i !== index) })
  // withStatus=false 供验收屏复用：验收遗留不设闭环状态，条目只有 text。
  const addPoint = (key, withStatus = true) =>
    update({
      [key]: [
        ...minutes[key],
        key === 'consensus' ? '' : { text: '', ...(withStatus ? { closed: false } : {}) }
      ]
    })
  const toggleClosed = (index) =>
    update({
      followups: minutes.followups.map((point, i) =>
        i === index ? { ...point, closed: !point.closed } : point
      )
    })
  return (
    <article className="g3-minutes">
      <div className="g3-minutes-head">
        <span className={`g3-status ${minutes.confirmed ? 'confirmed' : ''}`}>
          {minutes.confirmed ? '已人工确认' : '待人工确认'}
        </span>
        <span className="g3-muted">{minutes.sources}</span>
        <span className="g3-minutes-actions">
          <IconButton
            name={editing ? 'check' : 'edit'}
            label={editing ? '结束编辑纪要' : '编辑纪要'}
            onClick={() => setEditing(!editing)}
          />
        </span>
      </div>
      <div className="g3-minutes-section">
        <strong>共识</strong>
        {editing ? (
          <div className="g3-point-editor">
            {minutes.consensus.map((point, i) => (
              <div className="g3-point-edit-row" key={i}>
                <textarea
                  rows={2}
                  aria-label={`共识第 ${i + 1} 点`}
                  value={point}
                  onChange={(e) => setPoint('consensus', i, e.target.value)}
                />
                <IconButton
                  name="close"
                  label={`删除共识第 ${i + 1} 点`}
                  onClick={() => removePoint('consensus', i)}
                />
              </div>
            ))}
            <button className="g3-add-point" onClick={() => addPoint('consensus')}>
              <Icon name="plus" size={13} /> 添加一点
            </button>
          </div>
        ) : (
          <ul className="g3-points">
            {minutes.consensus.length ? (
              minutes.consensus.map((point, i) => <li key={i}>{point || '待填写'}</li>)
            ) : (
              <li className="g3-muted">无</li>
            )}
          </ul>
        )}
      </div>
      <div className="g3-minutes-section">
        <strong>遗留 {showFollowupStatus && <small>{followupHint}</small>}</strong>
        {editing ? (
          <div className="g3-point-editor">
            {minutes.followups.map((point, i) => (
              <div className="g3-point-edit-row" key={i}>
                <textarea
                  rows={2}
                  aria-label={`遗留第 ${i + 1} 点`}
                  value={point.text}
                  onChange={(e) => setPoint('followups', i, e.target.value)}
                />
                {showFollowupStatus && (
                  <button
                    className={`g3-followup-status ${point.closed ? 'closed' : ''}`}
                    title={followupHint}
                    onClick={() => toggleClosed(i)}
                  >
                    {point.closed ? '已闭环' : '未闭环'}
                  </button>
                )}
                <IconButton
                  name="close"
                  label={`删除遗留第 ${i + 1} 点`}
                  onClick={() => removePoint('followups', i)}
                />
              </div>
            ))}
            <button
              className="g3-add-point"
              onClick={() => addPoint('followups', showFollowupStatus)}
            >
              <Icon name="plus" size={13} /> 添加一点
            </button>
          </div>
        ) : (
          <ul className="g3-points">
            {minutes.followups.length ? (
              minutes.followups.map((point, i) => (
                <li key={i}>
                  {showFollowupStatus && (
                    <button
                      className={`g3-followup-status ${point.closed ? 'closed' : ''}`}
                      title={followupHint}
                      onClick={() => toggleClosed(i)}
                    >
                      {point.closed ? '已闭环' : '未闭环'}
                    </button>
                  )}
                  <span>{point.text || '待填写'}</span>
                </li>
              ))
            ) : (
              <li className="g3-muted">无</li>
            )}
          </ul>
        )}
      </div>
      <div className="g3-minutes-foot">
        <button onClick={() => update({ confirmed: !minutes.confirmed })}>
          {minutes.confirmed ? '已人工确认 · 撤销' : '标记人工确认'}
        </button>
        <span className="g3-muted">{footNote}</span>
      </div>
    </article>
  )
}
// 面板批注卡片：编号 + 对象 + 内容，卡级管理入口——笔形编辑（卡片内行内编辑）
// 与 × 删除。编辑 / 删除只在这里，对象小窗只负责新增，避免 × 语义混淆。
function AnnotationCard({ item, onUpdate, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.text)
  return (
    <div className="g3-annot-card">
      <span className="g3-annot-num">{item.number}</span>
      <div>
        <strong>{item.object}</strong>
        {editing ? (
          <div className="g3-annot-edit">
            <textarea
              rows={2}
              aria-label={`编辑批注 ${item.number}`}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
            />
            <span className="g3-annot-edit-actions">
              <button
                onClick={() => {
                  setDraft(item.text)
                  setEditing(false)
                }}
              >
                取消
              </button>
              <button
                className="primary"
                disabled={!draft.trim()}
                onClick={() => {
                  onUpdate(item.id, draft.trim())
                  setEditing(false)
                }}
              >
                保存
              </button>
            </span>
          </div>
        ) : (
          <p>{item.text}</p>
        )}
      </div>
      <IconButton
        name="edit"
        label={`编辑批注 ${item.number}（${item.object}）`}
        onClick={() => {
          setDraft(item.text)
          setEditing(true)
        }}
      />
      <IconButton
        name="close"
        label={`删除批注 ${item.number}（${item.object}）`}
        onClick={() => onRemove(item.id)}
      />
    </div>
  )
}
// 板面批注窗：右侧紧凑记录面板，布局对齐 Orca 原生批注参考（编号卡片列表、
// 提示行、板面级批注、底部 复制 / 发送）。记录动作在对象就近小窗完成，
// 面板做记录列表与卡片级编辑 / 删除；列表限高内滚动，面板不随批注无限涨。
export function AnnotationPanel({
  open,
  annotations,
  onClose,
  onUpdate,
  onRemove,
  onBoardLevel,
  onSend,
  sendLabel = '发送给计划助手' // 验收屏复用时的可选定制
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) {
      return
    }
    const timer = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(timer)
  }, [copied])
  // 复制走系统剪贴板写入（生产为 Orca 原生 IPC 通道），按钮给「已复制」瞬态反馈，
  // 对齐原生浏览器批注 Copy All 行为；2026-10-22 真机反馈轮修复无反馈问题。
  const copy = async () => {
    const text = annotations.map((item) => `- [${item.object}] ${item.text}`).join('\n')
    try {
      await navigator.clipboard?.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  if (!open) {
    return null
  }
  return (
    <aside className="g3-annot-panel" aria-label="板面批注窗">
      <header>
        <Icon name="annotate-mode" size={14} />
        <strong>板面批注（{annotations.length}）</strong>
        <IconButton name="close" label="关闭板面批注窗" onClick={onClose} />
      </header>
      <div className="g3-annot-list">
        {annotations.length ? (
          annotations.map((item) => (
            <AnnotationCard key={item.id} item={item} onUpdate={onUpdate} onRemove={onRemove} />
          ))
        ) : (
          <p className="g3-muted g3-annot-empty">暂无批注</p>
        )}
      </div>
      <p className="g3-annot-hint">批注模式中，点击板面元素即可添加批注</p>
      <button className="g3-annot-board" onClick={onBoardLevel}>
        <Icon name="plus" size={13} /> 添加板面级批注
      </button>
      <footer>
        <button disabled={!annotations.length} onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? '已复制' : '复制'}
        </button>
        <button
          className="primary"
          disabled={!annotations.length}
          onClick={(e) => onSend(e.currentTarget.getBoundingClientRect())}
        >
          <Icon name="send" size={13} /> {sendLabel}
        </button>
      </footer>
    </aside>
  )
}
// 对象批注小窗：贴着被批注元素弹出，交互对齐 Orca 元素批注弹窗
// （对象名标题、textarea、取消 / 添加）。小窗只负责新增：右上角 × 仅关闭小窗、
// 不动已记录批注（第七轮修正 × 误删）；已有批注的编辑 / 删除在面板卡片上。
// BW 差异：小窗不带意图分段与发送行——发送统一走面板底部经原生发送弹窗。
export function AnnotationPopover({ target, rect, onSave, onCancel }) {
  const [draft, setDraft] = useState('')
  const POP_W = 320
  const POP_H = 200
  const left = Math.max(16, Math.min(rect.left, window.innerWidth - POP_W - 16))
  const below = rect.bottom + 8
  const top =
    below + POP_H > window.innerHeight - 16
      ? Math.max(16, Math.min(rect.top - POP_H - 8, window.innerHeight - POP_H - 16))
      : below
  const save = () => {
    if (draft.trim()) {
      onSave(draft.trim())
    }
  }
  return (
    <div
      className="g3-annot-pop"
      role="dialog"
      aria-label={`对象批注（${target}）`}
      style={{ left, top }}
    >
      <header>
        <Icon name="annotate-mode" size={13} />
        <strong>{target}</strong>
        <IconButton name="close" label="关闭批注小窗" onClick={onCancel} />
      </header>
      <textarea
        rows={3}
        aria-label="批注内容"
        placeholder="在此添加批注..."
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            save()
          }
        }}
      />
      <footer>
        <button onClick={onCancel}>取消</button>
        <button className="primary" disabled={!draft.trim()} onClick={save}>
          <Icon name="plus" size={13} /> 添加
        </button>
      </footer>
    </div>
  )
}
