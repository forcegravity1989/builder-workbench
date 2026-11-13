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
      <div class="card-top"><button class="project-name" data-action="open" data-id="${esc(p.id)}">${p.group ? icon('folder') : ''}${esc(p.name)}</button><div class="card-tools">${button('open-repo', 'external', p.remote ? '打开代码仓' : '打开本机文件夹', p.id)}${button('repo-settings', 'settings', '仓库设置', p.id)}${!W.project(p.id).hosts.includes('local') && p.remote ? button('clone-local', 'download', '克隆到本机', p.id) : ''}${p.kind === 'git' ? button('overview', 'overview', `项目总览 ${p.name}`, p.id) : ''}${button('config', 'edit', `项目信息 ${p.name}`, p.id)}${button('native-menu', 'more', p.group ? 'Orca 分组操作' : 'Orca 项目操作', p.id)}</div></div>
      <div class="identity-row"><span class="owner-row"><span>项目负责人</span><span class="owner-value" title="${esc(p.builder?.trim() || '—')}">${esc(p.builder?.trim() || '—')}</span></span><span class="host-sources">${W.sourceTags(p)}</span></div>
      ${p.group ? `<details class="wall-repositories" open><summary><span>项目分组 · ${W.repoSlots(p).length} 个代码仓</span>${icon('chevron')}</summary>${W.renderMembers(p)}</details>` : ''}
      ${
        p.version && !unknown
          ? `<div class="version-goals"><div class="version-heading"><span>版本目标</span><button class="inline-link" data-action="version" data-id="${p.id}">${esc(version)}</button></div><ul class="goal-list">${p.goals
              .slice(0, 2)
              .map((g) => `<li><span>${esc(g)}</span></li>`)
              .join(
                ''
              )}</ul>${p.goals.length > 2 ? `<button class="more-goals inline-link" data-action="version" data-id="${p.id}">另 ${p.goals.length - 2} 项目标</button>` : ''}</div>
      <div class="stage-grid" aria-label="版本进展">${[
        ['计划', p.plan || '—', 'plan', p.planArchive],
        ['任务', taskCount, 'tasks'],
        ['验收', p.acceptance || '—', 'acceptance', p.acceptanceArchive]
      ]
        .map(
          ([label, value, target, archive]) =>
            `<button class="stage" data-action="stage" data-id="${p.id}" data-target="${target}" title="${target === 'tasks' ? '任务已关闭／总数' : '查看流程材料'}"><span>${label}</span><b>${esc(value)}</b>${archive ? `<span>${esc(archive)}</span>` : ''}</button>`
        )
        .join('')}</div>`
          : `<div class="unversioned"><p class="card-description">${esc(p.brief || '')}</p><span class="version-muted">${version}</span></div>`
      }
      ${p.pending ? '<span class="pending-mark">项目信息待合入</span>' : ''}
    </article>`
  }
  W.renderMembers = (p) =>
    `<ul class="group-repo-list">${W.repoSlots(p)
      .map((repo) => {
        const id = `${p.id}::${repo.id}`
        return `<li>${icon('git')}<button class="member-name" data-action="repo-workspace" data-id="${esc(id)}" title="${esc(repo.name)}">${esc(repo.name)}</button>${button('repo-create', 'plus', `新建工作区 ${repo.name}`, id)}${button('repo-menu', 'more', `Orca 项目操作 ${repo.name}`, id)}</li>`
      })
      .join('')}</ul>`
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
      `<header class="wall-header"><h1>项目墙</h1><span id="visible-count" class="wall-count"></span><div class="wall-actions">${button('refresh', 'refresh', '刷新项目墙：重新读取已连接主机的项目目录与墙卡信息')}${button('reuse', 'file-input', '批量导入主机', 'import-hosts')}${button('add', 'plus', '添加项目', '', 'add-button')}</div></header>${W.motto}${
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
      `<header class="sidebar-project"><span>${esc(p.name)}</span>${button('reuse', 'settings', 'Workspace Options', 'workspace-options')}</header><div class="sidebar-reuse">${W.annotation('复用全局已固定、当前项目版本树与会话。目标／任务开工保持现状，易用性改进留给 v1.0 G3。')}</div><section class="sidebar-change"><div class="change-caption">原型注释 · 仅收窄到当前项目</div><h3>${p.version ? '其他工作区' : '工作区'}</h3><div class="native-project-header"><span>${esc(p.name)}</span>${button('native-menu', 'more', p.group ? 'Orca 分组操作' : 'Orca 项目操作', p.id)}${button('native-create', 'plus', '新建工作区', p.id)}<button class="icon-btn" data-action="sidebar-collapse" aria-label="展开或收起项目" aria-expanded="${!s.sidebarCollapsed}">${icon('chevron')}</button></div>${s.sidebarCollapsed ? '' : p.group ? W.renderMembers(p) : ['main', '临时排查'].map((name) => `<button class="tree-row" data-action="workspace-row" data-id="${name}">${icon('git')}<span>${name}</span></button>`).join('')}<p class="prototype-caption">原型注释：⋯、＋、折叠和原生菜单均保留；工作区行及其会话直接复用。</p></section>`
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
      'native-project-menu': [
        '复用 Orca 原生项目菜单',
        '项目设置、修改图标、工作树可见性、新建分组、移入／移出分组、移除项目，均沿 RepoHeaderProjectActionsMenu 和原有确认。原侧栏入口保留，墙卡只增加挂载；这些操作不走项目信息 PR。'
      ],
      'native-group-menu': [
        '复用 Orca 原生分组菜单',
        '分组菜单沿 ProjectGroupHeaderMenu：重命名、删除分组。各成员仓库自己的 ⋯ 仍使用原生项目菜单，可移出分组或移除项目；原有确认与删除语义不变。墙上按已有分组聚合为一张卡，展开查看成员仓库，不合并仓库文件或累加版本读数。'
      ],
      'native-create': [
        '复用 Orca 新建工作区 UI',
        '保留项目／分组行原生＋及宿主上下文。G1 不新增目标或版本级创建入口；任务开工仍从现有任务屏进行，易用性由 v1.0 G3 处理。'
      ],
      'repair-session': [
        '复用 Orca 会话草稿入口',
        '拟新增“开会话处理”接线：把失败项目、所属主机与工作树、失败阶段及原因带入原生草稿。输入仍保留；由用户发送，不自动执行 Git、合并、重置或修复。草稿仅在当前进程保留，不承诺重启恢复。'
      ],
      overview: [
        '复用 BW 项目总览',
        '此处仅呈现项目名片的改动。版本与项目墙取同一版，点击编辑复用同一套项目设置，已有名片先回显。'
      ],
      version: [
        '复用 BW 版本总览',
        '完整目标与详细进展进入已有版本页面；墙卡只显示两条目标，每条最多两行。'
      ],
      plan: ['复用 BW 版本计划', '查看当前计划材料和阶段进度。'],
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
      'repo-settings': [
        '复用 Orca 仓库设置 UI',
        '直接打开原生仓库设置，沿用所选仓库的 repoId 和所属主机 hostId；本机有副本时优先本机，不落入其他主机。这里修改原生本地配置，不提交项目名片 PR。'
      ],
      'open-repo': [
        '复用现有仓库打开动作',
        '有仓库网页地址时打开链接；只有本机目录时沿原生打开路径能力。远端无网页地址的目录不当作本机路径打开。'
      ],
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
      `<section class="reuse-surface" aria-label="原型复用说明"><span class="prototype-label">原型注释 · ${target === 'repair-session' ? '复用已有能力，接线待实现' : '此区域直接复用'}</span><h1>${title}</h1><p>${description}</p>${p ? `<div class="reuse-context">项目：${esc(p.name)}${s.repoContext ? ` · 代码仓：${esc(s.repoContext)}` : ''}${p.version ? ` · ${esc(p.version)}` : ''}</div>` : ''}${target === 'acceptance' ? W.motto : ''}${target === 'add' ? '<div class="simulation-tools"><span>原型演示控制</span><button class="btn btn-secondary" data-action="simulate-add">模拟原生添加成功</button></div>' : ''}${target === 'clone' ? '<div class="simulation-tools"><span>原型演示控制</span><button class="btn btn-secondary" data-action="simulate-clone">模拟原生克隆成功</button></div>' : ''}${target === 'native-group-menu' && p?.id === 'shun' ? '<div class="simulation-tools"><span>原型演示控制</span><button class="btn btn-secondary" data-action="simulate-ungroup">模拟两个代码仓移出分组</button></div>' : ''}${target === 'native-project-menu' && s.groupExample ? '<div class="simulation-tools"><span>原型演示控制</span><button class="btn btn-secondary" data-action="simulate-group">模拟两个代码仓重新分组</button></div>' : ''}${target === 'repair-session' ? `<div class="repair-context">失败阶段：提交项目信息<br />原因：${esc(s.failure?.message || '未读到提交结果')}<br />拟修改：.bw/project.toml</div><div class="simulation-tools"><span>原型演示控制</span><button class="btn btn-secondary" data-action="return-draft">返回保留的项目信息草稿</button></div>` : ''}</section>`
  }
  const section = (id, title, summary, body, open = false) =>
    `<details class="wb-config-section" data-section="${id}"${open ? ' open' : ''}><summary class="wb-config-toggle">${icon('card')}<span>${title}</span><span class="wb-config-summary">${esc(summary)}</span>${icon('chevron')}</summary><div class="wb-config-body">${body}</div></details>`
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
    const local = p.hosts.includes('local') && s.viewer === 'self'
    const fields = s.editing
      ? `<div class="wb-config-fields">${W.fields.map(([key, label]) => `<label for="field-${key}"><span>${label}${key === 'name' ? ' *' : ''}</span>${key === 'brief' || key === 'opportunity' ? `<textarea id="field-${key}"${p.pending ? ' disabled' : ''}>${esc(s.draft[key])}</textarea>` : `<input id="field-${key}" value="${esc(s.draft[key])}"${p.pending ? ' disabled' : ''}${key === 'name' ? ' required' : ''} />`}</label>`).join('')}</div>`
      : `<dl class="wb-config-facts">${W.fields.map(([key, label]) => `<div><dt>${label}</dt><dd>${esc(p[key]?.trim() || '—')}</dd></div>`).join('')}</dl>`
    const info =
      p.kind === 'folder'
        ? W.annotation(
            '普通文件夹只复用 Orca 名称与工作区能力；本轮不提供 BW 名片编辑。个人／团队仍可在上方修改。'
          )
        : `<div class="config-info-wrap">${section('info', '项目信息', '', fields, true)}${button(
            s.editing ? 'cancel-edit' : 'edit-info',
            s.editing ? 'x' : 'edit',
            s.editing ? '取消编辑' : '编辑项目信息',
            '',
            'wb-icon-button info-edit',
            !W.available(p) || Boolean(p.pending)
          )}</div>`
    rail.innerHTML = `<header class="wb-config-header"><div><span class="wb-config-eyebrow">项目设置</span><h2>${esc(
      p.name
    )}</h2></div><div class="config-header-actions">${button(
      'close-config',
      'x',
      '关闭项目设置',
      '',
      'wb-icon-button'
    )}</div></header><div class="wb-config-scroll">${W.annotation(
      '个人与团队共用本页。类型立即保存在主机；项目信息沿现有文件与评审流程。⋯ 等原生操作在墙卡及侧栏，负责人字段仍待接线。'
    )}<section class="local-setting"><div class="local-setting-label"><label for="project-visibility">项目类型</label>${W.help(
      '个人项目不显示在其他人的共享项目墙。只改变界面入口，不影响已打开的工作区。'
    )}</div><select id="project-visibility" class="input"${
      local ? '' : ' disabled'
    }><option value="personal"${
      (local ? W.visibility(p, 'local') : W.categoryOf(p)) === 'personal' ? ' selected' : ''
    }>个人项目</option><option value="team"${
      (local ? W.visibility(p, 'local') : W.categoryOf(p)) === 'team' ? ' selected' : ''
    }>团队项目</option></select></section>${
      local
        ? ''
        : `<p class="setting-location">在 ${esc(p.hosts[0] === 'local' ? '项目所属主机' : W.hosts[p.hosts[0]].name)} 上修改项目类型</p>`
    }${
      p.pending && p.reviewState !== 'merged'
        ? W.annotation(
            '<button class="btn btn-secondary" data-action="simulate-reviewed">模拟评审已合入</button>'
          )
        : ''
    }${info}</div><footer class="wb-config-footer" id="config-footer"></footer>`
    W.renderConfigFooter()
  }
  W.renderConfigFooter = () => {
    if (!s.config) {
      return
    }
    const p = W.project(s.config)
    const footer = W.$('config-footer')
    footer.hidden = !s.editing && !p.pending
    footer.innerHTML = p.pending
      ? `<span class="review-status">${p.reviewState === 'merged' ? '评审已合入' : '已提交评审'}</span><button class="btn btn-primary" data-action="${p.reviewState === 'merged' ? 'apply-merged' : 'view-review'}">${p.reviewState === 'merged' ? '更新项目信息' : '查看评审'}</button>`
      : `<button class="btn btn-ghost" data-action="cancel-edit">取消</button><button class="btn btn-primary" data-action="review-info"${!W.dirty() || !s.draft.name.trim() ? ' disabled' : ''}>${p.remote ? '提交评审' : '保存'}</button>`
  }
  W.render = () => {
    W.renderRail()
    if (s.mode === 'wall') {
      W.renderWall()
    } else {
      W.renderReuse()
      const p = W.project(s.active)
      if (s.reuse === 'overview' && p?.kind === 'git') {
        const facts = W.fields
          .filter(([key]) => key !== 'name')
          .map(
            ([key, label]) => `<div><dt>${label}</dt><dd>${esc(p[key]?.trim() || '—')}</dd></div>`
          )
          .join('')
        W.$('main')
          .querySelector('.reuse-surface h1')
          .insertAdjacentHTML(
            'afterend',
            `<div class="card-top"><details><summary>${esc(p.name)}${p.version ? ` · ${esc(p.version)}` : ''}</summary><dl class="wb-config-facts">${facts}</dl></details>${button('config', 'edit', '编辑项目信息', s.active)}</div>`
          )
      }
    }
    W.renderConfig()
  }
})()
