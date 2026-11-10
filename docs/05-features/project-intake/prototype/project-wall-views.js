;(() => {
  const W = window.WallProto
  const { esc, icon, button, state: s } = W
  W.renderRail = () => {
    W.$('app-rail').innerHTML =
      `<img class="rail-logo" src="../../../resources/icon.png" alt="Workbench" />${button('wall', 'wall', '项目墙', '', `rail-button ${s.mode === 'wall' ? 'selected' : ''}`)}${button('workspace', 'workspace', '版本工作区', '', 'rail-button')}${button('reuse', 'overview', '项目总览', 'overview', 'rail-button')}${button('reuse', 'task', '任务', 'tasks', 'rail-button')}${button('reuse', 'clock', '自动化', 'automations', 'rail-button')}${button('reuse', 'book', '知识库', 'knowledge', 'rail-button')}<span class="grow"></span>${button('reuse', 'monitor', '管理远程主机', 'hosts', 'rail-button')}${button('reuse', 'settings', '设置', 'settings', 'rail-button')}${button('reuse', 'help', '帮助', 'help', 'rail-button')}`
  }
  W.renderCard = (p) => {
    const unknown = !W.available(p) || p.version === undefined
    const version = unknown ? '版本未知' : p.version || '未使用版本'
    const taskCount = p.tasks ? `${p.tasks.completed} / ${p.tasks.total}` : '—'
    return `<article class="project-card${s.config === p.id ? ' selected' : ''}" data-project="${esc(p.id)}">
      <div class="card-top"><button class="project-name" data-action="open" data-id="${esc(p.id)}">${esc(p.name)}</button><div class="card-tools">${button('overview', 'overview', `项目总览 ${p.name}`, p.id)}${button('config', 'settings', `设置 ${p.name}`, p.id)}</div></div>
      <div class="identity-row"><span class="type-chip">${W.categoryOf(p) === 'team' ? '团队项目' : '个人项目'}</span>${W.sourceTags(p)}</div>
      <div class="owner-row"><span>项目负责人</span><span class="owner-value" title="${esc(p.builder || '—')}">${esc(p.builder?.trim() || '—')}</span></div>
      ${
        p.version && !unknown
          ? `<div class="version-goals"><div class="version-heading"><span>版本目标</span><button class="inline-link" data-action="version" data-id="${p.id}">${esc(version)}</button></div><ul class="goal-list">${p.goals
              .slice(0, 2)
              .map((g) => `<li><span>${esc(g)}</span></li>`)
              .join(
                ''
              )}</ul>${p.goals.length > 2 ? `<button class="more-goals inline-link" data-action="version" data-id="${p.id}">另 ${p.goals.length - 2} 项目标</button>` : ''}</div>
      <div class="stage-grid" aria-label="版本进展">${[
        ['计划', p.plan || '—', 'plan'],
        ['任务', taskCount, 'tasks'],
        ['验收', p.acceptance || '—', 'acceptance']
      ]
        .map(
          ([label, value, target]) =>
            `<button class="stage" data-action="stage" data-id="${p.id}" data-target="${target}"><span>${label}</span><b${value === '未达成' ? ' class="not-met"' : ''}>${esc(value)}</b></button>`
        )
        .join('')}</div>`
          : `<div class="unversioned"><p class="card-description">${esc(p.brief || '')}</p><span class="version-muted">${version}</span></div>`
      }
      ${!W.project(p.id).hosts.includes('local') && p.remote ? `<div class="card-extra"><button class="inline-link" data-action="clone-local" data-id="${p.id}">克隆到本机</button></div>` : ''}
      ${p.pending ? '<span class="pending-mark">项目信息待合入</span>' : ''}
    </article>`
  }
  W.renderGrid = () => {
    const projects = W.visibleProjects()
    W.$('project-grid').innerHTML = projects.length
      ? ['team', 'personal']
          .map((type) => {
            const group = projects.filter((p) => W.categoryOf(p) === type)
            return group.length
              ? `<section class="project-group" aria-label="${type === 'team' ? '团队项目' : '个人项目'}"><h2>${type === 'team' ? '团队项目' : '个人项目'} <span>${group.length}</span></h2><div class="project-grid">${group.map(W.renderCard).join('')}</div></section>`
              : ''
          })
          .join('')
      : '<div class="empty-state"><h2>没有匹配的项目</h2><button class="btn btn-secondary" data-action="clear-filter">清除筛选</button></div>'
    W.$('visible-count').textContent = `${projects.length} 个项目`
  }
  W.renderWall = () => {
    W.$('project-sidebar').hidden = true
    const filterGroup = (action, choices, current) =>
      `<div class="filter-group">${choices.map(([id, label]) => `<button class="filter" data-action="${action}" data-id="${id}" aria-pressed="${current === id}">${label}</button>`).join('')}</div>`
    W.$('main').innerHTML =
      `<header class="wall-header"><h1>项目墙</h1><span id="visible-count" class="wall-count"></span><div class="wall-actions">${button('refresh', 'refresh', '刷新项目墙：重新读取已连接主机的项目目录与墙卡信息')}${button('reuse', 'upload', '批量导入主机', 'import-hosts')}${button('add', 'plus', '添加项目', '', 'add-button')}</div></header>${W.motto}${
        s.projects.length
          ? `<div class="wall-toolbar"><label class="search-wrap">${icon('search')}<input id="project-search" aria-label="搜索项目" placeholder="搜索项目" value="${esc(s.query)}" /></label>${filterGroup(
              'filter',
              [
                ['all', '全部'],
                ['local', '本机'],
                ['remote', '远程']
              ],
              s.filter
            )}${filterGroup(
              'category',
              [
                ['all', '全部类型'],
                ['team', '团队'],
                ['personal', '个人']
              ],
              s.category
            )}<span class="wall-updated">${s.hostReadFailed ? `部分主机未更新 ${W.help('显示上次读取结果。点击刷新项目墙可重新读取；主机连接在原生主机管理中处理。')}` : s.updated}</span></div><div id="project-grid"></div>`
          : `<div class="empty-state">${icon('folder')}<h2>从一个项目开始</h2><p>打开已有文件夹、克隆代码仓，或新建项目。</p><button class="btn btn-primary" data-action="add">添加项目</button></div>`
      }`
    if (s.projects.length) {
      W.renderGrid()
    } else {
      W.$('visible-count').textContent = '0 个项目'
    }
  }
  W.renderSidebar = () => {
    const p = W.project(s.active)
    W.$('project-sidebar').hidden = !p
    if (!p) {
      return
    }
    W.$('project-sidebar').innerHTML =
      `<header class="sidebar-project"><span>${esc(p.name)}</span>${button('reuse', 'settings', 'Workspace Options', 'workspace-options')}</header><div class="sidebar-reuse">${W.annotation('复用现有侧栏：全局已固定、当前项目版本树、原生工作区行及会话。本轮不重做这些区域。')}</div><section class="sidebar-change"><div class="change-caption">原型注释 · 本次调整区域</div><h3>${p.version ? '其他工作区' : '工作区'}</h3>${['main', '临时排查'].map((name) => `<button class="tree-row" data-action="workspace-row" data-id="${name}">${icon('git')}<span>${name}</span></button>`).join('')}<p class="prototype-caption">只显示当前项目；行与会话继续复用 Orca。</p></section>`
  }
  W.renderReuse = () => {
    const target = s.reuse || 'workspace'
    const p = W.project(s.active)
    const entries = {
      scope: [
        '本轮只改项目墙与必要入口',
        '细画：墙卡、个人／团队本机属性、项目负责人，以及侧栏底部的当前项目范围。复用：Orca 添加、主机、设置／帮助、工作区和会话；BW 项目设置、总览、计划与验收。删除：额外比较视图、PR 计数、交付依据弹窗、重复入口和主屏主机下拉。'
      ],
      workspace: [
        '复用 Orca 工作区与会话 UI',
        '沿当前项目的原生工作区恢复与会话能力。点击哪台主机的工作区就在那台执行，不新增主屏主机切换器。'
      ],
      overview: [
        '复用 BW 项目总览',
        '使用现有总览页面。本轮只调整墙卡入口和图标，不重做总览内容。'
      ],
      version: [
        '复用 BW 版本总览',
        '完整目标与详细进展进入已有版本页面；墙卡只显示两条目标，每条最多两行。'
      ],
      plan: [
        '复用 BW 版本计划',
        '使用现有计划材料与归档状态，不新增“一句话承诺”或单独约定验收日期。'
      ],
      tasks: [
        '复用 BW 任务页面',
        '查看本版关联任务及原生 Issue 状态。任务全部关闭不自动意味着人工验收通过。'
      ],
      acceptance: ['复用 BW 版本验收', '沿已有人工验收结果。#489 仅补一行四原则提示，仪表延后。'],
      add: [
        '复用 Orca 添加项目 UI',
        '直接使用 AddRepoDialog 的打开／克隆／新建及原生主机选择；取消 BW 名片步骤。#499 的账号仓库搜索挂在原生克隆路径，不重新画一个创建器。'
      ],
      clone: [
        '复用 Orca 克隆 UI 与 BW 副本克隆流程',
        '沿 #563／#567 的本机路径、仓库选择和部分失败处理。复制已有项目后沿原身份归并，个人／团队属性按每台主机独立保存。'
      ],
      hosts: [
        '复用 Orca 远程主机管理 UI',
        '左侧入口挂载原生状态栏的远程主机能力与 servers 设置，不另做配对、连接或管理弹窗。'
      ],
      'import-hosts': [
        '复用 BW 批量导入主机 UI',
        '沿现有导入流程与 #479 的地址更新能力，仍使用 Orca 原生主机登记。'
      ],
      settings: ['复用 Orca 设置 UI', '复用已有设置页与导航。'],
      help: [
        '复用 Orca 帮助菜单',
        '保留原生问号菜单的帮助、快捷键和反馈等能力，调整侧栏按钮尺寸，不改菜单内容。'
      ],
      'repo-settings': ['复用 Orca 仓库设置 UI', '保留项目主机与仓库身份，打开原生仓库设置。'],
      'add-repo': [
        '复用 Orca 添加仓库与分组 UI',
        '沿已有项目组事务添加代码仓，不另做扫描或分组弹窗。'
      ],
      'remove-repo': ['复用 BW 解除本机登记确认', '沿现有确认和登记事务，不删除磁盘文件。'],
      'open-repo': ['复用现有仓库打开动作', '打开仓库链接或本机目录，保持既有行为。'],
      'workspace-options': [
        '复用 Orca Workspace Options',
        '本次只去掉跨项目 Projects 筛选；保留适用的主机、排序、状态等原生选项。不另画一套菜单。'
      ],
      automations: ['复用 Orca 自动化 UI', '该区域不在本轮改造范围。'],
      knowledge: ['复用 BW 知识库 UI', '该区域不在本轮改造范围。'],
      'charter-pr': [
        '复用已有项目信息 PR 入口',
        'PR 合入并更新后读取正式值；待合入提案不覆盖当前卡片。'
      ]
    }
    const [title, description] = entries[target] || entries.workspace
    if (target === 'workspace' || target === 'workspace-options') {
      W.renderSidebar()
    } else {
      W.$('project-sidebar').hidden = true
    }
    W.$('main').innerHTML =
      `<section class="reuse-surface" aria-label="原型复用说明"><span class="prototype-label">原型注释 · 此区域直接复用</span><h1>${title}</h1><p>${description}</p>${p ? `<div class="reuse-context">项目：${esc(p.name)}${p.version ? ` · ${esc(p.version)}` : ''}</div>` : ''}${target === 'acceptance' ? W.motto : ''}${target === 'add' ? '<div class="simulation-tools"><span>原型演示控制</span><button class="btn btn-secondary" data-action="simulate-add">模拟原生添加成功</button></div>' : ''}${target === 'clone' ? '<div class="simulation-tools"><span>原型演示控制</span><button class="btn btn-secondary" data-action="simulate-clone">模拟原生克隆成功</button></div>' : ''}</section>`
  }
  const section = (id, title, summary, body, open = false) =>
    `<details class="wb-config-section" data-section="${id}"${open ? ' open' : ''}><summary class="wb-config-toggle">${icon(id === 'hosts' ? 'monitor' : id === 'repos' ? 'folder' : 'info')}<span>${title}</span><span class="wb-config-summary">${esc(summary)}</span>${icon('chevron')}</summary><div class="wb-config-body">${body}</div></details>`
  W.renderConfig = () => {
    const rail = W.$('config-rail')
    rail.hidden = !s.config
    W.$('main').inert = Boolean(s.config && window.matchMedia('(max-width:680px)').matches)
    rail.className = 'wb-project-settings'
    if (!s.config) {
      rail.innerHTML = ''
      return
    }
    const p = W.project(s.config)
    const local = p.hosts.includes('local')
    const fields = s.editing
      ? `<div class="wb-config-fields">${W.fields.map(([key, label]) => `<label for="field-${key}"><span>${label}${key === 'name' ? ' *' : ''}</span>${key === 'brief' || key === 'opportunity' ? `<textarea id="field-${key}"${p.pending ? ' disabled' : ''}>${esc(s.draft[key])}</textarea>` : `<input id="field-${key}" value="${esc(s.draft[key])}"${p.pending ? ' disabled' : ''}${key === 'name' ? ' required' : ''} />`}</label>`).join('')}</div>`
      : `<dl class="wb-config-facts">${W.fields.map(([key, label]) => `<div><dt>${label}</dt><dd>${esc(p[key]?.trim() || '—')}</dd></div>`).join('')}</dl>`
    const info = `${
      fields
    }<div class="wb-config-actions">${button('edit-info', 'edit', s.editing ? '收起编辑' : '编辑项目信息', '', 'wb-icon-button', !W.available(p) || Boolean(p.pending))}${button('reload-info', 'refresh', '重新读取项目信息', '', 'wb-icon-button', !W.available(p))}${W.help('共享项目名称来自 BW 项目信息；不会自动覆盖 Orca 本机显示名称。项目负责人是项目主责，可与主机持有人不同。')}</div>`
    const repos = `<ul class="wb-config-repos"><li><div class="wb-config-repo-heading"><strong>${esc(p.name)}</strong><span class="wb-config-actions">${button('reuse', 'external', '打开仓库', 'open-repo', 'wb-icon-button')}${button('reuse', 'settings', '仓库设置', 'repo-settings', 'wb-icon-button')}${local ? button('reuse', 'unlink', '解除本机登记', 'remove-repo', 'wb-icon-button') : ''}</span></div><div class="wb-config-path">${esc(p.remote || p.path)}</div>${p.remote ? `<div class="wb-config-path">${esc(p.path)}</div>` : ''}<div class="wb-config-sources">${W.sourceTags(p)}</div></li></ul>${button('reuse', 'plus', '添加代码仓', 'add-repo', 'wb-icon-button')}`
    const hosts = `<ul class="wb-config-hosts">${p.hosts.map((h) => `<li><span>${esc(W.hosts[h].name)}</span><span>${h === 'local' ? '本机' : W.hosts[h].online ? '在线' : '离线'}</span></li>`).join('')}</ul>${button('reuse', 'monitor', '管理远程主机', 'hosts', 'wb-icon-button')}`
    rail.innerHTML = `<header class="wb-config-header"><div><span class="wb-config-eyebrow">项目配置</span><h2>${esc(p.name)}</h2></div>${button('close-config', 'x', '关闭项目设置', '', 'wb-icon-button')}</header><div class="wb-config-scroll">${W.annotation('沿用现有项目设置分区与样式；本次新增本机项目类型和共享“项目负责人”。')}<section class="local-setting"><div class="local-setting-label"><label for="project-visibility">项目类型</label>${W.help('个人项目只在自己的项目墙显示；团队项目可在其他客户端的共享墙显示。该属性在所属主机保存，切换立即生效。')}</div><select id="project-visibility" class="input"${local ? '' : ' disabled'}><option value="personal"${(local ? W.visibility(p, 'local') : W.categoryOf(p)) === 'personal' ? ' selected' : ''}>个人项目</option><option value="team"${(local ? W.visibility(p, 'local') : W.categoryOf(p)) === 'team' ? ' selected' : ''}>团队项目</option></select></section>${p.pending ? `<div class="wb-config-pr"><span>项目信息${s.scenario === 'merged' ? '已合入，待更新' : '待合入'}</span>${button('reuse', 'external', '查看项目信息 PR', 'charter-pr', 'wb-icon-button')}</div>${W.annotation(s.scenario === 'merged' ? '<button class="btn btn-secondary" data-action="apply-merged">模拟更新到已合入信息</button>' : '<button class="btn btn-secondary" data-action="apply-merged">模拟合入并更新</button>')}` : ''}${section('info', '项目信息', p.builder?.trim() || '—', info, true)}${section('repos', '代码仓', '1 个仓库', repos)}${section('hosts', '所在主机', p.hosts.map((h) => W.hosts[h].name).join('、'), hosts)}</div><footer class="wb-config-footer" id="config-footer"></footer>`
    W.renderConfigFooter()
  }
  W.renderConfigFooter = () => {
    if (!s.config) {
      return
    }
    const p = W.project(s.config)
    W.$('config-footer').innerHTML =
      `<div class="wb-config-draft"><span>${!W.available(p) ? '主机离线，恢复后可编辑' : W.dirty() ? '有未保存的修改' : p.pending ? '等待合入后更新' : '没有未保存的修改'}</span>${W.dirty() ? '<button class="inline-link" data-action="reset-draft">撤销修改</button>' : ''}</div><button class="btn btn-primary wb-config-submit" data-action="review-info"${!W.available(p) || !W.dirty() || !s.draft.name.trim() || p.pending ? ' disabled' : ''}>查看变更</button>`
  }
  W.render = () => {
    W.renderRail()
    if (s.mode === 'wall') {
      W.renderWall()
    } else {
      W.renderReuse()
    }
    W.renderConfig()
  }
})()
