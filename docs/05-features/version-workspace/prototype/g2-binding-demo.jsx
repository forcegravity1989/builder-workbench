const {
  // React is used by the shared JSX build factory.
  // eslint-disable-next-line no-unused-vars
  React,
  useState,
  useEffect,
  useRef
} = window.BWPrototypeDependencies

// One in-memory registry drives every prototype tree and its binding menu.
// The real product continues to use Orca's registered trees.
export function useBindingDemo({
  versionOrder,
  plans,
  Modal,
  onOpen,
  onBound,
  notify,
  disconnected,
  initialTrees
}) {
  const [trees, setTrees] = useState(initialTrees)
  const [menu, setMenu] = useState(null)
  const [draft, setDraft] = useState(null)
  const menuRef = useRef(null)
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
    if (tree.owner === 'remote' && disconnected) {
      return
    }
    onOpen(tree)
  }
  const contextMenuProps = (tree) =>
    tree
      ? {
          onContextMenu: (event) => {
            event.preventDefault()
            event.stopPropagation()
            event.currentTarget.querySelector('button')?.focus()
            setMenu({
              tree,
              x: Math.min(event.clientX, window.innerWidth - 230),
              y: Math.min(event.clientY, window.innerHeight - 150)
            })
          },
          onKeyDown: (event) => {
            if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) {
              return
            }
            event.preventDefault()
            event.stopPropagation()
            const rect = event.currentTarget.getBoundingClientRect()
            setMenu({
              tree,
              x: Math.min(rect.left, window.innerWidth - 230),
              y: Math.min(rect.bottom, window.innerHeight - 150)
            })
          }
        }
      : {}
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
    setTrees((items) =>
      items.map((tree) =>
        tree.id === draft.id
          ? {
              ...tree,
              version: draft.version,
              role: draft.role,
              goal: draft.goal,
              issue: draft.issue ? Number(draft.issue) : undefined
            }
          : tree
      )
    )
    onBound(draft.version, draft.role, draft.goal)
    notify('已更新版本绑定')
    setDraft(null)
  }
  return {
    trees,
    setTrees,
    contextMenuProps,
    boundTrees: (version) => trees.filter((tree) => tree.version === version),
    removeTrees: (ids) => setTrees((items) => items.filter((tree) => !ids.includes(tree.id))),
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
