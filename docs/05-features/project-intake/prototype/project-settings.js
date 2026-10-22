// Prototype fixtures only. Production behavior and pending decisions live in spec.md.
;(() => {
  const $ = (id) => document.getElementById(id)
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    )
  const icons = {
    x: '<path d="m18 6-12 12M6 6l12 12"/>',
    refresh:
      '<path d="M3 11a9 9 0 0 1 15.36-6.36L21 7M21 3v4h-4M21 13a9 9 0 0 1-15.36 6.36L3 17m4 0H3v4"/>',
    'file-import':
      '<path d="M12 22h6a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v5m10-7v6h6M2 15h10m-4-4 4 4-4 4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M6 15h4m4-6h4m-4 4h4"/>',
    git: '<circle cx="6" cy="3" r="2"/><path d="M6 5v12m12-9a6 6 0 0 1-6 6H6"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="19" r="2"/>',
    folder:
      '<path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    users:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
    user: '<path d="M20 21v-2a7 7 0 0 0-14 0v2"/><circle cx="13" cy="7" r="4"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    settings: '<path d="M21 4h-7m-4 0H3m18 8h-9m-4 0H3m18 8h-5m-4 0H3M14 2v4m-6 4v4m8 4v4"/>',
    external:
      '<path d="M15 3h6v6m0-6-9 9M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>'
  }
  const icon = (name, className = '') =>
    `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`
  document.querySelectorAll('[data-icon]').forEach((el) => {
    el.outerHTML = icon(el.dataset.icon, el.className)
  })
  const fields = [
    ['name', '项目名称'],
    ['brief', '想做什么'],
    ['benchmark', '对标'],
    ['opportunity', '愿景']
  ]
  const fixtures = [
    {
      name: 'Builders’ Workbench',
      brief: '你定方向，AI 跑完能跑的。',
      benchmark: 'Claude Code / Linear',
      opportunity: '让一个 Builder 能独立完成一次产品迭代。',
      repo: 'builder-workbench',
      remote: 'github.com/forcegravity1989/builder-workbench',
      path: 'D:\\projects\\builders-workbench'
    },
    {
      name: 'Field Notes',
      brief: '把实地观察整理成团队可用的研究材料。',
      benchmark: 'Notion',
      opportunity: '让每次访谈都有可追溯的发现与下一步。',
      repo: 'field-notes',
      remote: 'github.com/example/field-notes',
      path: 'D:\\projects\\field-notes'
    }
  ]
  const computers = [
    { name: '开发电脑', device: 'DEV-PC', location: '本机' },
    { name: '构建 Mac mini', device: 'BUILD-MAC', location: '远程' }
  ]
  // People are separate design fixtures; machine names do not establish membership or ownership.
  const teams = [
    { owner: '陈舟', members: ['陈舟', '林溪'] },
    { owner: '林溪', members: ['林溪'] }
  ]
  let projects,
    projectStates,
    selected = 0,
    baseline,
    draft,
    editing = false,
    phase = 'clean',
    scenario = 'normal',
    leaveAction,
    toastTimer
  let openSections = { information: true, members: false, repositories: false, hosts: false }
  const narrowQuery = window.matchMedia('(max-width: 680px)')
  const syncSurfaces = () => {
    const covered = narrowQuery.matches && !$('rail').hidden
    document.querySelector('.wall').inert = covered
    document.querySelector('.app-nav').inert = covered
  }
  narrowQuery.addEventListener('change', syncSurfaces)
  const changes = () => fields.filter(([key]) => draft[key].trim() !== baseline[key].trim())
  const dirty = () => changes().length > 0
  const toast = (message) => {
    clearTimeout(toastTimer)
    $('toast').textContent = message
    $('toast').hidden = false
    toastTimer = setTimeout(() => {
      $('toast').hidden = true
    }, 3500)
  }

  function renderWall() {
    $('project-cards').innerHTML = projects
      .map(
        (
          p,
          index
        ) => `<article class="project-card ${index === selected && !$('rail').hidden ? 'selected' : ''}">
      <a class="card-open" href="#project-${index}" data-open-project="${index}" aria-label="打开 ${escape(p.name)} 项目">
        <div class="card-top"><span class="card-members">${teams[index].members.map((name) => `<span class="member-tag" aria-label="Builder ${escape(name)}，状态未知"><span class="builder-dot" aria-hidden="true"></span>${escape(name)}</span>`).join('')}</span></div>
        <h2>${escape(p.name)}</h2><p class="card-vision">${escape(p.opportunity || '尚未填写愿景')}</p>
      </a>
      <div class="card-actions" role="group" aria-label="${escape(p.name)} 操作">
        <button class="btn btn-ghost btn-icon icon-action" type="button" data-open-project="${index}" aria-label="打开 ${escape(p.name)} 项目总览">${icon('external')}<span class="action-tooltip" role="tooltip">总览</span></button>
        <button class="btn btn-ghost btn-icon icon-action configure-btn" type="button" data-configure="${index}" aria-label="配置 ${escape(p.name)}" aria-pressed="${index === selected && !$('rail').hidden}">${icon('settings')}<span class="action-tooltip" role="tooltip">配置</span></button>
      </div>
    </article>`
      )
      .join('')
    syncSurfaces()
  }

  function renderInfo() {
    if (scenario === 'unreadable') {
      $('information-content').innerHTML =
        '<div class="error-message"><p>项目信息读不到</p><span>名片内容无法解析。修复后重试。</span></div><button class="btn btn-secondary" type="button" data-handoff="查看名片文件">查看文件</button><button class="btn btn-ghost" type="button" data-action="retry-read">重试读取</button>'
      return
    }
    if (editing) {
      $('information-content').innerHTML =
        `<div class="edit-fields">${fields.map(([key, label]) => `<div class="field"><label for="field-${key}">${label}${key === 'name' ? ' *' : ''}</label>${['brief', 'opportunity'].includes(key) ? `<textarea id="field-${key}" class="input" data-field="${key}">${escape(draft[key])}</textarea>` : `<input id="field-${key}" class="input" data-field="${key}" value="${escape(draft[key])}" ${key === 'name' ? 'required' : ''}>`}</div>`).join('')}</div><div id="name-error" class="error-message" role="alert" hidden>填写项目名称后再查看变更。</div><div class="section-actions"><button class="btn btn-ghost" type="button" data-action="finish-edit">收起编辑</button></div>`
      return
    }
    const sourceNote =
      phase === 'pending'
        ? '当前显示待合入的信息，项目卡片仍为现行信息。'
        : phase === 'merged'
          ? '当前显示已合入的信息，项目卡片待更新代码。'
          : '当前显示草稿，项目卡片仍为现行信息。'
    $('information-content').innerHTML =
      `<dl class="information-facts">${fields.map(([key, label]) => `<div><dt>${label}</dt><dd class="${!draft[key] ? 'muted' : ''}">${escape(draft[key] || '未填写')}</dd></div>`).join('')}</dl><div class="section-actions"><button class="btn btn-secondary" type="button" data-action="edit" ${phase === 'pending' || phase === 'merged' ? 'disabled' : ''}>${scenario === 'incomplete' ? '补充信息' : '编辑信息'}</button></div>${dirty() ? `<p class="source-note">${sourceNote}</p>` : ''}`
  }

  function renderFooter() {
    const count = changes().length
    $('review').disabled =
      !count || !draft.name.trim() || scenario === 'unreadable' || phase === 'pending'
    $('review').textContent = count ? `查看 ${count} 项变更` : '查看变更'
    $('draft-status').innerHTML = count
      ? `<span>${count} 项变更未提交</span><button class="btn btn-ghost" type="button" data-action="reset-draft">撤销变更</button>`
      : '<span class="muted">没有待提交的变更</span>'
    $('footer-note').textContent = '项目信息通过 PR 共享'
    if (phase === 'pending') {
      $('draft-status').textContent = '名片变更已提交，等待合入'
      $('review').textContent = '等待 PR 合入'
      $('review').disabled = true
      $('footer-note').textContent = '合入后仍需更新代码'
    }
    if (phase === 'merged') {
      $('draft-status').textContent = 'PR 已合入，卡片信息待更新'
      $('review').textContent = '更新代码'
      $('review').disabled = false
      $('footer-note').textContent = '更新后重新读取项目卡片'
    }
    const filled = fields.filter(([key]) => draft[key].trim()).length
    $('information-summary').textContent =
      scenario === 'unreadable'
        ? '读取失败'
        : count && phase === 'clean'
          ? `${count} 项待提交`
          : filled === 4
            ? '4 项已填写'
            : `${4 - filled} 项待补充`
    if ($('name-error')) {
      $('name-error').hidden = Boolean(draft.name.trim())
      $('field-name').setAttribute('aria-invalid', String(!draft.name.trim()))
      $('field-name').setAttribute('aria-describedby', 'name-error')
    }
  }

  function renderRail() {
    const p = projects[selected]
    $('rail-name').textContent = p.name
    $('repo-name').textContent = p.repo
    $('repo-remote').textContent = p.remote
    $('repo-path').textContent = p.path
    const team = teams[selected]
    $('members-summary').textContent = team.members.join('、')
    $('member-list').innerHTML = team.members
      .map(
        (name) =>
          `<div class="member-row">${icon('user')}<span>${escape(name)}</span>${name === team.owner ? '<span class="tag tag-neutral">负责人</span>' : ''}</div>`
      )
      .join('')
    const visibleComputers = selected === 0 ? computers : computers.slice(0, 1)
    const offline = scenario === 'offline'
    $('hosts-summary').textContent = visibleComputers
      .map((computer, index) => `${computer.name}${offline && index === 1 ? ' · 离线' : ''}`)
      .join('、')
    $('hosts-summary').classList.toggle('has-offline', offline)
    $('host-list').innerHTML = visibleComputers
      .map(
        (computer, index) =>
          `<div class="host-row">${icon('monitor')}<div class="host-copy"><strong>${escape(computer.name)}</strong><small>${computer.location} · <span class="mono">${escape(computer.device)}</span></small></div><span class="host-status ${offline && index === 1 ? 'offline' : ''}">${offline && index === 1 ? '离线' : '可用'}</span></div>`
      )
      .join('')
    $('rail-state').hidden = phase === 'clean'
    $('rail-state').innerHTML =
      phase === 'pending'
        ? '<span>名片待合入 · PR #128</span><button class="btn btn-ghost" type="button" data-handoff="查看名片 PR">查看 PR</button>'
        : phase === 'merged'
          ? '<span>PR 已合入 · 待更新代码</span><button class="btn btn-ghost" type="button" data-handoff="查看名片 PR">查看 PR</button>'
          : ''
    renderInfo()
    renderFooter()
    Object.entries(openSections).forEach(([key, open]) => {
      document.querySelector(`[data-section="${key}"]`).setAttribute('aria-expanded', String(open))
      $(`${key}-body`).hidden = !open
    })
  }

  function choose(index) {
    projectStates[selected] = { baseline: { ...baseline }, draft: { ...draft }, phase, scenario }
    selected = index
    const saved = projectStates[index]
    baseline = { ...(saved?.baseline ?? projects[index]) }
    draft = { ...(saved?.draft ?? baseline) }
    editing = false
    phase = saved?.phase ?? 'clean'
    scenario = saved?.scenario ?? 'normal'
    $('scenario').value = scenario
    $('rail').hidden = false
    renderWall()
    renderRail()
    $('close-rail').focus()
  }

  function guard(action) {
    if (dirty() && phase === 'clean') {
      leaveAction = action
      $('leave-dialog').showModal()
    } else {
      action()
    }
  }

  function reset(nextScenario = 'normal') {
    projects = fixtures.map((p) => ({ ...p }))
    projectStates = [null, null]
    selected = 0
    scenario = nextScenario
    phase = scenario === 'pending' ? 'pending' : scenario === 'merged' ? 'merged' : 'clean'
    if (scenario === 'incomplete') {
      projects[0].benchmark = ''
      projects[0].opportunity = ''
    }
    baseline = { ...projects[0] }
    draft = { ...baseline }
    if (phase === 'pending' || phase === 'merged') {
      draft.opportunity = '让一次产品迭代的目标、产物与验收结论都可追溯。'
    }
    editing = false
    openSections = {
      information: true,
      members: false,
      repositories: false,
      hosts: scenario === 'offline'
    }
    $('rail').hidden = false
    $('scenario').value = nextScenario
    $('toast').hidden = true
    renderWall()
    renderRail()
  }

  $('close-rail').addEventListener('click', () =>
    guard(() => {
      $('rail').hidden = true
      renderWall()
      document.querySelector(`[data-configure="${selected}"]`).focus()
    })
  )
  $('stay').addEventListener('click', () => $('leave-dialog').close())
  $('discard').addEventListener('click', () => {
    $('leave-dialog').close()
    draft = { ...baseline }
    renderInfo()
    renderFooter()
    leaveAction()
  })
  $('reset').addEventListener('click', () => guard(() => reset()))
  $('scenario').addEventListener('change', (event) => {
    const next = event.target.value
    event.target.value = scenario
    guard(() => reset(next))
  })
  $('theme').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark'
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    $('theme').textContent = dark ? '浅色' : '深色'
  })
  document.addEventListener('input', (event) => {
    const key = event.target.dataset.field
    if (key) {
      draft[key] = event.target.value
      renderFooter()
    }
  })
  document.addEventListener('click', (event) => {
    const projectLink = event.target.closest('[data-open-project]')
    if (projectLink) {
      event.preventDefault()
      const project = projects[Number(projectLink.dataset.openProject)]
      guard(() => {
        $('handoff-title').textContent = `打开 ${project.name}`
        $('handoff-copy').textContent = '原型演示：点击卡片进入这个项目的总览。'
        $('handoff-dialog').showModal()
      })
    }
    const config = event.target.closest('[data-configure]')
    if (config) {
      const index = Number(config.dataset.configure)
      if (index === selected && !$('rail').hidden) {
        $('close-rail').focus()
        return
      }
      guard(() => choose(index))
    }
    const toggle = event.target.closest('[data-section]')
    if (toggle) {
      const key = toggle.dataset.section
      openSections[key] = !openSections[key]
      toggle.setAttribute('aria-expanded', String(openSections[key]))
      $(`${key}-body`).hidden = !openSections[key]
    }
    const action = event.target.closest('[data-action]')?.dataset.action
    if (action === 'edit') {
      editing = true
      renderInfo()
      renderFooter()
      $('field-name').focus()
    }
    if (action === 'finish-edit') {
      if (!draft.name.trim()) {
        $('field-name').focus()
        return
      }
      editing = false
      renderInfo()
    }
    if (action === 'reset-draft') {
      draft = { ...baseline }
      renderInfo()
      renderFooter()
    }
    if (action === 'retry-read') {
      toast('演示：文件仍无法解析，保留原文件。')
    }
    if (action === 'refresh-wall') {
      renderWall()
      toast('演示：重新读取项目列表；未提交的配置草稿保留。')
    }
    if (action === 'wall') {
      guard(() => {
        $('rail').hidden = true
        renderWall()
      })
    }
    const handoff = event.target.closest('[data-handoff]')?.dataset.handoff
    if (handoff) {
      const copies = {
        添加代码仓: '实际产品在这里打开已有接入向导，并带入当前项目分组。这个原型只演示入口。',
        仓库设置: '实际产品在这里打开当前仓库的原生设置。路径、基线分支和工作树设置由原生能力维护。',
        主机配对设置:
          '示例中的「开发电脑」是当前运行 Workbench 的电脑，「构建 Mac mini」是另行配对、也存放了这个项目的远程电脑。实际产品在这里打开原生远程连接设置，显示用户命名的设备和设备标识；此处仅使用演示数据。',
        管理成员: '原型演示：这里维护项目成员和负责人。陈舟、林溪均为示例人物；人员信息独立于执行电脑，不根据配对名称推断成员或负责人。此轮只展示成员配置入口。',
        '查看名片 PR':
          '演示 PR #128：项目信息变更等待评审。需要查看合入后的状态时，使用顶部「已合入待更新」演示场景。',
        查看名片文件: '实际产品在这里查看名片原文。修复解析错误后重新读取，不覆盖损坏内容。'
      }
      const open = () => {
        $('handoff-title').textContent = handoff
        $('handoff-copy').textContent =
          copies[handoff] || '这个入口沿用现有页面；本原型聚焦项目卡片配置，不演示该页面。'
        $('handoff-dialog').showModal()
      }
      if (
        [
          '项目总览',
          '总览',
          '计划',
          '任务',
          '验收',
          '自动化',
          '知识库',
          '接入项目',
          '关闭项目墙'
        ].includes(handoff)
      ) {
        guard(open)
      } else {
        open()
      }
    }
  })

  $('review').addEventListener('click', () => {
    if (phase === 'merged') {
      fields.forEach(([key]) => {
        projects[selected][key] = draft[key].trim()
      })
      baseline = { ...projects[selected] }
      draft = { ...baseline }
      phase = 'clean'
      renderWall()
      renderRail()
      toast('演示：更新代码后，项目卡片已读到合入的信息。')
      return
    }
    if (!dirty() || !draft.name.trim()) {
      return
    }
    $('changes-list').innerHTML = changes()
      .map(
        ([key, label]) =>
          `<section class="change-row"><h3>${label}</h3><div class="change-value before"><span>原值</span><span>${escape(baseline[key] || '未填写')}</span></div><div class="change-value"><span>改为</span><span>${escape(draft[key].trim() || '留空')}</span></div></section>`
      )
      .join('')
    $('submit-error').hidden = true
    $('review-dialog').showModal()
  })
  $('submit').addEventListener('click', () => {
    if (scenario === 'failure') {
      $('submit-error').textContent =
        'PR 未创建：当前账号没有推送权限。草稿已保留在本次演示中；恢复权限后重试。'
      $('submit-error').hidden = false
      return
    }
    phase = 'pending'
    editing = false
    $('review-dialog').close()
    renderRail()
    toast('演示：名片 PR #128 待合入，项目卡片保持现行信息。')
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]') && !$('rail').hidden) {
      event.preventDefault()
      $('close-rail').click()
    }
  })
  reset()
})()
