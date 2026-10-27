import planSnapshot from '../../../../.bw/planning/v0.8/data.json'
import { IconAction } from './g2-icon-action.jsx'
import {
  Dialog,
  Feature,
  SectionTitle,
  SourcePanel,
  ReferencePanel
} from './overview-components.jsx'
import {
  repository,
  revision,
  baseline,
  scenarios,
  features,
  smallTasks,
  featureForScenario
} from './overview-data.js'
const {
  // Used by the shared JSX build factory.
  // eslint-disable-next-line no-unused-vars
  React,
  useState,
  useEffect,
  createRoot,
  LayoutDashboard,
  CalendarRange,
  ClipboardCheck,
  ListTodo,
  BookOpen,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Info,
  Pencil
} = window.BWPrototypeDependencies
function App() {
  const [scenario, setScenario] = useState(() => {
    const scene = new URLSearchParams(location.search).get('scene')
    return scenarios.some((s) => s.id === scene) ? scene : 'design'
  })
  const [dialog, setDialog] = useState(null)
  const [filter, setFilter] = useState('全部')
  const [sample, setSample] = useState(features)
  const [editing, setEditing] = useState('')
  const [editError, setEditError] = useState('')
  const [dark, setDark] = useState(false)
  const selected = scenarios.find((s) => s.id === scenario)
  const history = scenario === 'history',
    offline = scenario === 'offline'
  const displayed = (history ? features : sample).map((f) => featureForScenario(f, scenario))
  const planG2 = planSnapshot.goals.find((g) => g.goalId === 'G2')
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])
  function native(kind, title = kind) {
    setDialog({ kind: 'native', title, route: kind })
  }
  function openArtifact(feature, row) {
    setDialog({ kind: 'artifact', title: row[1], feature, row })
  }
  function openSession(feature) {
    setDialog({ kind: 'session', title: `工作会话 · #${feature.id}`, feature })
  }
  function applyEdits() {
    try {
      const value = JSON.parse(editing)
      if (
        !Array.isArray(value) ||
        value.length !== 2 ||
        value.some(
          (item, i) =>
            item.id !== features[i].id ||
            ['title', 'owner', 'purpose', 'scope', 'later'].some(
              (k) => typeof item[k] !== 'string' || !item[k].trim()
            )
        )
      ) {
        throw new Error(
          '保留两个需求的 id，并为名称、负责人、整体目标、本版承担和后续范围填写文字。'
        )
      }
      setSample(
        value.map((item, i) => ({
          ...features[i],
          ...Object.fromEntries(
            ['title', 'owner', 'purpose', 'scope', 'later'].map((k) => [k, item[k]])
          )
        }))
      )
      setDialog(null)
      setEditError('')
    } catch (error) {
      setEditError(error.message)
    }
  }
  const actualTasks = planSnapshot.tasks.filter((t) => t.goalId === 'G2')
  return (
    <div className="ov-app">
      <div className="review-bar">
        <strong>#334 · 高保真草案</strong>
        <span>进展与执行均为情景模拟</span>
        <a href="version-overview-journey.html">审阅旅程 ↗</a>
        <select
          aria-label="评审情景"
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="ov-tools">
          <IconAction
            icon={Pencil}
            label="编辑演示内容"
            disabled={history}
            onClick={() => {
              setEditing(
                JSON.stringify(
                  sample.map(({ id, title, owner, purpose, scope, later }) => ({
                    id,
                    title,
                    owner,
                    purpose,
                    scope,
                    later
                  })),
                  null,
                  2
                )
              )
              setDialog({ kind: 'edit', title: '编辑演示内容' })
            }}
          />
          <IconAction
            icon={Info}
            label="数据来源与实现边界"
            onClick={() => setDialog({ kind: 'source', title: '数据来源与实现边界' })}
          />
          <IconAction
            icon={BookOpen}
            label="设计参考"
            onClick={() => setDialog({ kind: 'references', title: '设计参考' })}
          />
          <button aria-label="切换明暗主题" onClick={() => setDark(!dark)}>
            {dark ? '浅色' : '深色'}
          </button>
        </div>
      </div>
      <div className="ov-shell">
        <aside className="ov-sidebar" aria-label="项目与版本导航">
          <div className="ov-brand">
            <LayoutDashboard size={22} />
            <span>Workbench</span>
          </div>
          <div className="ov-nav-group">
            <ChevronDown size={13} />
            <strong>Builder Workbench</strong>
          </div>
          <button
            className="nav-row"
            onClick={() => setDialog({ kind: 'monthly', title: '项目总览 · 月度选择' })}
          >
            <LayoutDashboard size={15} />
            项目总览
          </button>
          <button className="nav-row" onClick={() => native('知识库')}>
            <BookOpen size={15} />
            知识库
          </button>
          <hr />
          <div className="ov-nav-group">
            <ChevronDown size={13} />
            <strong>{selected.version}</strong>
            <span>{history ? '回看' : '在制'}</span>
          </div>
          <div className="ov-nav-sub">
            <button
              className="nav-row selected"
              aria-current="page"
              onClick={() =>
                document.querySelector('.ov-main').scrollTo({ top: 0, behavior: 'smooth' })
              }
            >
              <LayoutDashboard size={15} />
              总览
            </button>
            <button className="nav-row" onClick={() => native('计划')}>
              <CalendarRange size={15} />
              计划
            </button>
            <button className="nav-row" onClick={() => native('任务')}>
              <ListTodo size={15} />
              任务
            </button>
            <div className="ov-nav-sub">
              <button className="nav-row" onClick={() => native('目标任务', '任务 · G2')}>
                <ChevronRight size={13} />
                G2 · 两个总览
              </button>
            </div>
            <button className="nav-row" onClick={() => native('验收')}>
              <ClipboardCheck size={15} />
              验收
            </button>
            <button className="ov-worktree" onClick={() => openSession(displayed[0])}>
              <span>
                <GitBranch size={14} />
                #334 版本总览重设计
              </span>
              <small>Local Windows · 设计讨论</small>
            </button>
            <button className="ov-worktree" onClick={() => openSession(displayed[1])}>
              <span>
                <GitBranch size={14} />
                #440 项目里程碑规划
              </span>
              <small>配对主机 · 试用反馈（演示）</small>
            </button>
          </div>
          <button className="nav-row" onClick={() => setScenario(history ? 'repair' : 'history')}>
            <ChevronRight size={14} />
            {history ? '后续 B · v0.9（演示）' : '先行 B · 历史回看（演示）'}
          </button>
          <hr />
          <div className="ov-nav-group">项目工作区</div>
          <button className="ov-worktree" onClick={() => native('项目工作区')}>
            <span>
              <GitBranch size={14} />
              项目约定
            </span>
            <small>Local Windows · bw/project</small>
          </button>
          <button className="nav-row" onClick={() => native('其他项目')}>
            <ChevronRight size={14} />
            其他项目
          </button>
        </aside>
        <main className="ov-main">
          <div className="ov-top">
            <span>Builder Workbench</span>
            <ChevronRight size={12} />
            <span>{selected.version}</span>
            <ChevronRight size={12} />
            <span>总览</span>
            <span>原型 · {revision}</span>
          </div>
          <div className="ov-content">
            <div className="ov-heading">
              <h1>{selected.version} 版本总览</h1>
              <span className="ov-chip">{history ? '人工验收记录 · 演示' : '本版验收未确认'}</span>
              <div className="ov-tools">
                <IconAction
                  icon={CalendarRange}
                  label="进入本版计划"
                  onClick={() => native('计划')}
                />
                <IconAction icon={ListTodo} label="进入本版任务" onClick={() => native('任务')} />
                <IconAction
                  icon={ClipboardCheck}
                  label="进入本版验收"
                  onClick={() => native('验收')}
                />
              </div>
            </div>
            <p className="ov-subtitle">
              {history
                ? '先行 MVP 的版本交付 · 固定历史情景'
                : scenario === 'repair'
                  ? '承接先行 MVP 的反馈，修理并完善两个总览'
                  : planG2.title}
            </p>
            <div className="ov-meta">
              <span>负责人 · {history ? '演示 Builder' : planG2.owner}</span>
              <span>{history ? '历史材料 · 固定演示修订 hist-01' : '计划确认 · 2026-10-27'}</span>
              <span>{history ? '验收时点 · 情景模拟' : '交付时间 · 正式计划未记录'}</span>
              <button onClick={() => setDialog({ kind: 'commitment', title: '本版正式承诺' })}>
                {history ? '当时承诺与验收来源' : `计划来源 ${baseline.slice(0, 8)}`}
              </button>
              <button onClick={() => setDialog({ kind: 'monthly', title: '项目总览 · 月度选择' })}>
                月度安排 ↗
              </button>
            </div>
            {scenario === 'repair' && (
              <div className="ov-notice">
                后续 B 为设计情景，范围尚未写入正式计划。v0.8 原承诺只作历史来源。
              </div>
            )}
            {offline && (
              <div className="ov-notice" role="status">
                最新成果与所属宿主暂不可读。以下保留正式计划快照；成果、会话和待审数量均为未知。
                <button className="ov-link" onClick={() => setScenario('design')}>
                  {' '}
                  模拟恢复来源
                </button>
              </div>
            )}
            {history && (
              <div className="ov-history">
                <strong>先行 B · 一次正式验收（演示）</strong>
                <p>
                  演示当时承诺：组内可试用的两个总览 MVP。演示人工结论：本版 MVP
                  范围达成；跨宿主能力不在本版验收范围。
                </p>
                <p>
                  本区全部读取固定演示归档 hist-01，不是 v0.8
                  真实验收，也不使用当前分支草案。后续编辑不改变此情景。
                </p>
                <button className="ov-link" onClick={() => native('历史验收')}>
                  查看当时的承诺与验收依据 ↗
                </button>
              </div>
            )}
            <div className="ov-intro">
              <div>
                <span className="ov-label">本版承诺</span>
                <p>
                  {history
                    ? '当时承诺（演示）：单项目、本机只读成果与人工排期，供两位 Builder 试用。'
                    : scenario === 'repair'
                      ? '修理试用反馈，补跨版回看（候选）。'
                      : '项目总览补里程碑规划；版本总览呈现大需求过程与成果、小需求和 bug 处理结果。'}
                </p>
                <button
                  className="ov-link ov-note"
                  onClick={() => setDialog({ kind: 'commitment', title: '正式承诺与本轮候选范围' })}
                >
                  {history ? '查看演示归档范围与任务 ↗' : '查看正式范围与关联任务 ↗'}
                </button>
              </div>
              <div>
                <span className="ov-label">{history ? '当时交付' : '目前交付'}</span>
                <p>
                  {history
                    ? '当时两项 MVP 已供两位 Builder 使用；本版范围经人工验收，整体需求未确认完成（演示）。'
                    : offline
                      ? '未知 · 最新成果来源不可读。'
                      : scenario === 'design'
                        ? '版本总览：设计草案可评审。项目里程碑：两人试用的 MVP（演示），设计修订待审。'
                        : '两项 MVP 已供部分 Builder 使用（演示）；反馈修理尚在继续，整体需求未确认完成。'}
                </p>
                <button
                  className="ov-link ov-note"
                  onClick={() => setDialog({ kind: 'review', title: '当前待审事项' })}
                >
                  {offline ? '待审事项未知' : '查看待审事项 ↗'}
                </button>
              </div>
            </div>
            <section className="ov-section">
              <SectionTitle
                id="features"
                title="大需求与本版交付"
                extra="同一需求跨版推进，分别看成果"
              />
              {displayed.map((feature) => (
                <Feature
                  key={`${feature.id}-${scenario}`}
                  feature={feature}
                  scenario={scenario}
                  openArtifact={openArtifact}
                  openSession={openSession}
                />
              ))}
            </section>
            <section className="ov-section">
              <SectionTitle
                id="trial"
                title="MVP 试用与后续完善"
                extra={history ? '当时的试用边界' : '部分用户先用，反馈进入 Issue'}
              />
              <div className="ov-trial">
                <div>
                  <strong>
                    {scenario === 'design'
                      ? '里程碑 MVP · 两位 Builder（演示）'
                      : '两个总览 MVP · 两位 Builder（演示）'}
                  </strong>
                  <p>范围：单项目、人工安排版本、只读成果聚合。候选包与试用名单应绑定同一提交。</p>
                  <span className="ov-chip">{offline ? '可用性未知' : '未全面发布'}</span>{' '}
                  <button
                    className="ov-link"
                    onClick={() =>
                      openArtifact(displayed[scenario === 'design' ? 1 : 0], [
                        '上线 / 试用',
                        '试用范围、候选包与反馈',
                        '演示',
                        '未接真实部署',
                        'trial'
                      ])
                    }
                  >
                    查看试用依据 ↗
                  </button>
                </div>
                <div>
                  <span className="ov-label">已知问题与下一步 · 演示</span>
                  <ul>
                    <li>DEMO-01 · 长标题入口遮挡 → 当前版修理</li>
                    <li>DEMO-02 · 跨周安排修订 → 后续 B 候选</li>
                    <li>跨宿主结果读取未验证 → 保持未知</li>
                  </ul>
                  <button
                    className="ov-link ov-note"
                    onClick={() => {
                      setScenario('repair')
                      setFilter('全部')
                    }}
                  >
                    查看后续 B 承担的增量 ↗
                  </button>
                </div>
              </div>
            </section>
            <section className="ov-section">
              <SectionTitle
                id="workflow"
                title="小需求 / bug"
                extra="原生 workflow 的执行与处理结果 · 演示"
              />
              <div className="ov-filters">
                {['全部', '执行中', '待处理', '已有结果'].map((name) => (
                  <button key={name} aria-pressed={filter === name} onClick={() => setFilter(name)}>
                    {name}
                  </button>
                ))}
              </div>
              {offline ? (
                <p>未知 · 任务与会话来源不可读，不能将读取失败当作无任务。</p>
              ) : (
                <div className="ov-table-wrap">
                  <table className="ov-table">
                    <thead>
                      <tr>
                        <th>任务</th>
                        <th>workflow</th>
                        <th>PR / Issue</th>
                        <th>可用性</th>
                        <th>依据与动作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {smallTasks
                        .filter((t) => filter === '全部' || t.state === filter)
                        .map((t) => (
                          <tr key={t.id}>
                            <td>
                              <button
                                onClick={() => setDialog({ kind: 'task', title: t.title, task: t })}
                              >
                                {t.title}
                              </button>
                              <small>
                                {t.id} · {t.feature}
                              </small>
                            </td>
                            <td>
                              {t.state}
                              <small>{t.session}</small>
                            </td>
                            <td>
                              {t.pr}
                              <small>Issue · {t.issue}</small>
                            </td>
                            <td>{t.availability}</td>
                            <td>
                              <button
                                className="ov-link"
                                onClick={() => setDialog({ kind: 'task', title: t.title, task: t })}
                              >
                                {t.next} ↗
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="ov-section">
              <SectionTitle id="records" title="本版记录" extra="承诺、评审、验收分别保留" />
              <div className="ov-records">
                {['计划与纪要', '规格 / 原型评审', '正式验收', '归档 PR', '发布依据'].map(
                  (name) => (
                    <button key={name} onClick={() => native(name)}>
                      {name} ↗
                    </button>
                  )
                )}
              </div>
            </section>
            <p className="ov-note">
              情景数据不证明实际交付；原型批注、规格评审、试用反馈均不增加正式版本验收次数。
            </p>
          </div>
        </main>
      </div>
      {dialog && (
        <Dialog
          title={dialog.title}
          close={() => setDialog(null)}
          wide={['source', 'edit', 'commitment'].includes(dialog.kind)}
        >
          {dialog.kind === 'references' && <ReferencePanel />}
          {dialog.kind === 'source' && <SourcePanel />}
          {dialog.kind === 'monthly' && (
            <>
              <p>
                月度先选择需求和优先次序，再安排每个 B 版本的可用增量。该入口由 #440
                提供，当前不复制其泳道页面。
              </p>
              <ol>
                <li>本月选择：版本总览重设计、项目里程碑规划。</li>
                <li>先行 B：设计握手并形成部分用户可试用 MVP。</li>
                <li>后续 B：依据试用反馈修理、完善，直至约定范围。</li>
                <li>后续 bug / 小需求继续进入 Issue workflow。</li>
              </ol>
              <p>版本编号、跨版需求身份与导航接口待主会话协调。</p>
              <a href={`${repository}/issues/440`} target="_blank" rel="noreferrer">
                打开 #440 设计任务 ↗
              </a>
              <p>
                <button
                  className="ov-primary"
                  onClick={() => {
                    setScenario('design')
                    setDialog(null)
                  }}
                >
                  进入先行 B
                </button>
              </p>
            </>
          )}
          {dialog.kind === 'commitment' && history && (
            <>
              <p>
                <span className="ov-chip">固定历史演示 · hist-01</span>
              </p>
              <p>
                当时承诺：单项目、本机只读成果与人工排期，供两位 Builder 试用。关联需求 #334 / #440
                仅作演示身份。
              </p>
              <p>
                演示人工结论：本版 MVP 范围达成；跨宿主能力不在此次范围。计划 plan-demo-01 与验收
                acceptance-demo-01 相互引用，均为模拟记录，没有实际历史文件。
              </p>
              <p>当前演示编辑、后续 PR 和 Issue 变化不改写这份固定情景。</p>
              <a
                href={`${repository}/blob/${baseline}/.bw/planning/v0.8/data.json`}
                target="_blank"
                rel="noreferrer"
              >
                另看真实 v0.8 计划参考（不作为本情景验收依据） ↗
              </a>
            </>
          )}
          {dialog.kind === 'commitment' && !history && (
            <>
              <p>
                <span className="ov-chip">正式计划快照</span> v0.8 · G2 · {planG2.owner} ·{' '}
                {baseline.slice(0, 8)}
              </p>
              <h3>{planG2.title}</h3>
              <p className="preline">{planG2.deliverable}</p>
              <h3>正式验收条件</h3>
              <p className="preline">{planG2.acceptance}</p>
              <p>
                关联任务：
                {actualTasks.map((t) => (
                  <a
                    key={t.number}
                    style={{ marginRight: 12 }}
                    href={`${repository}/issues/${t.number}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    #{t.number}
                  </a>
                ))}
              </p>
              <p>本版还有 G1、G3、G4；本原型聚焦 G2，不用一盏灯代表全部目标。</p>
              <a
                href={`${repository}/blob/${baseline}/.bw/planning/v0.8/data.json`}
                target="_blank"
                rel="noreferrer"
              >
                打开完整计划（含其他目标与纪要） ↗
              </a>
              <hr />
              <h3>本轮设计候选</h3>
              <p>
                首轮范围为高保真与规格；真实 MVP 仍需人确认规格后开发。两位用户、试用范围及后续 B
                增量均为演示，不改写上方正式承诺。
              </p>
            </>
          )}
          {dialog.kind === 'review' && (
            <>
              {offline ? (
                <p>待审来源未知，恢复读取后再核对。</p>
              ) : (
                <>
                  <p>每项评审绑定具体成果及修订；没有下一阶段的自动批准动作。</p>
                  {history && <p>演示归档未记录待审成果；当前版本的待审工作不回写此处。</p>}
                  {displayed.flatMap((f) =>
                    f.artifacts
                      .filter((row) => f.reviewKeys.includes(row[4]))
                      .map((row) => (
                        <div key={`${f.id}:${row[4]}`} className="ov-comment">
                          <strong>
                            {f.title} · {row[1]}
                          </strong>
                          <p>{row[2]}</p>
                          <button className="ov-primary" onClick={() => openArtifact(f, row)}>
                            查看待审成果
                          </button>
                        </div>
                      ))
                  )}
                </>
              )}
            </>
          )}
          {dialog.kind === 'artifact' && (
            <>
              <p>
                <span className="ov-chip">{dialog.row[2]}</span>
              </p>
              <dl>
                <dt>需求</dt>
                <dd>
                  #{dialog.feature.id} · {dialog.feature.title}
                </dd>
                <dt>类别</dt>
                <dd>{dialog.row[0]}</dd>
                <dt>来源</dt>
                <dd>{dialog.row[3]}</dd>
                <dt>核对范围</dt>
                <dd>
                  {history
                    ? '固定演示归档 hist-01；没有实际历史文件，不读取当前未认可草案。'
                    : scenario === 'design' &&
                        dialog.feature.id === '334' &&
                        ['intent', 'design'].includes(dialog.row[4])
                      ? '当前可编辑设计源；未经人工认可。'
                      : '情景模拟，没有真实成果 URL 或核验时间。'}
                </dd>
              </dl>
              {scenario === 'design' &&
              dialog.feature.id === '334' &&
              ['intent', 'design'].includes(dialog.row[4]) ? (
                <p>
                  <a
                    href={dialog.row[4] === 'intent' ? 'intent.md' : 'spec.md#v08-overview-draft'}
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开本分支文档 ↗
                  </a>{' '}
                  ·{' '}
                  <a href="version-overview-prototype.html" target="_blank" rel="noreferrer">
                    在新窗口评审高保真 ↗
                  </a>
                </p>
              ) : (
                <p>
                  成果形成后应打开实际文档、PR、测试报告或候选包。这里不伪造链接、通过记录或部署成功。
                </p>
              )}
              <p>
                <button className="ov-link" onClick={() => openSession(dialog.feature)}>
                  继续原生工作会话 ↗
                </button>
              </p>
            </>
          )}
          {dialog.kind === 'session' && (
            <>
              <p>
                演示目标：#{dialog.feature.id} · {dialog.feature.title} · {selected.version}
              </p>
              <dl>
                <dt>所属宿主</dt>
                <dd>{dialog.feature.id === '334' ? 'Local Windows' : '配对主机（演示）'}</dd>
                <dt>工作树</dt>
                <dd>
                  {dialog.feature.id === '334'
                    ? 'yuzhup/issue-334-v0.8-g2-sdlc'
                    : '待从 #440 所属宿主登记读取'}
                </dd>
                <dt>会话</dt>
                <dd>{offline ? '未知 · 宿主不可达' : '原生会话入口演示；未连接真实会话'}</dd>
              </dl>
              <p>
                产品接线将沿已有任务开工与工作区激活：唯一匹配直接打开，多实例按主机选择，无匹配进入原生创建器。保留原生会话记录、模型、工具及评审面。
              </p>
              <p>本原型不执行命令、不建树、不发送消息，也不把会话结束标成完成。</p>
            </>
          )}
          {dialog.kind === 'task' && (
            <>
              <span className="ov-chip">{dialog.task.id} · 模拟 Issue</span>
              <dl>
                <dt>执行</dt>
                <dd>{dialog.task.session}</dd>
                <dt>处理结果</dt>
                <dd>
                  PR {dialog.task.pr}；Issue {dialog.task.issue}
                </dd>
                <dt>可用性</dt>
                <dd>{dialog.task.availability}</dd>
              </dl>
              <p>
                真实实现分别打开原生 Issue、关联 PR /
                测试依据和所属宿主的工作会话；不从“会话已结束”推导 Issue 关闭或目标达成。
              </p>
            </>
          )}
          {dialog.kind === 'native' && (
            <>
              <p>
                复用现有「{dialog.route}
                」入口，携带当前项目与版本。原型只展示导航衔接，不复制执行器。
              </p>
              {dialog.route.includes('计划') && (
                <a
                  href="../version-planning/planning-journey-prototype.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  查看现有计划屏原型 ↗
                </a>
              )}
              {dialog.route.includes('验收') && (
                <a
                  href="../version-acceptance/acceptance-journey-prototype.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  查看现有验收屏原型 ↗
                </a>
              )}
              {dialog.route === '归档 PR' && !history && (
                <a href={`${repository}/pull/446`} target="_blank" rel="noreferrer">
                  打开 v0.8 计划归档 PR #446 ↗
                </a>
              )}
              {dialog.route === '发布依据' && <p>尚未提供本轮真实发布记录；发布状态保持未知。</p>}
              <p>
                历史版固定读取当时 committed 计划与验收来源，当前 Issue / PR
                动态另列。浏览历史不创建工作树。
              </p>
            </>
          )}
          {dialog.kind === 'edit' && (
            <>
              <p>
                修改本版承担、整体目标、后续范围与名称以便现场评审。只改变内存中的演示，刷新还原；可编辑源文件在
                prototype/overview-*.jsx 与 overview-data.js。
              </p>
              <textarea
                aria-label="演示内容 JSON"
                style={{ minHeight: 340, fontFamily: 'monospace' }}
                value={editing}
                onChange={(e) => setEditing(e.target.value)}
              />
              {editError && (
                <p role="alert" className="ov-error">
                  {editError}
                </p>
              )}
              <button className="ov-primary" onClick={applyEdits}>
                应用到本次预览
              </button>
            </>
          )}
        </Dialog>
      )}
    </div>
  )
}
createRoot(document.getElementById('root')).render(<App />)
