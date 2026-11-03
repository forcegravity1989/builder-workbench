// Prototype fixtures only. Production behavior and pending decisions live in spec.md.
// 演示：项目墙「克隆到本机」两处入口、轻确认、逐仓进度、部分失败、同远端去重、克隆后归并。
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
    git: '<circle cx="6" cy="3" r="2"/><path d="M6 5v12m12-9a6 6 0 0 1-6 6H6"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="19" r="2"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    settings: '<path d="M21 4h-7m-4 0H3m18 8h-9m-4 0H3m18 8h-5m-4 0H3M14 2v4m-6 4v4m8 4v4"/>',
    external:
      '<path d="M15 3h6v6m0-6-9 9M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>',
    clone:
      '<path d="M12 3v11m0 0 4-4m-4 4-4-4"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    'minus-circle': '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<path d="M12 9v4m0 4h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>'
  }
  const icon = (name, className = '') =>
    `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`
  document.querySelectorAll('[data-icon]').forEach((el) => {
    el.outerHTML = icon(el.dataset.icon, el.className)
  })

  // —— 演示数据（化名，不含内网主机与真实内部项目名） ——
  const REMOTE = (name) => `git@github.com:example/${name}.git`
  const REMOTE_PATH = (name) => `/Users/andy/projects/${name}`
  const PICKER_CANDIDATES = [
    { path: 'C:\\orca', note: 'Orca 工作区上层（默认建议）' },
    { path: 'D:\\projects', note: '常用项目目录' },
    { path: '\\\\wsl$\\Ubuntu\\home\\me\\orca', note: 'WSL 工作区上层' }
  ]
  const SCENARIOS = {
    mixed: {
      workspaceDir: 'C:\\orca\\workspaces',
      run: 'ok',
      slots: [
        ['beacon-core', true],
        ['beacon-metrics', false],
        ['beacon-dev', false]
      ]
    },
    remoteOnly: {
      workspaceDir: 'C:\\orca\\workspaces',
      run: 'ok',
      slots: [
        ['beacon-core', false],
        ['beacon-metrics', false],
        ['beacon-dev', false]
      ]
    },
    noWorkspace: {
      workspaceDir: '',
      run: 'ok',
      slots: [
        ['beacon-core', false],
        ['beacon-metrics', false]
      ]
    },
    duplicate: {
      workspaceDir: 'C:\\orca\\workspaces',
      run: 'duplicate',
      slots: [
        ['beacon-core', false],
        ['beacon-metrics', false]
      ]
    },
    partialFail: {
      workspaceDir: 'C:\\orca\\workspaces',
      run: 'partial',
      slots: [
        ['beacon-core', false],
        ['beacon-metrics', false],
        ['beacon-dev', false]
      ]
    }
  }
  const HOST_LABEL = { local: '本机', 'ssh:build-mac': 'Builder 主机 BUILD-MAC' }

  let scenario = 'mixed'
  let cards = []
  let selected = 0
  let cloneParent = ''
  let cloneTargets = []
  let checkedTargets = new Set()
  let cloning = false
  let cloneResult = null
  let toastTimer
  let openSections = { repositories: true, hosts: true }

  /** 与生产 getDefaultCloneParent 同义：Orca 工作区树的同级目录。 */
  function defaultCloneParent(workspaceDir) {
    const trimmed = String(workspaceDir).replace(/[\\/]+$/, '')
    const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
    const lastSegment = index === -1 ? trimmed : trimmed.slice(index + 1)
    if (lastSegment !== 'workspaces') {
      return workspaceDir
    }
    const parent = index === -1 ? '' : trimmed.slice(0, index)
    return /^[A-Za-z]:$/.test(parent) ? parent + trimmed[index] : parent
  }
  const joinPath = (parent, name) => `${parent}\\${name}`

  function makeSlot(name, local) {
    return {
      id: `${name}${local ? '' : '-remote'}`,
      name,
      remote: REMOTE(name),
      local,
      localPath: `D:\\projects\\${name}`,
      remotePath: REMOTE_PATH(name),
      hosts: local ? ['local'] : ['ssh:build-mac'],
      status: null
    }
  }

  function buildState(key) {
    const spec = SCENARIOS[key]
    const beacon = {
      name: 'Beacon',
      vision: '让数字员工托管在 Beacon 上，本机也能跑同一套项目。',
      members: ['安迪'],
      slots: spec.slots.map(([name, local]) => makeSlot(name, local))
    }
    const others = [
      {
        name: 'Field Notes',
        vision: '把实地观察整理成团队可用的研究材料。',
        members: ['林溪'],
        slots: [makeSlot('field-notes', true)]
      }
    ]
    if (spec.run === 'duplicate') {
      // 演示同远端去重：这个远端已作为独立项目在本机注册过。
      others.unshift({
        name: 'beacon-metrics（独立项目）',
        vision: '单独的指标仓，先在本机接入过。',
        members: ['安迪'],
        slots: [makeSlot('beacon-metrics', true)]
      })
    }
    cards = [beacon, ...others]
    selected = 0
    cloneParent = spec.workspaceDir ? defaultCloneParent(spec.workspaceDir) : ''
    cloneTargets = []
    checkedTargets = new Set()
    cloneResult = null
  }

  const activeCard = () => cards[selected]
  const allSlots = () => cards.flatMap((card) => card.slots)
  const slotById = (id) => allSlots().find((slot) => slot.id === id)
  const cloneable = (card) => card.slots.filter((slot) => !slot.local)
  /** 规则 4：同远端（归一化身份）已在本机注册过就不再克隆第二份。 */
  const conflictOf = (slot) => allSlots().find((other) => other !== slot && other.local && other.remote === slot.remote)

  // —— 渲染 ——
  function renderNav() {
    const local = activeCard().slots.filter((slot) => slot.local)
    $('wall-count').textContent = String(cards.length)
    $('other-count').textContent = String(cards.length - 1)
    if (!local.length) {
      $('workspace-tree').innerHTML =
        '<div class="ws-empty">这个项目还没有克隆到本机</div>'
      return
    }
    $('workspace-tree').innerHTML =
      `<div class="ws-node"><span class="ws-dot"></span><span class="ws-name">${escape(activeCard().name)}</span></div>${local
        .map(
          (slot) => `<div class="ws-node repo"><span class="ws-dot local"></span><span class="ws-name">${escape(slot.name)}</span><span class="tag tag-neutral">本机</span></div>
        <div class="ws-node branch">dev<span class="tag tag-neutral">主要</span></div>
        <div class="ws-node branch">bw/project</div>`
        )
        .join('')}`
  }

  function renderWall() {
    $('wall-summary').textContent = `${cards.length} 个项目`
    const target = activeCard()
    const pending = cloneable(target).length
    $('wall-clone-hint').textContent = pending
      ? `${target.name}：${pending} 个仓只在 Builder 主机，可克隆到本机`
      : ''
    $('project-cards').innerHTML = cards
      .map((card, index) => {
        const locals = card.slots.filter((slot) => slot.local).length
        const remotes = card.slots.length - locals
        const canClone = remotes > 0
        return `<article class="project-card ${index === selected && !$('rail').hidden ? 'selected' : ''}">
      <a class="card-open" href="#project-${index}" data-open-project="${index}" aria-label="打开 ${escape(card.name)} 项目">
        <div class="card-top"><span class="card-members">${card.members
          .map(
            (name) =>
              `<span class="member-tag"><span class="builder-dot" aria-hidden="true"></span>${escape(name)}</span>`
          )
          .join('')}</span></div>
        <h2>${escape(card.name)}</h2>
        <p class="card-vision">${escape(card.vision)}</p>
        <div class="slot-sources">
          <span class="source-pill">本机 ${locals} 个仓</span>
          ${remotes ? `<span class="source-pill">Builder 主机 ${remotes} 个仓</span>` : ''}
        </div>
      </a>
      <div class="card-actions" role="group" aria-label="${escape(card.name)} 操作">
        <button class="btn btn-ghost btn-icon icon-action" type="button" data-open-project="${index}" aria-label="打开 ${escape(card.name)} 项目总览">${icon('external')}<span class="action-tooltip" role="tooltip">总览</span></button>
        <button class="btn btn-ghost btn-icon icon-action configure-btn" type="button" data-configure="${index}" aria-label="配置 ${escape(card.name)}" aria-pressed="${index === selected && !$('rail').hidden}">${icon('settings')}<span class="action-tooltip" role="tooltip">配置</span></button>
        ${
          canClone
            ? `<button class="btn btn-ghost btn-icon icon-action" type="button" data-clone-card="${index}" aria-label="把 ${escape(card.name)} 的仓克隆到本机">${icon('clone')}<span class="action-tooltip" role="tooltip">克隆到本机</span></button>`
            : ''
        }
      </div>
    </article>`
      })
      .join('')
  }

  function renderSlot(slot) {
    const actions = [
      `<button class="btn btn-ghost btn-icon icon-action" type="button" data-open-slot="${slot.id}" aria-label="打开 ${escape(slot.name)}">${icon('external')}<span class="action-tooltip" role="tooltip">打开</span></button>`,
      `<button class="btn btn-ghost btn-icon icon-action" type="button" data-config-slot="${slot.id}" aria-label="配置 ${escape(slot.name)}">${icon('settings')}<span class="action-tooltip" role="tooltip">配置</span></button>`
    ]
    if (slot.local) {
      actions.push(
        `<button class="btn btn-ghost btn-icon icon-action" type="button" data-remove-slot="${slot.id}" aria-label="解除 ${escape(slot.name)} 本机注册">${icon('minus-circle')}<span class="action-tooltip" role="tooltip">解除本机注册</span></button>`
      )
    } else if (!cloning) {
      actions.push(
        `<button class="btn btn-ghost btn-icon icon-action" type="button" data-clone-slot="${slot.id}" aria-label="把 ${escape(slot.name)} 克隆到本机">${icon('clone')}<span class="action-tooltip" role="tooltip">克隆到本机</span></button>`
      )
    }
    const path = slot.local
      ? slot.localPath
      : `${slot.remotePath}（Builder 主机上）`
    return `<li class="slot">
      <div class="slot-head"><strong>${escape(slot.name)}</strong><span class="slot-actions">${actions.join('')}</span></div>
      <div class="slot-meta mono">${escape(slot.remote)}</div>
      <div class="slot-meta mono">${escape(path)}</div>
      <div class="slot-sources">${slot.hosts
        .map((host) => `<span class="source-pill">${escape(HOST_LABEL[host])}</span>`)
        .join('')}</div>
      ${renderSlotStatus(slot)}
    </li>`
  }

  function renderSlotStatus(slot) {
    const status = slot.status
    if (!status) {
      return ''
    }
    if (status.state === 'queued') {
      return '<div class="slot-status" data-state="queued">等待克隆</div>'
    }
    if (status.state === 'running') {
      return `<div class="slot-status" data-state="running">克隆到 ${escape(status.target)} · ${status.progress}%</div>
        <div class="slot-progress"><i style="width:${status.progress}%"></i></div>`
    }
    if (status.state === 'done') {
      return `<div class="slot-status" data-state="done">${icon('check')}<span>${escape(status.note)}</span></div>`
    }
    return `<div class="slot-status" data-state="failed">${icon('alert')}<span>${escape(status.note)}</span></div>`
  }

  function renderRail() {
    const card = activeCard()
    $('rail-name').textContent = card.name
    $('repositories-summary').textContent = `${card.slots.length} 个仓库`
    $('slot-list').innerHTML = card.slots.map(renderSlot).join('')
    const pending = cloneable(card).length
    $('repositories-note').textContent = pending
      ? `${pending} 个仓只在 Builder 主机注册：克隆到本机后，本地 agent 才能拿到这套代码。`
      : '全部代码仓都已在本机注册。'
    const hosts = [...new Set(card.slots.flatMap((slot) => slot.hosts))]
    $('hosts-summary').textContent = hosts.map((host) => HOST_LABEL[host]).join('、')
    $('host-list').innerHTML = hosts
      .map(
        (host) =>
          `<div class="host-row">${icon('monitor')}<div class="host-copy"><strong>${escape(HOST_LABEL[host])}</strong><small>${host === 'local' ? '正在运行 Workbench' : '已配对 · 演示数据'}</small></div><span class="host-status">${host === 'local' ? '本机' : '在线'}</span></div>`
      )
      .join('')
    renderFooter()
    Object.entries(openSections).forEach(([key, open]) => {
      const toggle = document.querySelector(`[data-section="${key}"]`)
      toggle.setAttribute('aria-expanded', String(open))
      $(`${key}-body`).hidden = !open
    })
  }

  function renderFooter() {
    if (cloneResult) {
      const lines = [
        `<span class="summary-line">克隆完成 ${cloneResult.done} 个仓，已挂入项目 ${escape(activeCard().name)}</span>`
      ]
      if (cloneResult.failed) {
        lines.push(
          `<span class="summary-line failed">失败 ${cloneResult.failed} 个：目标目录已存在，换个父目录或先处理同名目录</span>`
        )
      }
      lines.push(
        '<span class="summary-actions"><button class="btn btn-secondary" type="button" data-handoff="项目总览">切到项目总览</button><button class="btn btn-ghost" type="button" data-action="clear-result">知道了</button></span>'
      )
      $('clone-summary').innerHTML = lines.join('')
    } else {
      $('clone-summary').innerHTML =
        '<span class="muted">克隆的仓会自动挂入当前项目，并设 .bw/worktrees 为工作树基址</span>'
    }
    $('footer-note').textContent = SCENARIOS[scenario].workspaceDir
      ? `本机目录取自 Orca 工作区设置（${SCENARIOS[scenario].workspaceDir}）`
      : 'Orca 工作区未设置：克隆前先选父目录'
  }

  // —— 克隆确认框 ——
  function openCloneDialog(ids) {
    cloneTargets = ids
    checkedTargets = new Set(ids.filter((id) => !conflictOf(slotById(id))))
    renderCloneDialog()
    $('clone-dialog').showModal()
  }

  function renderCloneDialog() {
    const single = cloneTargets.length === 1
    $('clone-title').textContent = single ? '克隆到本机' : `克隆到本机（${cloneTargets.length} 个仓）`
    $('clone-copy').textContent = single
      ? '基于该仓已有的远端克隆到本机；目录默认落在 Orca 工作区上层。'
      : '这些仓只在 Builder 主机注册；克隆到本机后自动挂入当前项目。'
    const parentEmpty = !cloneParent
    $('clone-parent-path').textContent = parentEmpty ? '未设置，先选择父目录' : cloneParent
    $('clone-parent-path').classList.toggle('empty', parentEmpty)
    $('clone-list').innerHTML = cloneTargets
      .map((id) => {
        const slot = slotById(id)
        const conflict = conflictOf(slot)
        const disabled = Boolean(conflict) || parentEmpty
        return `<label class="clone-item">
        <input type="checkbox" data-clone-check="${id}" ${checkedTargets.has(id) ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
        <span class="clone-copy">
          <strong>${escape(slot.name)}</strong>
          <small class="mono">${escape(slot.remote)}</small>
          <span class="clone-target"><span>将克隆到</span><span class="mono">${escape(joinPath(cloneParent || '…', slot.name))}</span></span>
        </span>
      </label>`
      })
      .join('')
    const conflicts = cloneTargets.map(slotById).filter((slot) => conflictOf(slot))
    $('clone-error').hidden = !conflicts.length
    $('clone-error').textContent = conflicts.length
      ? `${conflicts
          .map((slot) => slot.name)
          .join('、')} 已在本机注册（${conflictOf(conflicts[0]).localPath}）。要用它请直接打开那个项目；换个目录再克隆只会得到重复项目。`
      : ''
    $('clone-confirm').textContent = single ? '克隆' : '全部克隆'
    $('clone-confirm').disabled = parentEmpty || checkedTargets.size === 0
  }

  function pickParent() {
    $('picker-list').innerHTML = PICKER_CANDIDATES.map(
      (candidate) =>
        `<li><button type="button" data-pick="${escape(candidate.path)}"><span class="mono">${escape(candidate.path)}</span><small>${escape(candidate.note)}</small></button></li>`
    ).join('')
    $('picker-dialog').showModal()
  }

  // —— 模拟克隆 ——
  function confirmClone() {
    const ids = [...checkedTargets]
    if (!ids.length || !cloneParent) {
      return
    }
    $('clone-dialog').close()
    cloning = true
    cloneResult = { done: 0, failed: 0 }
    ids.forEach((id) => {
      slotById(id).status = { state: 'queued' }
    })
    renderRail()
    toast(`开始克隆 ${ids.length} 个仓…`)
    runNext(ids, 0)
  }

  function runNext(ids, index) {
    if (index >= ids.length) {
      cloning = false
      renderRail()
      renderWall()
      renderNav()
      toast(
        cloneResult.failed
          ? `克隆完成 ${cloneResult.done} 个 · 失败 ${cloneResult.failed} 个`
          : `克隆完成 ${cloneResult.done} 个仓，已挂入项目`
      )
      return
    }
    const slot = slotById(ids[index])
    slot.status = { state: 'running', progress: 0, target: joinPath(cloneParent, slot.name) }
    renderRail()
    const tick = () => {
      if (!slot.status || slot.status.state !== 'running') {
        return
      }
      slot.status.progress = Math.min(
        100,
        slot.status.progress + 10 + Math.floor(Math.random() * 20)
      )
      renderRail()
      if (slot.status.progress < 100) {
        setTimeout(tick, 150)
        return
      }
      if (SCENARIOS[scenario].run === 'partial' && index === 1) {
        slot.status = {
          state: 'failed',
          note: `克隆失败：目标目录已存在（${joinPath(cloneParent, slot.name)}）`
        }
        cloneResult.failed += 1
      } else {
        slot.local = true
        slot.localPath = joinPath(cloneParent, slot.name)
        slot.hosts = ['local']
        slot.status = { state: 'done', note: `已克隆到 ${slot.localPath}` }
        cloneResult.done += 1
      }
      renderRail()
      renderNav()
      setTimeout(() => runNext(ids, index + 1), 320)
    }
    setTimeout(tick, 220)
  }

  const toast = (message) => {
    clearTimeout(toastTimer)
    $('toast').textContent = message
    $('toast').hidden = false
    toastTimer = setTimeout(() => {
      $('toast').hidden = true
    }, 3500)
  }

  function choose(index) {
    selected = index
    cloneResult = null
    $('rail').hidden = false
    renderNav()
    renderWall()
    renderRail()
    $('close-rail').focus()
  }

  function reset(nextScenario = 'mixed') {
    // Why: 切场景时不能留下上一个场景的确认框（数据已换代，框里还是旧的）。
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close())
    scenario = nextScenario
    $('scenario').value = nextScenario
    buildState(nextScenario)
    openSections = { repositories: true, hosts: true }
    $('rail').hidden = false
    $('toast').hidden = true
    renderNav()
    renderWall()
    renderRail()
  }

  // —— 事件 ——
  $('close-rail').addEventListener('click', () => {
    $('rail').hidden = true
    renderWall()
    document.querySelector(`[data-configure="${selected}"]`)?.focus()
  })
  $('reset').addEventListener('click', () => reset())
  $('scenario').addEventListener('change', (event) => reset(event.target.value))
  $('theme').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark'
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    $('theme').textContent = dark ? '浅色' : '深色'
  })
  $('pick-parent').addEventListener('click', pickParent)
  $('clone-confirm').addEventListener('click', confirmClone)
  document.addEventListener('change', (event) => {
    const id = event.target.dataset.cloneCheck
    if (!id) {
      return
    }
    if (event.target.checked) {
      checkedTargets.add(id)
    } else {
      checkedTargets.delete(id)
    }
    renderCloneDialog()
  })
  document.addEventListener('click', (event) => {
    const pick = event.target.closest('[data-pick]')
    if (pick) {
      cloneParent = pick.dataset.pick
      $('picker-dialog').close()
      renderCloneDialog()
      return
    }
    const cloneSlot = event.target.closest('[data-clone-slot]')
    if (cloneSlot) {
      if (cloning) {
        toast('正在克隆，完成后可继续。')
        return
      }
      openCloneDialog([cloneSlot.dataset.cloneSlot])
      return
    }
    const cloneCard = event.target.closest('[data-clone-card]')
    if (cloneCard) {
      if (cloning) {
        toast('正在克隆，完成后可继续。')
        return
      }
      const card = cards[Number(cloneCard.dataset.cloneCard)]
      openCloneDialog(cloneable(card).map((slot) => slot.id))
      return
    }
    const projectLink = event.target.closest('[data-open-project]')
    if (projectLink) {
      event.preventDefault()
      const card = cards[Number(projectLink.dataset.openProject)]
      $('handoff-title').textContent = `打开 ${card.name}`
      $('handoff-copy').textContent = '原型演示：点击卡片进入这个项目的总览。'
      $('handoff-dialog').showModal()
      return
    }
    const config = event.target.closest('[data-configure]')
    if (config) {
      choose(Number(config.dataset.configure))
      return
    }
    const openSlot = event.target.closest('[data-open-slot]')
    if (openSlot) {
      const slot = slotById(openSlot.dataset.openSlot)
      $('handoff-title').textContent = `打开 ${slot.name}`
      $('handoff-copy').textContent = slot.local
        ? `原型演示：本机仓在这里用系统文件管理器打开 ${slot.localPath}。`
        : '原型演示：远端仓在这里打开它的远端页面。'
      $('handoff-dialog').showModal()
      return
    }
    const configSlot = event.target.closest('[data-config-slot]')
    if (configSlot) {
      $('handoff-title').textContent = '仓库设置'
      $('handoff-copy').textContent =
        '实际产品在这里打开该仓的原生设置（路径、基线分支、工作树基址）。本原型不改这部分。'
      $('handoff-dialog').showModal()
      return
    }
    const removeSlot = event.target.closest('[data-remove-slot]')
    if (removeSlot) {
      const slot = slotById(removeSlot.dataset.removeSlot)
      slot.local = false
      slot.status = null
      slot.hosts = ['ssh:build-mac']
      cloneResult = null
      renderNav()
      renderWall()
      renderRail()
      toast(`演示：已解除 ${slot.name} 的本机注册（不删除磁盘目录）。`)
      return
    }
    const toggle = event.target.closest('[data-section]')
    if (toggle) {
      const key = toggle.dataset.section
      openSections[key] = !openSections[key]
      toggle.setAttribute('aria-expanded', String(openSections[key]))
      $(`${key}-body`).hidden = !openSections[key]
      return
    }
    const action = event.target.closest('[data-action]')?.dataset.action
    if (action === 'refresh-wall') {
      renderWall()
      toast('演示：重新读取项目列表。')
    }
    if (action === 'wall') {
      $('rail').hidden = true
      renderWall()
    }
    if (action === 'clear-result') {
      cloneResult = null
      renderFooter()
    }
    const handoff = event.target.closest('[data-handoff]')?.dataset.handoff
    if (handoff) {
      const copies = {
        接入项目:
          '实际产品在这里打开接入向导：选本地目录或填远端地址克隆，并带入当前项目分组。本原型只演示从墙卡发起的单仓与批量克隆。',
        '导入 Builder 主机': '实际产品在这里导入已在其他电脑上配对的项目。本原型聚焦「克隆到本机」。',
        项目总览: '实际产品在这里切到该项目的总览页；克隆完成后即可在本机跑这个项目。'
      }
      $('handoff-title').textContent = handoff
      $('handoff-copy').textContent =
        copies[handoff] || '这个入口沿用现有页面；本原型聚焦「克隆到本机」。'
      $('handoff-dialog').showModal()
    }
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]') && !$('rail').hidden) {
      event.preventDefault()
      $('close-rail').click()
    }
  })

  reset()
})()
