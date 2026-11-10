;(() => {
  const W = window.WallProto
  const { state: s, esc } = W
  let toastTimer
  let addTimer
  let focusReturn
  const attachRepos = (target, entries) => {
    const key = (value) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
    const existing = new Set(
      [target.path, ...(target.extraRepos || []).map((r) => r.path)].map(key)
    )
    const added = entries.filter((entry) => {
      const entryKey = key(entry.path)
      if (existing.has(entryKey)) {
        return false
      }
      existing.add(entryKey)
      return true
    })
    target.extraRepos = [...(target.extraRepos || []), ...added]
    return added.length
  }
  const remember = () => {
    if (s.active) {
      s.remembered[s.active] = { workspace: s.workspace, newSession: s.newSession, host: s.host }
      s.workspaceSessions[`${s.active}:${s.workspace}`] = s.newSession
    }
  }
  W.cancelAdd = () => clearTimeout(addTimer)
  W.toast = (text) => {
    clearTimeout(toastTimer)
    W.$('toast').textContent = text
    W.$('toast').hidden = false
    toastTimer = setTimeout(() => {
      W.$('toast').hidden = true
    }, 3500)
  }
  const closeConfig = () => {
    const id = s.config
    s.config = null
    s.draft = null
    W.render()
    if (focusReturn?.isConnected) {
      focusReturn.focus()
    } else {
      document.querySelector(`[data-action="config"][data-id="${id}"]`)?.focus()
    }
  }
  const guarded = (action) => {
    if (!W.dirty()) {
      action()
      return
    }
    s.pendingLeave = action
    W.modal(
      '还有未保存的变更',
      '<p class="muted">离开会丢弃本次编辑。</p><div class="modal-foot"><button class="btn btn-secondary" data-action="close-dialog">继续编辑</button><button class="btn btn-ghost" data-action="discard">丢弃并离开</button></div>',
      'leave'
    )
  }
  const openProject = (id, pinnedWorkspace) =>
    guarded(() => {
      const p = W.project(id)
      if (!p) {
        return
      }
      if (!W.available(p)) {
        W.offlineDialog(p)
        return
      }
      remember()
      s.active = id
      s.config = null
      s.draft = null
      s.host = p.hosts.includes('local') ? 'local' : p.hosts.find((h) => W.hosts[h].online)
      const saved = s.remembered[id]
      s.workspace = pinnedWorkspace || saved?.workspace || (p.kind === 'folder' ? p.name : 'main')
      s.newSession = s.workspaceSessions[`${id}:${s.workspace}`] || false
      if (saved?.host && p.hosts.includes(saved.host) && W.hosts[saved.host].online) {
        s.host = saved.host
      }
      W.closeModal()
      W.render()
      W.$('main').focus()
    })
  const openConfig = (id, trigger) =>
    guarded(() => {
      const p = W.project(id)
      W.closeModal()
      s.config = id
      s.draft = Object.fromEntries(W.fields.map(([key]) => [key, p[key] || '']))
      focusReturn = trigger
      W.render()
      W.$('field-name')?.focus()
    })
  const reset = (scenario = s.scenario) => {
    clearTimeout(addTimer)
    W.closeModal()
    W.hosts.lab.online = false
    delete W.hosts.extra
    Object.assign(s, {
      projects: scenario === 'empty' ? [] : W.fixtures(),
      active: null,
      config: null,
      draft: null,
      query: '',
      filter: 'all',
      category: 'all',
      view: 'projects',
      viewer: 'self',
      remembered: {},
      workspaceSessions: {},
      workspace: 'main',
      scenario,
      addHost: 'local',
      addToProject: null,
      updated: '刚刚更新',
      newSession: false
    })
    if (scenario === 'many') {
      const names = ['接口调试工具', '资料整理', '实验记录', '小型自动化', '文档站点', '桌面助手']
      names.forEach((name, i) =>
        s.projects.push({
          ...W.fixtures().find((p) => p.id === 'shun'),
          id: `extra-${i}`,
          name,
          path: `E:/projects/project-${i}`,
          remote: `github.com/example/project-${i}`
        })
      )
    }
    W.$('scenario').value = scenario
    W.$('viewer').value = 'self'
    W.render()
    if (scenario === 'stale' || scenario === 'cross-version') {
      const d = s.projects[0].delivery
      if (scenario === 'stale') {
        Object.assign(d, {
          handshake: '未知',
          plan: '未知',
          development: '未知',
          acceptance: '未知',
          pr: '上次读取已陈旧，需重新核对',
          devPr: '当前实现 PR 状态未读回',
          verdict: null,
          note: '已有承诺可读，但当前阶段依据不新鲜；不以旧记录表示当前正常。'
        })
      } else {
        Object.assign(d, {
          acceptance: '未知',
          verdict: '读到 v0.8 的验收记录，与 v0.9 不匹配',
          note: '跨版或不同承诺的验收不能确认当前版本。保留原始记录，当前结果为未知。'
        })
      }
    }
    if (scenario === 'future' || scenario === 'cross-promise') {
      Object.assign(s.projects[0].delivery, {
        acceptance: '未知',
        verdict:
          scenario === 'future'
            ? '记录标注 2026-11-18，晚于示例观察日，暂不作为已发生事实'
            : '读到同版本的另一承诺验收，不能证明当前承诺达成',
        note: '保留原始依据；当前结果显示未知，不用无效记录置绿。'
      })
    }
    if (scenario === 'add-failure') {
      W.addChoice()
    }
    if (scenario === 'info-failure') {
      openConfig('bw')
    }
    if (scenario === 'merged') {
      s.projects[0].pending = {
        name: 'Builder Workbench',
        brief: '统一项目入口，让日常工作更连贯。',
        benchmark: '',
        opportunity: ''
      }
      s.projects[0].merged = true
      openConfig('bw')
    }
    W.render()
  }
  const updateDraft = (target) => {
    s.draft[target.dataset.field] = target.value
    const changed = W.fields.filter(
      ([key]) => s.draft[key].trim() !== (W.project(s.config)[key] || '').trim()
    ).length
    W.$('review-info').disabled = !changed || !s.draft.name.trim()
    W.$('review-info').textContent = changed ? `查看 ${changed} 项变更` : '查看变更'
    W.$('config-status').textContent = !s.draft.name.trim()
      ? '项目名称不能为空'
      : changed
        ? '未保存的变更'
        : '可按需编辑项目信息'
  }
  const addError = (message) => {
    W.$('add-error').innerHTML = message
    W.$('add-error').hidden = false
  }
  const confirmAdd = () => {
    const mode = s.addMode
    const rawPath =
      mode === 'folder' ? W.$('add-path').value.trim() : W.$('add-parent').value.trim()
    const url = mode === 'clone' ? W.$('add-url').value.trim() : ''
    if (!rawPath || !/^(?:[a-z]:[/\\]|[/])/i.test(rawPath)) {
      addError('填写完整的文件夹路径。')
      return
    }
    if (mode === 'clone' && !/^(https?:\/\/|git@|ssh:\/\/)/i.test(url)) {
      addError('填写有效的 Git 地址，例如 https://github.com/example/project.git。')
      return
    }
    const parts = (mode === 'clone' ? url : rawPath)
      .replace(/\.git$/, '')
      .split(/[/\\]/)
      .filter(Boolean)
    const name = mode === 'create' ? W.$('add-name').value.trim() : parts.at(-1)
    if (!name || /[<>:"/\\|?*]/.test(name)) {
      addError('项目名称不能为空，也不能包含路径分隔符。')
      return
    }
    if (s.scenario === 'add-failure') {
      addError(
        '无法访问目标目录。检查目录权限或更换文件夹后重试。<br/><button class="inline-link" data-action="retry-add">重新检查并重试</button>'
      )
      return
    }
    const path =
      mode === 'folder' ? rawPath.replace(/\\/g, '/') : `${rawPath.replace(/[/\\]$/, '')}/${name}`
    const canonical = url
      .replace(/\.git$/, '')
      .replace(/^https?:\/\//, '')
      .toLowerCase()
    const existing = s.projects.find(
      (p) =>
        (p.path.toLowerCase() === path.toLowerCase() && p.hosts.includes(s.addHost)) ||
        (canonical && p.remote.toLowerCase() === canonical)
    )
    if (existing) {
      if (!existing.hosts.includes(s.addHost)) {
        existing.hosts.push(s.addHost)
        W.toast('已添加副本，沿默认个人展示；共享属性请在所属主机自行设置')
        openProject(existing.id)
      } else {
        addError(
          `项目已存在，无需重复添加。<br/><button class="inline-link" data-action="open" data-id="${existing.id}">打开 ${esc(existing.name)}</button>`
        )
      }
      return
    }
    const kind = mode === 'create' ? W.$('add-kind').value : path === 'E:/notes' ? 'folder' : 'git'
    const p = {
      id: `added-${Date.now()}`,
      name,
      brief: '',
      benchmark: '',
      opportunity: '',
      hosts: [s.addHost],
      version: null,
      sessions: 0,
      prs: mode === 'clone' ? null : kind === 'git' ? 0 : null,
      kind,
      remote: canonical,
      path,
      charter: false
    }
    const commit = () => {
      if (s.addToProject) {
        const target = W.project(s.addToProject)
        const added = attachRepos(target, [{ name: p.name, path: p.path }])
        s.addToProject = null
        W.closeModal()
        openConfig(target.id)
        W.toast(
          added ? '已将代码仓加入当前项目；沿原生分组登记' : '代码仓已在当前项目中，无需重复添加'
        )
        return
      }
      s.projects.unshift(p)
      openProject(p.id)
      W.toast(`已添加 ${p.name}`)
    }
    if (mode === 'clone') {
      W.$('confirm-add').disabled = true
      W.$('confirm-add').textContent = '正在克隆…'
      addTimer = setTimeout(commit, 700)
    } else {
      commit()
    }
  }
  const saveInfo = () => {
    if (s.scenario === 'info-failure') {
      W.$('info-error').innerHTML =
        '提交失败，编辑内容已保留。检查连接后重试。<br/><button class="inline-link" data-action="retry-info">重新连接并重试</button>'
      W.$('info-error').hidden = false
      return
    }
    const p = W.project(s.config)
    const update = Object.fromEntries(W.fields.map(([key]) => [key, s.draft[key].trim()]))
    if (p.remote) {
      p.pending = update
      W.toast('已创建项目信息 PR，等待合入')
    } else {
      Object.assign(p, update, { charter: true })
      W.toast('项目信息已保存')
    }
    s.draft = Object.fromEntries(W.fields.map(([key]) => [key, p[key] || '']))
    W.closeModal()
    W.render()
  }
  const actions = {
    wall: () =>
      guarded(() => {
        remember()
        s.active = null
        s.config = null
        s.draft = null
        W.closeModal()
        W.render()
      }),
    workspace: () => (s.active ? W.renderWorkspace() : W.toast('从项目墙选择一个项目')),
    open: (id) => openProject(id),
    'open-pinned': (id) => openProject(id, 'main'),
    config: (id, target) => openConfig(id || s.active, target),
    'close-config': () => guarded(closeConfig),
    'close-dialog': () => {
      clearTimeout(addTimer)
      W.closeModal()
    },
    discard: () => {
      const next = s.pendingLeave
      s.pendingLeave = null
      s.draft = null
      s.config = null
      W.closeModal()
      W.render()
      next?.()
    },
    journey: W.journey,
    overview: (id) => guarded(() => W.overview(id || s.active)),
    view: (id) => {
      s.view = id
      W.renderWall()
    },
    category: (id) => {
      s.category = id
      W.renderWall()
    },
    'workspace-options': W.workspaceOptions,
    'apply-workspace-options': () => {
      s.sort = W.$('workspace-sort').value
      W.closeModal()
      W.renderWorkspace()
      W.toast('示例已保留原生排序选择；项目范围固定为当前项目')
    },
    'choose-workspace': (id) => {
      remember()
      s.workspace = id
      s.newSession = s.workspaceSessions[`${s.active}:${id}`] || false
      remember()
      W.renderWorkspace()
    },
    'new-workspace': () =>
      W.modal(
        '新建工作区',
        '<div class="field"><label for="workspace-name">名称</label><input id="workspace-name" class="input" value="临时排查" /></div><p class="form-hint">沿用原生创建器；无需先关联版本。</p><div class="modal-foot"><button class="btn btn-primary" data-action="confirm-workspace">创建并打开</button></div>',
        'new-workspace'
      ),
    'confirm-workspace': () => {
      s.workspace = W.$('workspace-name').value.trim() || '临时排查'
      W.project(s.active).extraWorkspace = s.workspace
      s.newSession = false
      remember()
      W.closeModal()
      W.renderWorkspace()
    },
    'clone-local': (id) =>
      guarded(() => {
        s.addHost = 'local'
        W.addForm('clone')
        W.$('add-url').value = `https://${W.project(id).remote}.git`
      }),
    'account-repos': W.accountRepos,
    'select-account-repo': (id) => {
      W.addForm('clone')
      W.$('add-url').value = id
    },
    'scan-repos': W.scanRepos,
    'confirm-scan': () => {
      const chosen = [...document.querySelectorAll('[name="scan-repo"]:checked')].map(
        (e) => e.value
      )
      if (!chosen.length) {
        W.toast('至少选择一个代码仓')
        return
      }
      if (s.addToProject) {
        const target = W.project(s.addToProject)
        const added = attachRepos(
          target,
          chosen.map((name) => ({ name, path: `E:/projects/${name}` }))
        )
        s.addToProject = null
        W.closeModal()
        openConfig(target.id)
        W.toast(
          added ? `已将 ${added} 个代码仓加入当前项目` : '所选代码仓已在当前项目中，无需重复添加'
        )
        return
      }
      let last
      for (const name of chosen) {
        last = `scan-${name}`
        if (!W.project(last)) {
          s.projects.push({
            id: last,
            name,
            hosts: [s.addHost],
            path: `${s.addHost === 'local' ? 'E:/projects' : '/home/projects'}/${name}`,
            remote: '',
            kind: 'git',
            brief: '',
            version: null,
            sessions: 0,
            prs: 0
          })
        }
      }
      openProject(last)
      W.toast('已添加所选代码仓；无需名片，可在项目墙逐项设置')
    },
    'add-repo': () => {
      const targetId = s.config
      guarded(() => {
        s.addToProject = targetId
        s.addHost = 'local'
        W.addForm('folder')
      })
    },
    'remove-extra-repo': (id) => {
      const p = W.project(s.config)
      p.extraRepos.splice(Number(id), 1)
      W.renderConfig()
      W.toast('已移除登记，磁盘文件保留')
    },
    'remove-repo': () => {
      const p = W.project(s.config)
      if (!p.hosts.includes('local')) {
        W.toast('此处没有本机登记可移除')
        return
      }
      W.modal(
        '移除本机登记',
        `<p>从本机列表移除 ${esc(p.name)}。磁盘文件、工作树和其他主机副本保留。</p><div class="modal-foot"><button class="btn btn-secondary" data-action="close-dialog">取消</button><button class="btn btn-primary" data-action="confirm-remove">移除登记</button></div>`,
        'remove'
      )
    },
    'confirm-remove': () => {
      const p = W.project(s.config)
      p.hosts = p.hosts.filter((h) => h !== 'local')
      if (!p.hosts.length) {
        s.projects = s.projects.filter((q) => q.id !== p.id)
      }
      s.active = null
      s.config = null
      s.draft = null
      W.closeModal()
      W.render()
      W.toast('已移除本机登记，文件未删除')
    },
    'refresh-hosts': () => {
      W.hostDialog()
      W.toast('已重读共享清单；示例地址已更新，离线项目仍保留')
    },
    delivery: W.deliveryDetail,
    theme: (_, target) => {
      const dark = document.documentElement.dataset.theme !== 'dark'
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      target.textContent = dark ? '浅色' : '深色'
    },
    reset: () => guarded(() => reset()),
    filter: (id) => {
      s.filter = id
      W.renderWall()
    },
    'clear-filter': () => {
      s.query = ''
      s.filter = 'all'
      s.category = 'all'
      W.renderWall()
    },
    refresh: () =>
      guarded(() => {
        s.updated = '刚刚更新'
        W.renderWall()
        W.toast(s.scenario === 'error' ? '主机列表仍未读全，可重试连接' : '项目墙已刷新')
      }),
    'retry-host': () => {
      s.scenario = 'mixed'
      W.$('scenario').value = 'mixed'
      W.renderWall()
      W.toast('主机项目列表已更新')
    },
    add: () =>
      guarded(() => {
        s.addToProject = null
        W.addChoice()
      }),
    'add-mode': W.addForm,
    browse: W.browse,
    'choose-path': (path) => {
      W.addForm(s.addMode)
      Object.entries(s.addSnapshot).forEach(([id, value]) => {
        if (W.$(id)) {
          W.$(id).value = value
        }
      })
      W.$(s.browseTarget).value = path
    },
    'cancel-browse': () => {
      W.addForm(s.addMode)
      Object.entries(s.addSnapshot).forEach(([id, value]) => {
        if (W.$(id)) {
          W.$(id).value = value
        }
      })
    },
    'confirm-add': confirmAdd,
    'retry-add': () => {
      s.scenario = 'mixed'
      W.$('scenario').value = 'mixed'
      confirmAdd()
    },
    hosts: () => guarded(W.hostDialog),
    reconnect: (id) => {
      W.hosts[id].online = true
      W.hostDialog()
      W.render()
      W.toast('连接已恢复；项目读数仍待重新读取')
    },
    'pair-host': () => {
      const code = W.$('pairing-code').value.trim()
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(code)) {
        W.$('pair-error').textContent = '配对地址无效，重新复制主机分享的完整地址。'
        W.$('pair-error').hidden = false
        return
      }
      W.hosts.extra = { name: '新连接主机', online: true }
      if (!W.project('shared')) {
        s.projects.push({
          ...W.fixtures().find((p) => p.id === 'shun'),
          id: 'shared',
          name: '共享示例项目',
          path: '/home/project/shared',
          remote: 'github.com/example/shared',
          hosts: ['extra'],
          sharing: { extra: 'team' }
        })
      }
      W.closeModal()
      s.active = null
      W.render()
      W.toast('已连接主机，项目已显示在墙上')
    },
    'import-hosts': () =>
      W.modal(
        '导入主机清单',
        '<p class="muted">批量连接清单中的主机，随后读取其项目目录。</p><div class="field"><label for="hosts-file">主机清单</label><select class="input" id="hosts-file"><option>builder-workbench-hosts.json · 2 台主机</option></select></div><div class="modal-foot"><button class="btn btn-ghost" data-action="hosts">返回</button><button class="btn btn-primary" data-action="confirm-import">导入主机</button></div>',
        'import'
      ),
    'confirm-import': () => {
      for (const p of W.fixtures().filter((p) => p.id === 'ops' || p.id === 'lab')) {
        if (!W.project(p.id)) {
          s.projects.push(p)
        }
      }
      W.closeModal()
      s.active = null
      W.render()
      W.toast('研发主机已连接；实验室主机离线，可在主机管理中重试')
    },
    'review-info': W.reviewInfo,
    'save-info': saveInfo,
    'retry-info': () => {
      s.scenario = 'mixed'
      W.$('scenario').value = 'mixed'
      saveInfo()
    },
    'preview-pr': () =>
      W.modal(
        '项目信息待合入',
        `<p class="muted">共享信息尚未生效。此处仅演示已有 PR 的交接，产品中的合入由人在代码平台完成。</p><table class="review-table"><tbody>${W.fields
          .map(
            ([key, label]) =>
              `<tr><th>${label}</th><td>${esc(
                W.project(s.config).pending[key] || '未填写'
              )}</td></tr>`
          )
          .join(
            ''
          )}</tbody></table><div class="modal-foot"><button class="btn btn-secondary" data-action="close-dialog">返回</button></div>`,
        'pending'
      ),
    'apply-info': () => {
      const p = W.project(s.config)
      Object.assign(p, p.pending, { pending: null, merged: false, charter: true })
      s.draft = Object.fromEntries(W.fields.map(([key]) => [key, p[key] || '']))
      W.render()
      W.toast('已更新项目信息')
    },
    'start-session': () => {
      s.newSession = true
      remember()
      W.renderWorkspace()
      W.toast('示例会话已打开；原型不会运行模型')
    },
    handoff: (name) => {
      const p = W.project(s.dialog === 'delivery' ? s.deliveryId : s.active)
      const ref = name.includes('计划')
        ? '../version-planning/planning-journey-prototype.html'
        : name.includes('验收')
          ? '../version-acceptance/acceptance-journey-prototype.html'
          : null
      W.modal(
        name,
        `<p class="muted">沿用现有「${esc(name)}」界面${
          p ? `，带入 ${esc(p.name)}${p.version ? ` / ${esc(p.version)}` : ''} 上下文` : ''
        }。此处是复用交接点，不是该页面的运行验证。</p>${name.includes('验收') ? W.motto : ''}${ref ? `<a class="btn btn-secondary" href="${ref}" target="_blank" rel="noopener">查看已有旅程原型</a><p class="form-hint">打开的是已有设计资产，示例数据独立，不携带当前项目状态。</p>` : ''}<div class="modal-foot"><button class="btn btn-secondary" data-action="close-dialog">返回</button></div>`,
        'handoff'
      )
    }
  }
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]')
    if (!target || target.disabled) {
      return
    }
    actions[target.dataset.action]?.(target.dataset.id, target)
  })
  document.addEventListener('input', (event) => {
    if (event.target.id === 'project-search') {
      s.query = event.target.value
      W.renderGrid()
    }
    if (event.target.dataset.field) {
      updateDraft(event.target)
    }
  })
  document.addEventListener('change', (event) => {
    if (event.target.id === 'viewer') {
      const viewer = event.target.value
      event.target.value = s.viewer
      guarded(() => {
        remember()
        s.viewer = viewer
        s.active = null
        s.config = null
        s.draft = null
        W.$('viewer').value = viewer
        W.render()
      })
    }
    if (event.target.id === 'project-visibility') {
      const p = W.project(s.config)
      p.sharing = { ...p.sharing, local: event.target.value }
      W.render()
      W.toast('本机展示属性已保存；无 PR，既有工作区不受影响')
    }
    if (event.target.id === 'scenario') {
      const requested = event.target.value
      event.target.value = s.scenario
      guarded(() => {
        reset(requested)
      })
    }
    if (event.target.id === 'add-host') {
      s.addHost = event.target.value
      W.addChoice()
    }
    if (event.target.id === 'workspace-host') {
      s.host = event.target.value
      W.renderWorkspace()
    }
  })
  W.$('dialog').addEventListener('cancel', () => {
    clearTimeout(addTimer)
    s.dialog = ''
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !W.$('dialog').open && s.config) {
      guarded(closeConfig)
    }
  })
  reset('mixed')
})()
