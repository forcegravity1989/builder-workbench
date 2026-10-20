const { useState } = window.BWPrototypeDependencies
import { React, Button, Dialog, Field, Icon } from './g3-components.jsx'
import { snapshot, advice, prior, reviewState } from './g3-model.js'

export function PlanningDialogs(props) {
  const {
    modal,
    close,
    goals,
    tasks,
    review,
    revisions,
    risk,
    archive,
    submitArchive,
    update,
    converse,
    locate,
    openTask,
    startTask,
    setReview,
    setNotice,
    setGoals,
    setRevisions,
    setExpanded,
    setStarted,
    started,
    setSourceError,
    setArchiveDirty
  } = props
  const [draft, setDraft] = useState('')
  const [meetingId, setMeetingId] = useState('')
  const [candidateGoals, setCandidateGoals] = useState([])
  const [response, setResponse] = useState(modal.item?.response || '')
  const [evidence, setEvidence] = useState(modal.item?.evidence || '')
  const [decision, setDecision] = useState(
    modal.item?.status === 'deferred' ? 'deferred' : 'addressed'
  )
  const [error, setError] = useState('')
  const [candidates, setCandidates] = useState([])
  const [selection, setSelection] = useState([])
  const [meetingMode, setMeetingMode] = useState('paste')
  const [metric, setMetric] = useState(
    modal.goal?.measureFields || { name: '', baseline: '', target: '', source: '' }
  )
  const [newGoal, setNewGoal] = useState({ title: '', deliverable: '', acceptance: '' })
  const current = goals.find((g) => g.goalId === modal.goal?.goalId) || modal.goal
  const suggested = advice[current?.goalId]
  const titles = {
    coach: '把目标说得更清楚',
    measure: '为目标补充数值衡量',
    task: 'Issue 详情',
    start: '进入原生工作区',
    decompose: '从交付内容拆解 Issue',
    coverage: '交付内容与任务覆盖',
    respond: '记录这条要求如何落实',
    meeting: '带入会议要求',
    archive: '归档 PR · 再次审核',
    sources: '设计说明与依据',
    prior: '上版进展的依据',
    minutes: '版本计划纪要',
    newgoal: '添加版本目标',
    tasks: '本版任务'
  }
  const chat = (text) => {
    converse(text)
    close()
  }
  const finished = (text) => {
    setNotice(text)
    close()
  }
  const changedGoals = goals.filter((g) => revisions[g.goalId] > 0)
  const unresolved = review.filter((r) => reviewState(r, revisions) !== 'addressed')
  return (
    <Dialog
      title={titles[modal.type]}
      close={close}
      wide={['coach', 'archive', 'sources', 'coverage', 'minutes'].includes(modal.type)}
    >
      <div className="g3-dialog-body">
        {modal.type === 'coach' && (
          <>
            <p className="g3-dialog-lead">
              {current.goalId} · 建议不是新的承诺，由你选择是否采纳。
            </p>
            <div className="g3-comparison">
              <section>
                <span className="g3-eyebrow">当前表达</span>
                <h3>{current.title}</h3>
                <p>{current.deliverable}</p>
                <strong>验收约定</strong>
                <p>{current.acceptance}</p>
              </section>
              <section>
                <span className="g3-eyebrow">建议表达 · 待你确认</span>
                <h3>{suggested?.title || current.title}</h3>
                <p>{suggested?.deliverable || current.deliverable}</p>
                <strong>如何判断达成</strong>
                <p>{suggested?.acceptance || '补充可操作的场景、动作和可观察结果。'}</p>
              </section>
            </div>
            <div className="g3-design-note">
              <strong>为什么这样改</strong>
              <p>
                先说明谁获得什么结果，再把交付内容和验收方法连起来。可验证的操作结果也能衡量目标，不要求每项目标都编一个百分比。
              </p>
              <small>{suggested?.source || '依据当前目标内容继续讨论。'}</small>
            </div>
            <div className="g3-dialog-actions">
              <Button
                onClick={() =>
                  chat(
                    `请帮我推敲 ${current.goalId} 的用户结果、交付内容与验收方法。保留版本范围，缺少依据的数值不要编造。`
                  )
                }
              >
                继续讨论
              </Button>
              {suggested && (
                <Button
                  primary
                  onClick={() => {
                    update(current.goalId, {
                      title: suggested.title,
                      deliverable: suggested.deliverable,
                      acceptance: suggested.acceptance
                    })
                    finished('已把建议应用到演示草稿，可在目标中继续修改')
                  }}
                >
                  采纳到草稿
                </Button>
              )}
            </div>
          </>
        )}
        {modal.type === 'measure' && (
          <>
            <p>只有需要数值承诺时才添加。没有读数就保留未知，不自动填 0。</p>
            {Object.entries({
              name: '指标名称',
              baseline: '当前基线',
              target: '本版目标',
              source: '口径、采集来源与时间窗口'
            }).map(([key, label]) => (
              <label className="g3-stack-field" key={key}>
                {label}
                <input
                  value={metric[key]}
                  placeholder={
                    key === 'baseline' ? '未知' : key === 'source' ? '数据从哪里来，谁能核对' : ''
                  }
                  onChange={(e) => setMetric({ ...metric, [key]: e.target.value })}
                />
              </label>
            ))}
            <div className="g3-dialog-actions">
              <Button onClick={close}>返回</Button>
              <Button
                primary
                onClick={() => {
                  if (!metric.name.trim() || !metric.target.trim()) {
                    setError('先写清指标名称与本版目标。')
                    return
                  }
                  update(current.goalId, {
                    measureFields: metric,
                    measure: `${metric.name}：${metric.baseline || '未知'} → ${metric.target}；依据：${metric.source || '待补充'}`
                  })
                  finished('数值衡量已作为待核对草稿保留')
                }}
              >
                加入目标草稿
              </Button>
            </div>
          </>
        )}
        {modal.type === 'task' && (
          <>
            <div className="g3-dialog-lead">
              v0.7 / {modal.task.goalId} / #{modal.task.number}
            </div>
            <h3>{modal.task.title}</h3>
            <p>
              远端状态：{modal.task.state === 'CLOSED' ? '已关闭' : '开放'} · 快照时间{' '}
              {snapshot.capturedAt.slice(0, 10)}
            </p>
            <p>此处是原生任务详情的衔接示意，正文编辑与远端保存沿用 Orca。</p>
            <a href={modal.task.url} target="_blank" rel="noreferrer">
              打开真实 Issue 正文 ↗
            </a>
            <div className="g3-dialog-actions">
              <Button onClick={close}>返回计划</Button>
              <Button primary onClick={() => startTask(modal.task)}>
                {started.includes(modal.task.number) ? '继续工作' : '开工'}
              </Button>
            </div>
          </>
        )}
        {modal.type === 'start' && (
          <>
            <div className="g3-dialog-lead">Builder Workbench / v0.7 / {modal.task.goalId}</div>
            <h3>
              #{modal.task.number} {modal.task.title?.replace(/^【.*?】/, '')}
            </h3>
            <dl className="g3-facts">
              <dt>将进入</dt>
              <dd>这条 Issue 的原生工作区</dd>
              <dt>版本归属</dt>
              <dd>v0.7 · {modal.task.goalId}</dd>
              <dt>已有工作区</dt>
              <dd>
                {started.includes(modal.task.number)
                  ? '本次演示已打开，继续复用'
                  : '由原生入口查询；已有则打开，否则按其创建流程处理'}
              </dd>
            </dl>
            <p className="g3-design-note">
              原型仅演示衔接。G2 决定工作树定位、父子关系与跨版本复用；计划屏提供完整 Issue
              引用和返回位置。
            </p>
            <div className="g3-dialog-actions">
              <Button onClick={close}>返回计划</Button>
              <Button
                primary
                onClick={() => {
                  setStarted((v) => [...new Set([...v, modal.task.number])])
                  chat(
                    `继续 v0.7 / ${modal.task.goalId} / #${modal.task.number} 的原生任务工作区。返回计划时恢复这一目标与阅读位置。`
                  )
                }}
              >
                {started.includes(modal.task.number) ? '模拟继续已有工作区' : '模拟打开工作区'}
              </Button>
            </div>
          </>
        )}
        {modal.type === 'decompose' && (
          <>
            <div className="g3-dialog-lead">
              {current.goalId} · {current.title}
            </div>
            <div className="g3-design-note">
              <strong>按交付结果拆，不按页面字段拆</strong>
              <p>{current.deliverable}</p>
            </div>
            <h3>已有 Issue，先查重与复用</h3>
            {tasks
              .filter((t) => t.goalId === current.goalId)
              .map((t) => (
                <button className="g3-picker-row" key={t.number} onClick={() => openTask(t)}>
                  #{t.number} {t.title?.replace(/^【.*?】/, '')} <Icon name="arrow" />
                </button>
              ))}
            <Field
              label="还有什么交付没有任务承接"
              value={draft}
              onChange={setDraft}
              placeholder="写清具体结果、范围和验法；交给会话核对后创建或关联真实 Issue"
            />
            <div className="g3-dialog-actions">
              <Button onClick={close}>返回</Button>
              <Button
                primary
                onClick={() =>
                  chat(
                    `围绕 ${current.goalId}，读取已有 Issue，核对交付与验收覆盖。${draft ? `尚需承接：${draft}` : '先提出缺口，不重复提单。'} 创建或关联后读回真实编号，未经我确认不扩大范围。`
                  )
                }
              >
                在会话中拆解
              </Button>
            </div>
          </>
        )}
        {modal.type === 'tasks' && (
          <>
            <p>
              仅展示当前计划关联的 {tasks.length} 条 Issue。列表、详情与开工复用 G2 的原生任务入口。
            </p>
            {tasks.map((t) => (
              <div className="g3-picker-row" key={t.number}>
                <span className="g3-id">{t.goalId}</span>
                <button onClick={() => openTask(t)}>
                  #{t.number} {t.title?.replace(/^【.*?】/, '')}
                </button>
                <button className="g3-text-action" onClick={() => startTask(t)}>
                  开工 ↗
                </button>
              </div>
            ))}
          </>
        )}
        {modal.type === 'coverage' && (
          <>
            <p>关联数量只说明任务归属，不代表目标已经被完整覆盖。</p>
            <div className="g3-coverage">
              {goals.map((g) => (
                <div key={g.goalId}>
                  <strong>
                    {g.goalId} · {g.title}
                  </strong>
                  <p>{g.deliverable || '交付内容待明确'}</p>
                  <div>
                    {tasks
                      .filter((t) => t.goalId === g.goalId)
                      .map((t) => (
                        <button key={t.number} onClick={() => openTask(t)}>
                          #{t.number}
                        </button>
                      ))}
                  </div>
                  <button
                    className="g3-text-action"
                    onClick={() => {
                      close()
                      locate(g.goalId)
                    }}
                  >
                    回到目标核对 ↗
                  </button>
                </div>
              ))}
            </div>
            <div className="g3-dialog-actions">
              <Button
                primary
                onClick={() =>
                  chat(
                    '逐目标对照 v0.7 的交付内容、验收条件与真实 Issue。指出尚无任务承接的交付、重复任务及过大的任务；先给建议，不自动建单。'
                  )
                }
              >
                让模型逐项核对
              </Button>
            </div>
          </>
        )}
        {modal.type === 'respond' && (
          <>
            <blockquote>{modal.item.text}</blockquote>
            <p className="g3-meta">
              影响：{modal.item.goal} · {modal.item.target}
            </p>
            <label className="g3-stack-field">
              本次处理
              <select value={decision} onChange={(e) => setDecision(e.target.value)}>
                <option value="addressed">已修改，回应 Leader</option>
                <option value="deferred">待 Leader 决定 / 本版不采纳</option>
              </select>
            </label>
            <Field
              label="如何落实 / 为什么暂不采纳"
              value={response}
              onChange={setResponse}
              placeholder="具体说改了什么，或还有哪个取舍需要 Leader 决定"
            />
            <Field
              label="修改依据"
              value={evidence}
              onChange={setEvidence}
              placeholder="例如 G3 验收标准第 3 条、Issue #385 正文或相关提交"
            />
            <p className="g3-footnote">
              回应只表示 Builder 的处理说明。后续修改目标会提示重新核对，Leader 的最终审批在 PR
              中完成。
            </p>
            <div className="g3-dialog-actions">
              <Button
                onClick={() => {
                  close()
                  locate(modal.item.goal)
                }}
              >
                先去修改目标
              </Button>
              <Button
                primary
                onClick={() => {
                  if (!response.trim() || !evidence.trim()) {
                    setError('写清处理说明与修改依据，便于 Leader 核对。')
                    return
                  }
                  setReview((items) =>
                    items.map((item) =>
                      item.id === modal.item.id
                        ? {
                            ...item,
                            response,
                            evidence,
                            status: decision,
                            revision: revisions[item.goal]
                          }
                        : item
                    )
                  )
                  setArchiveDirty(archive !== 'none')
                  finished('已记录 Builder 回应，仍需 Leader 再次审核')
                }}
              >
                保存回应
              </Button>
            </div>
          </>
        )}
        {modal.type === 'meeting' && (
          <>
            <div className="g3-mode-tabs">
              <button
                aria-pressed={meetingMode === 'paste'}
                onClick={() => setMeetingMode('paste')}
              >
                粘贴纪要 / 人工补记
              </button>
              <button aria-pressed={meetingMode === 'id'} onClick={() => setMeetingMode('id')}>
                会议 ID
              </button>
            </div>
            {meetingMode === 'id' ? (
              <>
                <label className="g3-stack-field">
                  会议 ID
                  <input
                    value={meetingId}
                    onChange={(e) => setMeetingId(e.target.value)}
                    placeholder="输入 eMeeting 会议 ID"
                  />
                </label>
                <p className="g3-design-note">
                  先经已有会话能力检查登录与读取条件，再提炼本项目议题。转写中的不确定内容必须让人核对。
                </p>
                <Button
                  onClick={() =>
                    setError(
                      '演示：尚未连接会议服务。可以在原生会话中处理登录，或切换到粘贴纪要；不会生成空的成功结果。'
                    )
                  }
                >
                  读取会议（演示）
                </Button>
              </>
            ) : (
              <>
                <Field
                  label="会议要求"
                  value={draft}
                  onChange={setDraft}
                  placeholder="逐行粘贴需要落实的要求，不必重复整份纪要"
                />
                <Button
                  onClick={() => {
                    if (!draft.trim()) {
                      setError('先粘贴会议要求。')
                      return
                    }
                    const lines = draft
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean)
                    setCandidates(lines.map((text) => ({ id: crypto.randomUUID(), text })))
                    setCandidateGoals(lines.map(() => ''))
                    setSelection(lines.map((_, i) => i))
                    setError('')
                  }}
                >
                  预览待确认条目
                </Button>
              </>
            )}
            {candidates.length > 0 && (
              <div className="g3-candidates">
                <h3>核对后再带入</h3>
                <p>原文按行展示，未作模型推断；含义、对象和范围由你确认。</p>
                {candidates.map((line, i) => (
                  <div className="g3-candidate" key={line.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selection.includes(i)}
                        onChange={(e) =>
                          setSelection((s) =>
                            e.target.checked ? [...s, i] : s.filter((n) => n !== i)
                          )
                        }
                      />
                      <span>{line.text}</span>
                    </label>
                    <label>
                      关联目标
                      <select
                        aria-label={`第 ${i + 1} 条要求的目标`}
                        value={candidateGoals[i]}
                        onChange={(e) =>
                          setCandidateGoals((ids) =>
                            ids.map((id, n) => (n === i ? e.target.value : id))
                          )
                        }
                      >
                        <option value="">请确认目标</option>
                        {goals.map((g) => (
                          <option key={g.goalId} value={g.goalId}>
                            {g.goalId} · {g.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))}
                <Button
                  primary
                  disabled={!selection.length}
                  onClick={() => {
                    if (selection.some((n) => !candidateGoals[n])) {
                      setError('请为每条选中的要求确认关联目标。')
                      return
                    }
                    setReview((items) => [
                      ...items,
                      ...selection.map((n, i) => ({
                        id: `R${items.length + i + 1}`,
                        goal: candidateGoals[n],
                        text: candidates[n].text,
                        source: '人工确认的会议摘录（演示）',
                        target: '目标 / Issue',
                        status: 'pending',
                        response: '',
                        evidence: '',
                        revision: null
                      }))
                    ])
                    setArchiveDirty(archive !== 'none')
                    finished('已带入经你确认的要求；目标和 Issue 尚未自动改变')
                  }}
                >
                  确认带入 {selection.length} 条
                </Button>
              </div>
            )}
          </>
        )}
        {modal.type === 'archive' && (
          <>
            <p className="g3-dialog-lead">
              v0.7 版本计划 · {goals.length} 个目标 / {tasks.length} 个关联 Issue
            </p>
            <p className="g3-design-note">
              {modal.frozen
                ? '以下为已合入的演示快照；后续草稿不会改变此内容。'
                : '以下为当前草稿，尚未表示 Leader 已批准或已合入。'}
            </p>
            <div className="g3-review-warning">
              {modal.frozen
                ? '此处保留提交时的计划与回应；最终处理结论以该 PR 的人工评审为准。'
                : unresolved.length
                  ? `${unresolved.length} 条评审要求尚待核对。可以继续修改，或带着明确问题提交 Draft PR。`
                  : 'Builder 已逐条回应；Leader 仍需审核本次修改。'}
            </div>
            <h3>本次变更摘要</h3>
            {changedGoals.length ? (
              changedGoals.map((g) => (
                <div className="g3-change-row" key={g.goalId}>
                  <strong>
                    {g.goalId} · {g.title}
                  </strong>
                  <p>目标与交付约定已修改，PR 展示相对仓库基线的实际差异。</p>
                </div>
              ))
            ) : (
              <p>尚未修改原始目标。评审回应与关联变化也应进入归档材料。</p>
            )}
            <h3>约束与风险</h3>
            <p className="g3-prewrap">{risk || '尚未填写，由 Builder 核对。'}</p>
            <details className="g3-archive-detail">
              <summary>核对完整目标与任务（{goals.length} 个目标）</summary>
              {goals.map((g) => (
                <section className="g3-change-row" key={g.goalId}>
                  <h3>
                    {g.goalId} · {g.title}
                  </h3>
                  <dl className="g3-read-fields">
                    <dt>交付什么</dt>
                    <dd>{g.deliverable || '待明确'}</dd>
                    <dt>如何验收</dt>
                    <dd>{g.acceptance || '待明确'}</dd>
                    <dt>衡量方式</dt>
                    <dd>{g.measure || '未约定数值指标'}</dd>
                    <dt>负责人 / 计划完成</dt>
                    <dd>
                      {g.owner || '待明确'} / {g.deadline || '未填写'}
                    </dd>
                    <dt>关联 Issue</dt>
                    <dd>
                      {tasks
                        .filter((t) => t.goalId === g.goalId)
                        .map((t) => `#${t.number} ${t.title}`)
                        .join('；') || '未关联'}
                    </dd>
                  </dl>
                </section>
              ))}
            </details>
            <h3>随计划归档的评审回应</h3>
            {review.map((r) => (
              <div className="g3-change-row" key={r.id}>
                <strong>
                  {r.id} · {r.text}
                </strong>
                <p>
                  {r.response || '尚未回应'}
                  {r.evidence ? ` · 依据：${r.evidence}` : ''}
                </p>
              </div>
            ))}
            <div className="g3-design-note">
              <strong>Leader 在 PR 再次审核</strong>
              <p>
                提交内容、评审讨论与批准沿用 GitHub / CodeHub。要求修改时更新同一个
                PR；只有实际合入后才显示归档成功。Git 不保存全部原生会话历史。
              </p>
            </div>
            <div className="g3-dialog-actions">
              <Button onClick={close}>返回继续修改</Button>
              {!modal.frozen && (
                <Button
                  primary
                  onClick={() => {
                    submitArchive()
                    finished('演示 PR 已递交，等待 Leader 再审；没有创建真实 PR')
                  }}
                >
                  {archive === 'merged'
                    ? '模拟提交后续归档 PR'
                    : archive === 'none'
                      ? '模拟递交归档 PR'
                      : '模拟更新同一个 PR'}
                </Button>
              )}
            </div>
          </>
        )}
        {modal.type === 'prior' && (
          <>
            <p>依据仓内 v0.6 验收材料的内容摘录，用于阅读布局。这里不重新判断目标达成。</p>
            {prior.map(([id, title, text, follow]) => (
              <div className="g3-change-row" key={id}>
                <h3>
                  {id} · {title}
                </h3>
                <p>{text}</p>
                <small>{follow}</small>
              </div>
            ))}
            <a href="../../../.bw/planning/v0.6/acceptance.json" target="_blank" rel="noreferrer">
              读取原始验收材料 ↗
            </a>
            <div className="g3-dialog-actions">
              <Button
                onClick={() => {
                  setSourceError(true)
                  close()
                }}
              >
                体验来源读取失败
              </Button>
            </div>
          </>
        )}
        {modal.type === 'minutes' && (
          <>
            <p>按当前演示草稿生成；不把预览或复制当成评审通过。</p>
            <pre className="g3-minutes">{`本周目标\n${goals.map((g) => `${g.goalId} ${g.title}`).join('\n')}\n\n周五交付件\n${goals.map((g) => `${g.goalId} ${g.deliverable || '待明确'}`).join('\n')}\n\n数字指标变化\n${goals.map((g) => `${g.goalId} ${g.measure || '未约定数值指标；以可验证的交付条件核对'}`).join('\n')}`}</pre>
          </>
        )}
        {modal.type === 'newgoal' && (
          <>
            <Field
              label="希望谁获得什么结果"
              value={newGoal.title}
              onChange={(v) => setNewGoal({ ...newGoal, title: v })}
              placeholder="先写一句结果，再逐步完善"
            />
            <Field
              label="本版交付什么"
              value={newGoal.deliverable}
              onChange={(v) => setNewGoal({ ...newGoal, deliverable: v })}
            />
            <Field
              label="怎样判断达成"
              value={newGoal.acceptance}
              onChange={(v) => setNewGoal({ ...newGoal, acceptance: v })}
            />
            <div className="g3-dialog-actions">
              <Button
                primary
                onClick={() => {
                  if (!newGoal.title.trim()) {
                    setError('先写一句目标，其他内容可以继续讨论。')
                    return
                  }
                  const id = `G${Math.max(...goals.map((g) => Number(g.goalId.slice(1)))) + 1}`
                  setGoals((items) => [...items, { ...newGoal, goalId: id, metricTargets: [] }])
                  setRevisions((r) => ({ ...r, [id]: 1 }))
                  setExpanded((ids) => [...ids, id])
                  setArchiveDirty(archive !== 'none')
                  finished('已添加演示目标，可继续拆解与评审')
                }}
              >
                加入草稿
              </Button>
            </div>
          </>
        )}
        {modal.type === 'sources' && (
          <>
            <h3>本次设计在解决什么</h3>
            <p>
              让 Builder 把版本目标写成清楚、可衡量的承诺，并能把评审要求落实到具体修改，最后让
              Leader 在归档 PR 中再次审核。
            </p>
            <h3>真实材料与演示状态</h3>
            <p>
              目标和计划内 10 条任务来自 v0.7 @ {snapshot.sourceCommit.slice(0, 8)}；Issue
              状态快照读取于 {snapshot.capturedAt}。真实{' '}
              <a href={snapshot.archive.url} target="_blank" rel="noreferrer">
                PR #386
              </a>{' '}
              已合入。评审条目是根据 #384 / #385 / #374 整理的示例，优化建议、工作区打开、回应、PR
              状态均为内存演示，不改变远端。
            </p>
            <h3>与 G2 的分工</h3>
            <p>
              G3 负责目标质量、计划内容、任务关联与评审落实。G2
              负责版本入口、工作区归属及原生任务列表/详情/开工。传递项目、版本、目标、完整 Issue
              引用与返回位置；同 Issue 跨版本、父树与自动化绑定沿 G2 确认的契约处理。
            </p>
            <a
              href="http://127.0.0.1:53519/docs/05-features/version-planning/version-workspace-journey.html#storage"
              target="_blank"
              rel="noreferrer"
            >
              阅读用户提供的 G2 设计 ↗
            </a>
            <h3>业界启发</h3>
            <ul>
              <li>
                <a
                  href="https://www.atlassian.com/team-playbook/plays/goals-signals-measures"
                  target="_blank"
                  rel="noreferrer"
                >
                  Atlassian：Goals, Signals, Measures
                </a>{' '}
                — 让目标与可观察结果联系起来。
              </li>
              <li>
                <a
                  href="https://linear.app/docs/project-milestones"
                  target="_blank"
                  rel="noreferrer"
                >
                  Linear：Project milestones
                </a>{' '}
                — 目标附近可追到 Issue，任务进度与目标达成分开。
              </li>
              <li>
                <a
                  href="https://basecamp.com/shapeup/1.5-chapter-06"
                  target="_blank"
                  rel="noreferrer"
                >
                  Shape Up：Write the Pitch
                </a>{' '}
                — 评审时看清问题、范围与边界。
              </li>
              <li>
                <a
                  href="https://docs.github.com/en/pull-requests/concepts/resolving-reviews"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub：Resolving reviews
                </a>{' '}
                — 回应、修改与再次审核形成连续过程。
              </li>
            </ul>
            <h3>设计与证据边界</h3>
            <p>
              上面是基于一手资料的设计取舍，未照搬第三方界面。原型沿用 BW
              设计系统，不改生产代码、材料协议、G2 侧栏或验收屏。真实模型、会议读取、Git/Issue/PR
              写入、工作树创建与重启均未接线。
            </p>
            <a href="spec.md">版本计划规格</a>
          </>
        )}
        {error && (
          <p role="alert" className="g3-error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
