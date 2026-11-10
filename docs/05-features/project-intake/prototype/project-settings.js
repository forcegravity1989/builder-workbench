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
    W.$('toast').classList.remove('failure-toast')
    W.$('toast').setAttribute('role', 'status')
    W.$('toast').textContent = message
    W.$('toast').hidden = false
    toastTimer = setTimeout(() => {
      W.$('toast').hidden = true
    }, 3000)
  }
  const submissionFailed = (message) => {
    clearTimeout(toastTimer)
    W.closeModal()
    s.savedDrafts[s.config] = { ...s.draft }
    s.failure = { id: s.config, message }
    const toast = W.$('toast')
    toast.classList.add('failure-toast')
    toast.setAttribute('role', 'alert')
    toast.innerHTML = `<div class="notice-heading"><strong>项目信息未提交</strong>${W.button('dismiss-notice', 'x', '关闭通知')}</div><p>${W.esc(message)} 输入已保留，可开会话让模型协助处理。</p><div class="notice-actions"><button class="btn btn-secondary" data-action="retry-info">重试</button><button class="btn btn-primary" data-action="repair-help">开会话处理</button></div>`
    toast.hidden = false
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
      '<p>离开会丢弃本次项目信息修改。</p><footer class="modal-foot"><button class="btn btn-secondary" data-action="close-dialog">继续编辑</button><button class="btn btn-ghost" data-action="discard">丢弃并离开</button></footer>'
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
    const repos = W.repoSlots(p)
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
  const memberAction = (target, key) => {
    const [id, repoId] = key.split('::')
    const repo = W.repoSlots(W.project(id)).find((item) => item.id === repoId)
    if (repo) {
      selectRepo(target, id, repo)
    }
  }
  const openConfig = (id, trigger, afterOpen) =>
    guarded(() => {
      const p = W.project(id)
      if (!p) {
        return
      }
      s.config = id
      s.editing = Boolean(s.savedDrafts[id])
      s.draft = s.savedDrafts[id]
        ? { ...s.savedDrafts[id] }
        : Object.fromEntries(W.fields.map(([key]) => [key, p[key] || '']))
      configTrigger = trigger
      W.closeModal()
      W.render()
      W.$('project-visibility').focus()
      afterOpen?.()
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
      savedDrafts: {},
      failure: null,
      failureSimulated: false,
      groupExample: null,
      sidebarCollapsed: false,
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
      W.project('bw').reviewState = 'merged'
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
    'native-menu': (id) =>
      goReuse(W.project(id).group ? 'native-group-menu' : 'native-project-menu', id),
    'native-create': (id) => goReuse('native-create', id),
    'repo-workspace': (id) => memberAction('workspace', id),
    'repo-create': (id) => memberAction('native-create', id),
    'repo-menu': (id) => memberAction('native-project-menu', id),
    'sidebar-collapse': () => {
      s.sidebarCollapsed = !s.sidebarCollapsed
      W.renderSidebar()
    },
    config: openConfig,
    'open-repo': (id, el) => openRepo('open-repo', id, el),
    'repo-settings': (id, el) => openRepo('repo-settings', id, el),
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
      delete s.savedDrafts[s.config]
      W.$('toast').hidden = true
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
    'cancel-edit': () => {
      s.draft = Object.fromEntries(W.fields.map(([key]) => [key, W.project(s.config)[key] || '']))
      delete s.savedDrafts[s.config]
      s.editing = false
      W.$('toast').hidden = true
      W.closeModal()
      W.renderConfig()
    },
    'review-info': () => {
      if (W.dirty() && s.draft.name.trim()) {
        W.reviewInfo()
      }
    },
    'save-info': () => {
      if (!W.dirty() || !s.draft.name.trim()) {
        W.closeModal()
        W.$('field-name')?.focus()
        return
      }
      const p = W.project(s.config)
      if (!W.available(p)) {
        submissionFailed('项目所在主机已离线。')
        return
      }
      if (s.scenario === 'info-failure' && !s.failureSimulated) {
        s.failureSimulated = true
        submissionFailed('未能连接代码托管服务。')
        return
      }
      const values = Object.fromEntries(W.fields.map(([key]) => [key, s.draft[key].trim()]))
      if (p.remote) {
        p.pending = values
        p.reviewState = 'open'
      } else {
        Object.assign(p, values)
      }
      s.editing = false
      delete s.savedDrafts[p.id]
      s.draft = Object.fromEntries(W.fields.map(([key]) => [key, p[key] || '']))
      W.closeModal()
      W.render()
      W.toast(p.remote ? '项目信息已提交评审' : '已保存到本机')
    },
    'dismiss-notice': () => {
      W.$('toast').hidden = true
    },
    'retry-info': () => {
      if (!s.failure) {
        return
      }
      if (s.config === s.failure.id) {
        if (W.reviewInfo()) {
          W.$('toast').hidden = true
        }
      } else {
        openConfig(s.failure.id, undefined, () => {
          if (W.reviewInfo()) {
            W.$('toast').hidden = true
          }
        })
      }
    },
    'repair-help': () => {
      if (!s.failure) {
        return
      }
      const id = s.failure.id
      const launch = () => {
        s.active = id
        clearConfig()
        s.mode = 'reuse'
        s.reuse = 'repair-session'
        s.repoContext = ''
        W.$('toast').hidden = true
        W.closeModal()
        W.render()
      }
      if (s.config === id) {
        s.savedDrafts[id] = { ...s.draft }
        launch()
      } else {
        guarded(launch)
      }
    },
    'return-draft': () => {
      s.mode = 'wall'
      s.reuse = null
      openConfig(s.failure.id)
    },
    'view-review': () => goReuse('charter-pr'),
    'simulate-reviewed': () => {
      W.project(s.config).reviewState = 'merged'
      W.renderConfig()
    },
    'apply-merged': () => {
      const p = W.project(s.config)
      Object.assign(p, p.pending)
      delete p.pending
      delete p.reviewState
      s.draft = Object.fromEntries(W.fields.map(([key]) => [key, p[key] || '']))
      W.render()
      W.toast('原型演示：已更新到合入后的信息')
    },
    'simulate-ungroup': () => {
      const p = W.project('shun')
      s.groupExample = structuredClone(p)
      const members = W.repoSlots(p).map((repo) => ({
        ...p,
        ...repo,
        group: false,
        repos: undefined,
        hosts: [repo.host || 'local']
      }))
      s.projects.splice(s.projects.indexOf(p), 1, ...members)
      s.active = null
      s.mode = 'wall'
      W.render()
    },
    'simulate-group': () => {
      const p = s.groupExample
      const ids = W.repoSlots(p).map((repo) => repo.id)
      s.projects = s.projects.filter((project) => !ids.includes(project.id))
      s.projects.push(p)
      s.groupExample = null
      s.active = null
      s.mode = 'wall'
      W.render()
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
      if (s.savedDrafts[s.config]) {
        s.savedDrafts[s.config] = { ...s.draft }
      }
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
    if (event.key === 'Escape' && W.$('info-confirm').matches(':popover-open')) {
      W.closeInfoReview()
      event.preventDefault()
      return
    }
    if (event.key === 'Escape' && !W.$('dialog').open && s.config) {
      closeConfig()
    }
  })
  reset()
})()
