;(() => {
  const W = window.WallProto
  const { state: s } = W
  let toastTimer
  let configTrigger
  let repoMenu
  const closeRepoMenu = () => {
    document.getElementById('repo-picker')?.remove()
    repoMenu = null
  }
  W.toast = (message) => {
    clearTimeout(toastTimer)
    W.$('toast').textContent = message
    W.$('toast').hidden = false
    toastTimer = setTimeout(() => {
      W.$('toast').hidden = true
    }, 3000)
  }
  const clearConfig = () => {
    s.config = null
    s.draft = null
    s.editing = false
  }
  const guarded = (action) => {
    if (!W.dirty()) {
      action()
      return
    }
    s.pendingLeave = action
    W.modal(
      '还有未保存的变更',
      '<p>离开会丢弃本次共享信息修改。</p><footer class="modal-foot"><button class="btn btn-secondary" data-action="close-dialog">继续编辑</button><button class="btn btn-ghost" data-action="discard">丢弃并离开</button></footer>'
    )
  }
  const goWall = () =>
    guarded(() => {
      closeRepoMenu()
      clearConfig()
      s.mode = 'wall'
      s.reuse = null
      W.closeModal()
      W.render()
    })
  const goReuse = (target, id, repoContext = '') => {
    const contextId = id || s.config
    guarded(() => {
      if (contextId) {
        s.active = contextId
      }
      clearConfig()
      s.mode = 'reuse'
      s.reuse = target
      s.repoContext = repoContext
      closeRepoMenu()
      W.closeModal()
      W.render()
    })
  }
  const selectRepo = (target, id, repo) => {
    const p = W.project(id)
    const host = repo.host || (p.hosts.includes('local') ? 'local' : p.hosts[0])
    if (target !== 'open-repo' && !W.hosts[host].online) {
      W.toast('主机离线，恢复连接后操作')
      return
    }
    if (target === 'open-repo' && !repo.remote && host !== 'local') {
      W.toast('远端文件夹请从所属主机的工作区打开')
      return
    }
    goReuse(target, id, `${repo.name} · ${W.hosts[host].name}`)
  }
  const openRepo = (target, id, trigger) => {
    closeRepoMenu()
    const p = W.project(id)
    const repos = W.repoSlots(p).filter(
      (repo) =>
        target !== 'remove-repo' ||
        (repo.host || (p.hosts.includes('local') ? 'local' : p.hosts[0])) === 'local'
    )
    if (repos.length === 1) {
      selectRepo(target, id, repos[0])
      return
    }
    if (!repos.length) {
      W.toast('没有可操作的本机仓库')
      return
    }
    repoMenu = { target, id, repos, trigger }
    const menu = document.createElement('div')
    menu.id = 'repo-picker'
    menu.className = 'repo-picker'
    menu.setAttribute('aria-label', '选择代码仓')
    menu.innerHTML = `<p>选择代码仓</p>${repos.map((repo, index) => `<button data-action="choose-repo" data-id="${index}">${W.esc(repo.name)}</button>`).join('')}`
    document.body.append(menu)
    const rect = trigger.getBoundingClientRect()
    menu.style.left = `${Math.max(12, Math.min(rect.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 12))}px`
    menu.style.top = `${Math.max(12, Math.min(rect.bottom + 5, innerHeight - menu.offsetHeight - 12))}px`
    menu.querySelector('button').focus()
  }
  const openProject = (id) => {
    const p = W.project(id)
    if (!p) {
      return
    }
    if (!W.available(p)) {
      W.toast('主机离线，可在远程主机管理中恢复连接')
      return
    }
    goReuse('workspace', id)
  }
  const openConfig = (id, trigger) =>
    guarded(() => {
      const p = W.project(id)
      if (!p) {
        return
      }
      s.config = id
      s.editing = false
      s.draft = Object.fromEntries(W.fields.map(([key]) => [key, p[key] || '']))
      configTrigger = trigger
      W.closeModal()
      W.render()
      W.$('project-visibility').focus()
    })
  const closeConfig = () =>
    guarded(() => {
      const id = s.config
      clearConfig()
      W.render()
      if (configTrigger?.isConnected) {
        configTrigger.focus()
      } else {
        document.querySelector(`[data-action="config"][data-id="${id}"]`)?.focus()
      }
    })
  const reset = (scenario = s.scenario) => {
    closeRepoMenu()
    W.closeModal()
    clearConfig()
    clearTimeout(toastTimer)
    W.$('toast').hidden = true
    Object.assign(s, {
      projects: scenario === 'empty' ? [] : W.fixtures(),
      active: null,
      filter: 'all',
      category: 'all',
      viewer: 'self',
      query: '',
      scenario,
      mode: 'wall',
      reuse: null,
      pendingLeave: null,
      updated: W.updateTime(),
      hostReadFailed: scenario === 'error'
    })
    if (scenario === 'unknown') {
      Object.assign(W.project('bw'), {
        version: undefined,
        goals: [],
        plan: null,
        tasks: null,
        acceptance: null
      })
    }
    if (scenario === 'merged') {
      W.project('bw').pending = {
        ...Object.fromEntries(W.fields.map(([key]) => [key, W.project('bw')[key] || ''])),
        builder: '新的项目负责人'
      }
    }
    W.$('scenario').value = scenario
    W.$('viewer').value = 'self'
    W.render()
  }
  const actions = {
    wall: goWall,
    workspace: () => (s.active ? openProject(s.active) : W.toast('先从项目墙选择项目')),
    open: openProject,
    overview: (id) => goReuse('overview', id),
    version: (id) => goReuse('version', id),
    stage: (id, el) => goReuse(el.dataset.target, id),
    reuse: goReuse,
    'workspace-row': () => goReuse('workspace'),
    config: openConfig,
    'open-repo': (id, el) => openRepo('open-repo', id, el),
    'repo-settings': (id, el) => openRepo('repo-settings', id, el),
    'remove-repo': (id, el) => openRepo('remove-repo', id, el),
    'choose-repo': (index) => {
      if (repoMenu) {
        const { target, id, repos } = repoMenu
        selectRepo(target, id, repos[Number(index)])
      }
    },
    'close-config': closeConfig,
    add: () => goReuse('add'),
    'clone-local': (id) => goReuse('clone', id),
    scope: () => goReuse('scope'),
    refresh: () => {
      s.hostReadFailed = false
      s.updated = W.updateTime()
      W.renderWall()
      W.toast('项目墙已刷新')
    },
    filter: (id) => {
      s.filter = id
      W.renderWall()
    },
    category: (id) => {
      s.category = id
      W.renderWall()
    },
    'clear-filter': () => {
      s.query = ''
      s.category = 'all'
      s.filter = 'all'
      W.renderWall()
    },
    'close-dialog': () => {
      s.pendingLeave = null
      W.closeModal()
    },
    discard: () => {
      const action = s.pendingLeave
      s.pendingLeave = null
      clearConfig()
      W.closeModal()
      action?.()
    },
    'edit-info': () => {
      if (!W.available(W.project(s.config))) {
        W.toast('主机离线，恢复连接后可编辑')
        return
      }
      if (W.project(s.config).pending) {
        W.toast('合入并更新后可继续编辑')
        return
      }
      s.editing = !s.editing
      W.renderConfig()
      if (s.editing) {
        W.$('field-name').focus()
      }
    },
    'reset-draft': () => {
      s.draft = Object.fromEntries(W.fields.map(([key]) => [key, W.project(s.config)[key] || '']))
      W.renderConfig()
    },
    'review-info': () => {
      if (W.available(W.project(s.config)) && W.dirty() && s.draft.name.trim()) {
        W.reviewInfo()
      }
    },
    'save-info': () => {
      const p = W.project(s.config)
      if (!W.available(p)) {
        W.$('info-error').hidden = false
        W.$('info-error').textContent = '主机已离线，修改已保留。恢复连接后再提交。'
        return
      }
      if (s.scenario === 'info-failure') {
        W.$('info-error').hidden = false
        W.$('info-error').textContent = '提交失败，修改已保留。检查连接后重试。'
        return
      }
      const values = Object.fromEntries(W.fields.map(([key]) => [key, s.draft[key].trim()]))
      if (p.remote) {
        p.pending = values
      } else {
        Object.assign(p, values)
      }
      s.editing = false
      s.draft = Object.fromEntries(W.fields.map(([key]) => [key, p[key] || '']))
      W.closeModal()
      W.render()
      W.toast(p.remote ? '项目信息已提交，等待合入' : '已保存到本机')
    },
    'apply-merged': () => {
      const p = W.project(s.config)
      Object.assign(p, p.pending)
      delete p.pending
      s.draft = Object.fromEntries(W.fields.map(([key]) => [key, p[key] || '']))
      W.render()
      W.toast('原型演示：已更新到合入后的信息')
    },
    'simulate-add': () => {
      const count = s.projects.filter((p) => p.id.startsWith('new-')).length + 1
      const id = `new-${count}`
      s.projects.push({
        id,
        name: count === 1 ? '新项目' : `新项目 ${count}`,
        builder: '',
        brief: '',
        benchmark: '',
        opportunity: '',
        hosts: ['local'],
        version: null,
        goals: [],
        kind: 'folder',
        remote: '',
        path: `E:/projects/${id}`
      })
      openProject(id)
    },
    'simulate-clone': () => {
      const p = W.project(s.active)
      if (!p.hosts.includes('local')) {
        p.hosts.unshift('local')
      }
      openProject(p.id)
    },
    theme: () => {
      const dark = document.documentElement.dataset.theme !== 'dark'
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      document.querySelector('[data-action="theme"]').textContent = dark ? '浅色' : '深色'
    },
    reset: () => guarded(() => reset())
  }
  document.addEventListener('click', (event) => {
    if (
      repoMenu &&
      !event.target.closest('#repo-picker') &&
      !repoMenu.trigger.contains(event.target)
    ) {
      closeRepoMenu()
    }
    document.querySelectorAll('.project-menu[open]').forEach((menu) => {
      if (!menu.contains(event.target)) {
        menu.open = false
      }
    })
    const el = event.target.closest('[data-action]')
    if (!el || el.disabled) {
      return
    }
    const action = actions[el.dataset.action]
    if (el.dataset.action === 'reuse') {
      goReuse(el.dataset.id)
    } else {
      action?.(el.dataset.id, el)
    }
  })
  document.addEventListener('input', (event) => {
    const el = event.target
    if (el.id === 'project-search') {
      s.query = el.value
      W.renderGrid()
    } else if (el.id.startsWith('field-') && s.draft) {
      s.draft[el.id.slice(6)] = el.value
      W.renderConfigFooter()
    }
  })
  document.addEventListener('change', (event) => {
    const el = event.target
    if (el.id === 'scenario') {
      const value = el.value
      el.value = s.scenario
      guarded(() => reset(value))
    } else if (el.id === 'viewer') {
      const value = el.value
      el.value = s.viewer
      guarded(() => {
        clearConfig()
        s.viewer = value
        s.mode = 'wall'
        W.$('viewer').value = value
        W.render()
      })
    } else if (el.id === 'project-visibility') {
      const p = W.project(s.config)
      if (!p.hosts.includes('local') || s.viewer !== 'self') {
        return
      }
      p.sharing = { ...p.sharing, local: el.value }
      if (s.mode === 'wall') {
        W.renderWall()
      }
      W.toast('项目类型已保存到本机')
    }
  })
  W.$('dialog').addEventListener('cancel', (event) => {
    event.preventDefault()
    s.pendingLeave = null
    W.closeModal()
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && repoMenu) {
      const trigger = repoMenu.trigger
      closeRepoMenu()
      trigger.focus()
      return
    }
    if (event.key === 'Escape' && document.querySelector('.project-menu[open]')) {
      const menu = document.querySelector('.project-menu[open]')
      menu.open = false
      menu.querySelector('summary').focus()
      return
    }
    if (event.key === 'Escape' && !W.$('dialog').open && s.config) {
      closeConfig()
    }
  })
  reset()
})()
