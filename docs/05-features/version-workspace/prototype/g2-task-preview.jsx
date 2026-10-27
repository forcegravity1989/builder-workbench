// React is required by the prototype JSX build factory.
// eslint-disable-next-line no-unused-vars
const { React, useState, GitPullRequest, RefreshCw, Plus, X, ChevronDown } =
  window.BWPrototypeDependencies

const EMPTY_ROWS = []
const defaultIssueActionLabel = () => '开工'

const REPOSITORY = 'github.com/forcegravity1989/builder-workbench'
const PR_PREVIEW = [
  {
    number: 438,
    title: '恢复版本任务入口的原生筛选与列表操作',
    state: 'OPEN',
    author: 'yuzhup',
    version: 'v0.7',
    category: 'bug',
    kind: 'pr',
    reviewer: 'yuzhup'
  },
  {
    number: 393,
    title: '修复运行时会话重复回显',
    state: 'CLOSED',
    author: 'kanadead',
    version: 'v0.7',
    category: 'bug',
    kind: 'pr'
  }
]

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  )
}

function IssueIcon({ state }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" />
      {state === 'CLOSED' ? (
        <path d="m8 12 3 3 5-6" />
      ) : (
        <circle cx="12" cy="12" r="1" fill="currentColor" />
      )}
    </svg>
  )
}

function InlineTaskSurface({ title, children, close }) {
  return (
    <section className="native-task-inline-panel" aria-label={title}>
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="native-task-icon-button"
          aria-label="关闭任务详情"
          onClick={close}
        >
          <X size={17} />
        </button>
      </header>
      {children}
    </section>
  )
}

export function TaskPreview({
  version,
  goal,
  goals = EMPTY_ROWS,
  references = EMPTY_ROWS,
  issues = EMPTY_ROWS,
  onChangeScope,
  onStartIssue,
  onNotice,
  getIssueActionLabel = defaultIssueActionLabel,
  Modal
}) {
  const [entryVersion] = useState(version || 'v0.7')
  const [kind, setKind] = useState('issues')
  const [preset, setPreset] = useState('open')
  const [status, setStatus] = useState('OPEN')
  const [author, setAuthor] = useState('all')
  const [assignee, setAssignee] = useState('all')
  const [label, setLabel] = useState('all')
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [repoOpen, setRepoOpen] = useState(false)
  const [repositorySelected, setRepositorySelected] = useState(true)
  const [detail, setDetail] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [created, setCreated] = useState([])
  const TaskSurface = Modal || InlineTaskSurface
  const closeTaskSurface = () => {
    setDetail(null)
    setCreating(false)
  }
  const goalTitle = goals.find((item) => item.goalId === goal)?.title
  const versionLabel = version ? `bw:plan:${version}` : null
  const issueRows = issues.map((item, index) => {
    const reference = references.find(
      (task) => task.number === item.number && (!task.repository || task.repository === REPOSITORY)
    ) || { provider: 'github', repository: REPOSITORY, number: item.number }
    const titleVersion = item.title.match(/^【([^|]+)\|/)
    const existingLabels = (item.labels?.nodes || item.labels || []).map((itemLabel) =>
      typeof itemLabel === 'string' ? itemLabel : itemLabel.name
    )
    return {
      ...item,
      kind: 'issue',
      version:
        existingLabels.find((itemLabel) => itemLabel?.startsWith('bw:plan:'))?.slice(8) ||
        titleVersion?.[1] ||
        null,
      goalId: reference?.goalId || null,
      reference,
      author: item.author?.login || ['cfdcfd', 'yuzhup', 'kanadead'][index % 3],
      category:
        existingLabels.find((itemLabel) => ['bug', 'feature'].includes(itemLabel)) ||
        ([372, 384, 317, 323].includes(item.number) ? 'bug' : 'feature')
    }
  })
  // Current plan references have no PR discriminator; never assign a PR goal from an Issue number.
  const rows = kind === 'issues' ? [...created, ...issueRows] : PR_PREVIEW
  const filtered = repositorySelected
    ? rows
        .filter((row) => {
          if (version && row.version !== version) {
            return false
          }
          if (goal && row.goalId !== goal) {
            return false
          }
          if (status !== 'all' && row.state !== status) {
            return false
          }
          if (author !== 'all' && row.author !== author) {
            return false
          }
          if (
            assignee !== 'all' &&
            !(row.assignees?.nodes || []).some((person) => person.login === assignee)
          ) {
            return false
          }
          if (label !== 'all' && row.category !== label) {
            return false
          }
          if (preset === 'review' && row.reviewer !== 'yuzhup') {
            return false
          }
          const searchable =
            `${row.number} ${row.title} ${row.author} ${row.category} bw:plan:${row.version || ''}`.toLowerCase()
          return searchable.includes(query.trim().toLowerCase().replace(/^#/, ''))
        })
        .sort((a, b) => (a.state === 'CLOSED') - (b.state === 'CLOSED') || b.number - a.number)
    : []
  const activeFilters =
    Number(status !== 'OPEN') +
    Number(author !== 'all') +
    Number(assignee !== 'all') +
    Number(label !== 'all')

  function applyPreset(next) {
    setPreset(next)
    setStatus(next === 'all' ? 'all' : 'OPEN')
    setAuthor(next === 'mine' && kind === 'prs' ? 'yuzhup' : 'all')
    setAssignee(next === 'mine' && kind === 'issues' ? 'yuzhup' : 'all')
  }

  function createIssue(event) {
    event.preventDefault()
    if (!newTitle.trim()) {
      return
    }
    const number =
      Math.max(...issueRows.map((row) => row.number), ...created.map((row) => row.number), 440) + 1
    const reference = { provider: 'github', repository: REPOSITORY, number }
    setCreated((current) => [
      {
        number,
        title: newTitle.trim(),
        body: newBody,
        state: 'OPEN',
        author: 'yuzhup',
        category: label === 'all' ? 'feature' : label,
        kind: 'issue',
        version,
        goalId: null,
        reference
      },
      ...current
    ])
    setCreating(false)
    setNewTitle('')
    setNewBody('')
    onNotice?.(`演示：已创建 Issue #${number}`)
  }

  return (
    <section className="native-task-page" aria-label="任务">
      <div className="native-task-page-title">
        <h1>任务</h1>
      </div>
      <div className="native-task-card">
        <div className="native-task-filters">
          <div className="native-task-toolbar">
            <div className="native-task-modes" aria-label="任务类型">
              <button
                type="button"
                className={`native-task-button ${kind === 'issues' ? 'is-active' : ''}`}
                aria-pressed={kind === 'issues'}
                onClick={() => {
                  if (kind !== 'issues') {
                    setKind('issues')
                    applyPreset('open')
                  }
                }}
              >
                Issues
              </button>
              <button
                type="button"
                className={`native-task-button ${kind === 'prs' ? 'is-active' : ''}`}
                aria-pressed={kind === 'prs'}
                onClick={() => {
                  if (kind !== 'prs') {
                    setKind('prs')
                    applyPreset('open')
                  }
                }}
              >
                PRs
              </button>
            </div>
            <div className="native-task-menu-anchor">
              <button
                type="button"
                className="native-task-button native-task-repository"
                aria-expanded={repoOpen}
                onClick={() => {
                  setRepoOpen(!repoOpen)
                  setFiltersOpen(false)
                }}
              >
                {repositorySelected ? 'Builder Workbench' : '选择项目'}
                <ChevronDown size={12} />
              </button>
              {repoOpen && (
                <div className="native-task-popover native-task-repository-menu">
                  <label className="native-task-check">
                    <input
                      type="checkbox"
                      checked={repositorySelected}
                      onChange={(event) => setRepositorySelected(event.target.checked)}
                    />
                    <span>
                      Builder Workbench<small>{REPOSITORY}</small>
                    </span>
                  </label>
                </div>
              )}
            </div>
            <span className="native-task-divider" aria-hidden="true" />
            <div className="native-task-presets" aria-label="任务预设">
              {[
                ['open', '开放'],
                ['mine', kind === 'issues' ? '分配给我' : '我的'],
                ...(kind === 'prs' ? [['review', '待我评审']] : [])
              ].map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  className={`native-task-button ${preset === value ? 'is-active' : ''}`}
                  aria-pressed={preset === value}
                  onClick={() => applyPreset(value)}
                >
                  {text}
                </button>
              ))}
            </div>
            <div className="native-task-menu-anchor">
              <button
                type="button"
                className="native-task-button"
                aria-expanded={filtersOpen}
                onClick={() => {
                  setFiltersOpen(!filtersOpen)
                  setRepoOpen(false)
                }}
              >
                筛选{activeFilters > 0 ? ` (${activeFilters})` : ''}
                <ChevronDown size={12} />
              </button>
              {filtersOpen && (
                <div
                  className="native-task-popover"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setFiltersOpen(false)
                    }
                  }}
                >
                  <label>
                    状态
                    <select
                      value={status}
                      onChange={(event) => {
                        setStatus(event.target.value)
                        setPreset('custom')
                      }}
                    >
                      <option value="all">全部状态</option>
                      <option value="OPEN">开放</option>
                      <option value="CLOSED">已关闭</option>
                    </select>
                  </label>
                  <label>
                    作者
                    <select
                      value={author}
                      onChange={(event) => {
                        setAuthor(event.target.value)
                        setPreset('custom')
                      }}
                    >
                      <option value="all">所有人</option>
                      {['yuzhup', 'cfdcfd', 'kanadead'].map((login) => (
                        <option key={login} value={login}>
                          {login}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    指派给
                    <select
                      value={assignee}
                      onChange={(event) => {
                        setAssignee(event.target.value)
                        setPreset('custom')
                      }}
                    >
                      <option value="all">所有人</option>
                      {['yuzhup', 'cfdcfd', 'kanadead'].map((login) => (
                        <option key={login} value={login}>
                          {login}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    标签
                    <select value={label} onChange={(event) => setLabel(event.target.value)}>
                      <option value="all">全部标签</option>
                      <option value="feature">feature</option>
                      <option value="bug">bug</option>
                    </select>
                  </label>
                  <label className="native-task-check">
                    <input
                      type="checkbox"
                      checked={Boolean(version)}
                      onChange={(event) =>
                        onChangeScope(
                          event.target.checked ? entryVersion : null,
                          event.target.checked ? goal : null
                        )
                      }
                    />
                    <span>bw:plan:{entryVersion}</span>
                  </label>
                  <button
                    type="button"
                    className="native-task-text-button"
                    onClick={() => {
                      applyPreset('open')
                      setLabel('all')
                      setQuery('')
                      onChangeScope(null, null)
                      setFiltersOpen(false)
                    }}
                  >
                    清除筛选
                  </button>
                </div>
              )}
            </div>
            <div className="native-task-search">
              <SearchIcon />
              <input
                aria-label={`搜索 ${kind === 'issues' ? 'Issues' : 'PRs'}`}
                placeholder={
                  goal && kind === 'issues'
                    ? '搜索目标标题或编号…'
                    : `搜索 GitHub ${kind === 'issues' ? 'Issues' : 'PRs'}…`
                }
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button type="button" aria-label="清除搜索" onClick={() => setQuery('')}>
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="native-task-actions">
              <button
                type="button"
                className="native-task-icon-button"
                aria-label="刷新任务"
                title="刷新"
                onClick={() => onNotice?.('演示：已刷新当前任务列表，保留筛选条件')}
              >
                <RefreshCw size={15} />
              </button>
              <button
                type="button"
                className="native-task-icon-button"
                aria-label="新建 Issue"
                title="新建 Issue"
                onClick={() => setCreating(true)}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          {(version ||
            goal ||
            label !== 'all' ||
            author !== 'all' ||
            assignee !== 'all' ||
            status !== 'OPEN') && (
            <div className="native-task-chips" aria-label="当前筛选条件">
              {version && (
                <span className="native-task-chip">
                  {versionLabel}
                  <button
                    type="button"
                    aria-label={`移除版本标签 ${versionLabel}`}
                    onClick={() => onChangeScope(null, null)}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {goal && (
                <span className="native-task-chip" title={goalTitle || goal}>
                  目标：{goal}
                  <button
                    type="button"
                    aria-label={`移除目标 ${goal} 筛选`}
                    onClick={() => onChangeScope(version, null)}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {status !== 'OPEN' && (
                <span className="native-task-chip">
                  {status === 'all' ? '全部状态' : '已关闭'}
                  <button
                    type="button"
                    aria-label="移除状态筛选"
                    onClick={() => {
                      setStatus('OPEN')
                      setPreset('custom')
                    }}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {author !== 'all' && (
                <span className="native-task-chip">
                  作者：{author}
                  <button
                    type="button"
                    aria-label="移除作者筛选"
                    onClick={() => {
                      setAuthor('all')
                      setPreset('custom')
                    }}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {assignee !== 'all' && (
                <span className="native-task-chip">
                  指派给：{assignee}
                  <button
                    type="button"
                    aria-label="移除指派筛选"
                    onClick={() => {
                      setAssignee('all')
                      setPreset('custom')
                    }}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {label !== 'all' && (
                <span className="native-task-chip">
                  {label}
                  <button type="button" aria-label="移除标签筛选" onClick={() => setLabel('all')}>
                    <X size={12} />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
        <div className="native-task-list-summary">
          <span>
            {kind === 'issues' ? 'Issues' : 'Pull requests'} <strong>{filtered.length}</strong>
          </span>
          <span>
            {filtered.filter((row) => row.state !== 'CLOSED').length} 开放 ·{' '}
            {filtered.filter((row) => row.state === 'CLOSED').length} 已关闭
          </span>
        </div>
        {filtered.length ? (
          <div
            className="native-task-list"
            role="list"
            aria-label={kind === 'issues' ? 'Issue 列表' : 'PR 列表'}
          >
            {filtered.map((row) => (
              <article
                key={`${row.kind}-${row.number}`}
                className="native-task-row"
                role="listitem"
              >
                <span
                  className={`native-task-state-icon ${row.state === 'CLOSED' ? 'is-closed' : ''}`}
                >
                  {row.kind === 'pr' ? (
                    <GitPullRequest size={15} />
                  ) : (
                    <IssueIcon state={row.state} />
                  )}
                </span>
                <div className="native-task-row-content">
                  <button
                    type="button"
                    className="native-task-row-title"
                    onClick={() => setDetail(row)}
                  >
                    {row.title}
                  </button>
                  <div className="native-task-row-meta">
                    <span>#{row.number}</span>
                    <span>{row.state === 'CLOSED' ? '已关闭' : '开放'}</span>
                    <span>{row.author}</span>
                    <span className="native-task-label">{row.category}</span>
                    {row.version && (
                      <span className="native-task-label">bw:plan:{row.version}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="native-task-button native-task-row-action"
                  onClick={() =>
                    row.kind === 'issue' && row.reference
                      ? onStartIssue?.(row.reference, row.title)
                      : setDetail(row)
                  }
                >
                  {row.kind === 'issue' ? getIssueActionLabel(row.reference) : '查看 PR'}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="native-task-empty">
            <SearchIcon />
            <strong>没有匹配的{kind === 'issues' ? ' Issue' : ' PR'}</strong>
            <span>调整筛选条件或搜索内容后重试。</span>
          </div>
        )}
      </div>
      {(detail || creating) && (
        <TaskSurface
          title={
            creating
              ? '新建 Issue'
              : `${detail.kind === 'pr' ? 'Pull request' : 'Issue'} #${detail.number}`
          }
          close={closeTaskSurface}
        >
          {creating ? (
            <form className="native-task-newissue-form" onSubmit={createIssue}>
              <label>
                项目
                <input value="Builder Workbench" readOnly />
              </label>
              <label>
                标题
                <input
                  autoFocus
                  required
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="Issue 标题"
                />
              </label>
              <label>
                描述
                <textarea
                  rows={6}
                  value={newBody}
                  onChange={(event) => setNewBody(event.target.value)}
                  placeholder="描述问题或需要完成的工作"
                />
              </label>
              {version && (
                <div className="native-task-row-meta">
                  <span className="native-task-label">{versionLabel}</span>
                </div>
              )}
              <footer>
                <button
                  type="button"
                  className="native-task-button"
                  onClick={() => setCreating(false)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="native-task-button is-active"
                  disabled={!newTitle.trim()}
                >
                  创建 Issue
                </button>
              </footer>
            </form>
          ) : (
            <div className="native-task-detail">
              <h2>{detail.title}</h2>
              <div className="native-task-row-meta">
                <span>{detail.state === 'CLOSED' ? '已关闭' : '开放'}</span>
                <span>{detail.author}</span>
                <span className="native-task-label">{detail.category}</span>
                {detail.version && (
                  <span className="native-task-label">bw:plan:{detail.version}</span>
                )}
              </div>
              {detail.body && <p>{detail.body}</p>}
              <footer>
                <button
                  type="button"
                  className="native-task-button"
                  onClick={() => setDetail(null)}
                >
                  关闭
                </button>
                {detail.kind === 'issue' && detail.reference && (
                  <button
                    type="button"
                    className="native-task-button is-active"
                    onClick={() => {
                      onStartIssue?.(detail.reference, detail.title)
                      setDetail(null)
                    }}
                  >
                    {getIssueActionLabel(detail.reference)}
                  </button>
                )}
              </footer>
            </div>
          )}
        </TaskSurface>
      )}
    </section>
  )
}
