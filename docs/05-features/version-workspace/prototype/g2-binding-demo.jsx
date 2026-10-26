const {
  // React is used by the shared JSX build factory.
  // eslint-disable-next-line no-unused-vars
  React,
  useState,
  useEffect,
  useRef,
  GitBranch,
  MessageSquare
} = window.BWPrototypeDependencies

// Only the added binding group and the native history handoff are demonstrated here.
// All state is in memory; the real product continues to use Orca's registered trees.
export function useBindingDemo({
  versionOrder,
  plans,
  Modal,
  onOpen,
  onBound,
  notify,
  disconnected
}) {
  const [trees, setTrees] = useState([
    {
      id: 'shared',
      name: 'bw/v0.7/plan',
      branch: 'bw/v0.7/plan',
      owner: 'remote',
      version: 'v0.7',
      role: 'plan',
      sessions: []
    },
    {
      id: 'existing',
      name: 'feature/notes',
      branch: 'feature/notes',
      version: null,
      role: 'goal',
      sessions: ['功能讨论']
    }
  ])
  const [selected, setSelected] = useState(null)
  const [menu, setMenu] = useState(null)
  const [draft, setDraft] = useState(null)
  const [history, setHistory] = useState(false)
  const menuRef = useRef(null)
  const current = trees.find((tree) => tree.id === selected)
  useEffect(() => {
    if (!menu) {
      return
    }
    const previous = document.activeElement
    menuRef.current?.querySelector('button')?.focus()
    let restoreFocus = true
    const close = () => setMenu(null)
    const key = (event) => {
      if (event.key === 'Escape') {
        close()
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        restoreFocus = false
        const controls = [...document.querySelectorAll('button,input,select,a[href]')].filter(
          (element) =>
            !element.disabled && element.offsetWidth > 0 && !menuRef.current.contains(element)
        )
        const index = controls.indexOf(previous)
        const target =
          controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length]
        close()
        target?.focus()
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const buttons = [...menuRef.current.querySelectorAll('button')].filter(
          (button) => !button.disabled
        )
        const index = buttons.indexOf(document.activeElement)
        buttons[
          (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length
        ]?.focus()
      }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', key)
      if (restoreFocus && previous?.isConnected) {
        previous.focus()
      }
    }
  }, [menu])
  const open = (tree) => {
    setSelected(tree.id)
    setHistory(false)
    onOpen()
  }
  const row = (tree) => (
    <div className="native-worktree-card binding-demo-tree" key={tree.id}>
      <button
        className="native-worktree-heading"
        onClick={() => open(tree)}
        onContextMenu={(event) => {
          event.preventDefault()
          event.currentTarget.focus()
          setMenu({
            tree,
            x: Math.min(event.clientX, window.innerWidth - 230),
            y: Math.min(event.clientY, window.innerHeight - 150)
          })
        }}
        onKeyDown={(event) => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault()
            const rect = event.currentTarget.getBoundingClientRect()
            setMenu({
              tree,
              x: Math.min(rect.left, window.innerWidth - 230),
              y: Math.min(rect.bottom, window.innerHeight - 150)
            })
          }
        }}
        title={`${tree.name + (tree.owner === 'remote' ? ' · 配对机' : '')} · 右键管理版本绑定`}
      >
        <GitBranch size={14} />
        <span>
          {tree.name}
          {tree.owner === 'remote' && <small> · 配对机</small>}
        </span>
        {tree.owner === 'remote' && disconnected && (
          <span
            className="disconnected-mark"
            role="img"
            aria-label="配对机已断开"
            title="配对机已断开"
          >
            ⊘
          </span>
        )}
      </button>
      <div className="native-tree-contents">
        {tree.sessions.length ? (
          tree.sessions.map((session) => (
            <button className="nav-row native-agent-row" key={session} onClick={() => open(tree)}>
              <MessageSquare size={13} />
              <span>{session}</span>
            </button>
          ))
        ) : (
          <div className="tree-empty">暂无会话</div>
        )}
      </div>
    </div>
  )
  const goalOptions = draft ? plans[draft.version]?.goals || [] : []
  const issues = draft
    ? (plans[draft.version]?.tasks || []).filter((task) => task.goalId === draft.goal)
    : []
  const workflowMismatch =
    draft &&
    ['plan', 'acceptance'].includes(draft.role) &&
    draft.branch !== `bw/${draft.version}/${draft.role}`
  const save = (event) => {
    event.preventDefault()
    if (workflowMismatch || (draft.owner === 'remote' && disconnected)) {
      return
    }
    setTrees((items) => items.map((tree) => (tree.id === draft.id ? { ...tree, ...draft } : tree)))
    onBound(draft.version, draft.role, draft.goal)
    notify('已更新版本绑定')
    setDraft(null)
  }
  return {
    boundTrees: (version) => trees.filter((tree) => tree.version === version),
    removeTrees: (ids) => setTrees((items) => items.filter((tree) => !ids.includes(tree.id))),
    boundRows: (version, role, goal) =>
      trees
        .filter(
          (tree) =>
            tree.version === version &&
            (role === 'goal'
              ? ['goal', 'issue'].includes(tree.role) && tree.goal === goal
              : tree.role === role)
        )
        .map(row),
    unboundRows: trees.filter((tree) => !tree.version).map(row),
    workspace: current && (
      <div className="reuse-page">
        <div className="reuse-marker">Orca 原生工作区 · 历史会话恢复示意</div>
        <h1>{current.name}</h1>
        <p className="muted">
          {current.version
            ? `${current.version} / ${
                {
                  plan: '计划',
                  acceptance: '验收',
                  goal: current.goal,
                  issue: `#${current.issue}`
                }[current.role]
              }`
            : '未绑定版本'}
        </p>
        <div className="reuse-outline">
          <MessageSquare size={24} />
          <span>
            {current.owner === 'remote' && disconnected
              ? '配对机已断开，此工作树暂不可访问。'
              : current.sessions.length
                ? current.sessions[0]
                : '暂无会话'}
          </span>
        </div>
        <div className="prototype-action">
          <button
            className="button"
            disabled={current.owner === 'remote' && disconnected}
            onClick={() => setHistory(!history)}
            aria-expanded={history}
          >
            历史会话
          </button>
          {history && !(current.owner === 'remote' && disconnected) && (
            <div className="binding-history">
              <span>计划讨论 · Claude</span>
              <button
                className="button"
                disabled={current.sessions.includes('计划讨论 · Claude')}
                onClick={() => {
                  setTrees((items) =>
                    items.map((tree) =>
                      tree.id === current.id
                        ? { ...tree, sessions: [...tree.sessions, '计划讨论 · Claude'] }
                        : tree
                    )
                  )
                  notify('已恢复会话')
                }}
              >
                {current.sessions.includes('计划讨论 · Claude') ? '已恢复' : '恢复会话'}
              </button>
            </div>
          )}
        </div>
      </div>
    ),
    overlays: (
      <>
        {menu && (
          <div
            className="binding-context-menu"
            ref={menuRef}
            role="menu"
            aria-label="工作树版本绑定"
            style={{ left: Math.max(8, menu.x), top: Math.max(8, menu.y) }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              role="menuitem"
              onClick={() => {
                open(menu.tree)
                setMenu(null)
              }}
            >
              打开工作区
            </button>
            <div role="separator" />
            <button
              role="menuitem"
              disabled={menu.tree.owner === 'remote' && disconnected}
              onClick={() => {
                setDraft({
                  ...menu.tree,
                  version: menu.tree.version || versionOrder[0],
                  goal: menu.tree.goal || '',
                  issue: menu.tree.issue || ''
                })
                setMenu(null)
              }}
            >
              {menu.tree.version ? '更改版本绑定…' : '绑定版本…'}
            </button>
            {menu.tree.version && (
              <button
                role="menuitem"
                disabled={menu.tree.owner === 'remote' && disconnected}
                onClick={() => {
                  setTrees((items) =>
                    items.map((tree) =>
                      tree.id === menu.tree.id ? { ...tree, version: null } : tree
                    )
                  )
                  setMenu(null)
                  notify('已解除版本绑定，工作树与会话保留')
                }}
              >
                解除版本绑定
              </button>
            )}
          </div>
        )}
        {draft && (
          <Modal
            title={trees.find((tree) => tree.id === draft.id).version ? '更改版本绑定' : '绑定版本'}
            close={() => setDraft(null)}
          >
            <p className="muted">{draft.name}</p>
            <form className="binding-form" onSubmit={save}>
              <label htmlFor="binding-version">版本</label>
              <select
                id="binding-version"
                value={draft.version}
                onChange={(event) =>
                  setDraft({ ...draft, version: event.target.value, goal: '', issue: '' })
                }
              >
                {versionOrder.map((version) => (
                  <option key={version}>{version}</option>
                ))}
              </select>
              <label htmlFor="binding-role">用途</label>
              <select
                id="binding-role"
                value={draft.role}
                onChange={(event) =>
                  setDraft({ ...draft, role: event.target.value, goal: '', issue: '' })
                }
              >
                <option value="plan">计划</option>
                <option value="acceptance">验收</option>
                <option value="goal">目标协作</option>
                <option value="issue">Issue 执行</option>
              </select>
              {['goal', 'issue'].includes(draft.role) && (
                <>
                  <label htmlFor="binding-goal">所属目标</label>
                  <select
                    id="binding-goal"
                    value={draft.goal}
                    required
                    onChange={(event) =>
                      setDraft({ ...draft, goal: event.target.value, issue: '' })
                    }
                  >
                    <option value="">选择目标</option>
                    {goalOptions.map((goal) => (
                      <option value={goal.goalId} key={goal.goalId}>
                        {goal.goalId} · {goal.title}
                      </option>
                    ))}
                  </select>
                  {!goalOptions.length && <p className="muted">本版尚无目标，请先保存版本计划。</p>}
                </>
              )}
              {draft.role === 'issue' && (
                <>
                  <label htmlFor="binding-issue">对应 Issue</label>
                  <select
                    id="binding-issue"
                    value={draft.issue}
                    required
                    onChange={(event) => setDraft({ ...draft, issue: event.target.value })}
                  >
                    <option value="">选择 Issue</option>
                    {issues.map((issue) => (
                      <option value={issue.number} key={issue.number}>
                        #{issue.number}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {workflowMismatch && (
                <p className="form-error" role="alert">
                  此工作树分支不是 bw/{draft.version}/{draft.role}，不能作为该版
                  {draft.role === 'plan' ? '计划' : '验收'}树。请改选用途或工作树。
                </p>
              )}
              <div className="dialog-actions">
                <button
                  className="button primary"
                  disabled={workflowMismatch || (draft.owner === 'remote' && disconnected)}
                  type="submit"
                >
                  保存绑定
                </button>
              </div>
            </form>
          </Modal>
        )}
      </>
    )
  }
}
