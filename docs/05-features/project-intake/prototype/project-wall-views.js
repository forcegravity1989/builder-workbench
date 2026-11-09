;(() => {
  const W = window.WallProto
  const { esc, icon, button, state: s } = W
  W.renderRail = () => {
    W.$('app-rail').innerHTML =
      `<img class="rail-logo" src="../../../resources/icon.png" alt="Workbench" />${button(
        'wall',
        'wall',
        '项目墙',
        '',
        !s.active ? 'selected' : ''
      )}${button('workspace', 'session', '工作区')}${button(
        'handoff',
        'task',
        '任务',
        '任务'
      )}${button('handoff', 'clock', '自动化', '自动化')}${button(
        'handoff',
        'book',
        '知识库',
        '知识库'
      )}<span class="grow"></span>${button(
        'hosts',
        'monitor',
        '主机管理'
      )}${button('handoff', 'settings', '设置', '设置')}`
    W.$('app-rail')
      .querySelector(`[data-action="${s.active ? 'workspace' : 'wall'}"]`)
      .setAttribute('aria-pressed', 'true')
  }
  W.renderCard = (p) => {
    const offline = !W.available(p)
    const value = (v) => (v == null ? '—' : esc(v))
    let version = p.version == null ? '未建立版本' : esc(p.version)
    if (p.version === undefined || offline) {
      version = '—'
    }
    return (
      `<article class="project-card ${s.config === p.id ? 'selected' : ''}" data-project="${esc(
        p.id
      )}">` +
      `<div class="card-top"><button class="project-name" data-action="open" data-id="${esc(
        p.id
      )}">${esc(p.name)}</button><div class="card-tools">${button(
        'open',
        'external',
        '打开 ' + p.name,
        p.id
      )}${button('config', 'settings', '设置 ' + p.name, p.id)}</div></div>${
        p.brief && !p.delivery ? '<p class="card-description">' + esc(p.brief) + '</p>' : ''
      }<div class="source-row">${W.sourceTags(p)}${
        p.kind === 'folder' ? '<span class="source-chip">文件夹</span>' : ''
      }</div>` +
      `<div class="card-facts">${
        p.delivery
          ? '<button class="delivery-open" data-action="delivery" data-id="' +
            p.id +
            '"><span class="version-row"><span>本版承诺</span><span class="version-value">' +
            version +
            '</span></span><strong class="promise">' +
            esc(p.delivery.promise) +
            '</strong><span class="delivery-date">约定验收 · ' +
            p.delivery.date.slice(5).replace('-', '/') +
            '</span><span class="stage-grid">' +
            [
              ['计划', p.delivery.plan],
              ['开发', p.delivery.development],
              ['验收', p.delivery.acceptance]
            ]
              .map(
                ([label, result]) =>
                  '<span class="stage"><span>' +
                  label +
                  '</span><b class="' +
                  (label === '验收' && result === '未达成' ? 'not-met' : '') +
                  '">' +
                  esc(result) +
                  '</b></span>'
              )
              .join('') +
            '</span><span class="evidence-link">查看交付依据 ' +
            icon('arrow') +
            '</span></button>'
          : p.kind === 'git'
            ? '<div class="version-row"><span>版本交付</span><span class="muted">' +
              (offline || p.version === undefined ? '未知' : '未建立版本') +
              '</span></div>'
            : ''
      }${
        !p.delivery
          ? '<div class="metric-row"' +
            (p.kind === 'folder' ? ' style="border-top:0;margin-top:0;padding-top:0"' : '') +
            '><span class="metric">' +
            icon('session') +
            '运行中 <b>' +
            value(p.sessions) +
            '</b></span>' +
            (p.kind === 'git'
              ? '<span class="metric">' + icon('pr') + '待审 PR <b>' + value(p.prs) + '</b></span>'
              : '') +
            '</div>'
          : ''
      }${
        offline
          ? '<div class="card-footnote">主机离线，读数暂不可用</div>'
          : p.pending
            ? '<div class="card-footnote">项目信息待合入</div>'
            : ''
      }</div></article>`
    )
  }
  W.renderGrid = () => {
    const projects = s.projects.filter(
      (p) =>
        (!s.query ||
          `${p.name} ${p.brief} ${p.path}`.toLowerCase().includes(s.query.toLowerCase())) &&
        (s.filter === 'all' ||
          (s.filter === 'local' ? p.hosts.includes('local') : p.hosts.some((h) => h !== 'local')))
    )
    W.$('project-grid').innerHTML = projects.length
      ? projects.map(W.renderCard).join('')
      : '<div class="empty-state"><h2>没有匹配的项目</h2><button class="btn btn-secondary" data-action="clear-filter">清除筛选</button></div>'
    W.$('visible-count').textContent =
      projects.length === s.projects.length
        ? `${s.projects.length} 个项目`
        : `${projects.length} / ${s.projects.length} 个项目`
  }
  W.renderWall = () => {
    W.$('project-sidebar').hidden = true
    W.$('main').innerHTML =
      `<header class="wall-header"><h1>项目墙</h1><span id="visible-count" class="wall-count">${
        s.projects.length
      } 个项目</span><div class="wall-actions">${button(
        'refresh',
        'refresh',
        '刷新项目墙'
      )}${button('hosts', 'monitor', '管理与导入主机')}${button(
        'add',
        'plus',
        '添加项目',
        '',
        'add-button'
      )}</div></header>${
        s.scenario === 'error'
          ? '<div class="inline-notice">研发主机的项目列表读取失败，当前列表可能不完整。<button class="btn btn-secondary" data-action="retry-host">重试</button></div>'
          : ''
      }${
        s.projects.length
          ? `<div class="wall-toolbar"><label class="search-wrap">${icon(
              'search'
            )}<input id="project-search" aria-label="搜索项目" placeholder="搜索项目" value="${esc(
              s.query
            )}" /></label><div class="filter-group">${[
              ['all', '全部'],
              ['local', '本机'],
              ['remote', '远程']
            ]
              .map(
                ([id, name]) =>
                  `<button class="filter" data-action="filter" data-id="${id}" aria-pressed="${
                    s.filter === id
                  }">${name}</button>`
              )
              .join('')}</div><span class="wall-updated">${
              s.updated
            }</span></div><div id="project-grid" class="project-grid"></div>`
          : `<div class="empty-state">${icon(
              'folder'
            )}<h2>从一个项目开始</h2><p>打开已有文件夹、克隆代码仓，或新建项目。</p><button class="btn btn-primary" data-action="add">添加项目</button><p><button class="inline-link" data-action="hosts">连接已有主机</button></p></div>`
      }`
    if (s.projects.length) {
      W.renderGrid()
    }
  }
  W.renderWorkspace = () => {
    const p = W.project(s.active)
    W.$('project-sidebar').hidden = false
    W.$('project-sidebar').innerHTML =
      `<div class="sidebar-project">${icon('folder')}${esc(p.name)}</div>` +
      `<button class="tree-row" data-action="wall">${icon('back')}项目墙</button>` +
      `<div class="sidebar-section">${icon('pin')}已固定</div>${s.projects
        .filter((q) => q.id === 'bw' || q.id === 'shun')
        .map(
          (q) =>
            '<button class="tree-row" data-action="open" data-id="' +
            q.id +
            '">' +
            icon('git') +
            esc(q.name) +
            ' / main</button>'
        )
        .join('')}${
        p.kind === 'git'
          ? '<div class="sidebar-section">' +
            icon('clock') +
            '版本</div>' +
            (p.version
              ? '<button class="tree-row" data-action="handoff" data-id="版本 ' +
                esc(p.version) +
                '">' +
                icon('folder') +
                esc(p.version) +
                '</button>'
              : '<div class="sidebar-note">暂无版本</div>') +
            '<button class="tree-row" data-action="handoff" data-id="新建版本">' +
            icon('plus') +
            '新建版本</button>'
          : ''
      }<div class="sidebar-section">${icon(
        'folder'
      )}当前项目工作区</div><button class="tree-row selected" data-action="workspace">${icon(
        'git'
      )}${p.kind === 'folder' ? '工作笔记' : 'main'}</button>${
        s.newSession
          ? '<button class="tree-row" data-action="workspace">' +
            icon('session') +
            '新会话</button>'
          : ''
      }<button class="tree-row" data-action="handoff" data-id="新建工作区">${icon(
        'plus'
      )}新建工作区</button>`
    W.$('main').innerHTML =
      `<header class="workspace-heading"><h1>${esc(
        p.name
      )}</h1><span class="grow"></span><label class="sr-only" for="workspace-host">执行主机</label><select id="workspace-host" class="input">${p.hosts
        .map(
          (h) =>
            '<option value="' +
            h +
            '" ' +
            (h === s.host ? 'selected' : '') +
            ' ' +
            (!W.hosts[h].online ? 'disabled' : '') +
            '>' +
            W.hosts[h].name +
            (!W.hosts[h].online ? ' · 离线' : '') +
            '</option>'
        )
        .join('')}</select>${button('config', 'settings', '项目设置', p.id)}</header>` +
      `<div class="workspace-empty"><div class="muted">${
        p.kind === 'folder' ? '文件夹工作区' : 'main'
      } · ${W.hosts[s.host].name}</div><h2>${
        s.newSession ? '会话已打开' : '今天想做些什么？'
      }</h2>` +
      `<div class="composer"><textarea id="prompt" aria-label="会话输入" placeholder="描述要做的事情…"></textarea><div class="composer-footer"><span>Codex · 默认配置</span><button class="btn btn-primary" data-action="start-session">开始会话</button></div></div>` +
      `<div class="workspace-links"><button class="btn btn-ghost" data-action="handoff" data-id="项目总览">项目总览</button><button class="btn btn-ghost" data-action="config" data-id="${
        p.id
      }">编辑项目信息</button></div></div>`
  }
  W.renderConfig = () => {
    const rail = W.$('config-rail')
    rail.hidden = !s.config
    if (!s.config) {
      return
    }
    const p = W.project(s.config)
    const offline = !W.available(p)
    rail.innerHTML =
      `<header class="config-head"><h2>${esc(p.name)}</h2>${button(
        'close-config',
        'x',
        '关闭项目设置'
      )}</header><div class="config-scroll">${
        offline ? '<div class="inline-notice">主机离线，恢复连接后可编辑。</div>' : ''
      }${
        p.pending
          ? '<div class="inline-notice">' +
            (p.merged ? '已合入，等待更新' : '项目信息待合入') +
            '</div>'
          : ''
      }<section class="config-section"><h3>项目信息</h3>${W.fields
        .map(
          ([key, label]) =>
            '<div class="field"><label for="field-' +
            key +
            '">' +
            label +
            (key !== 'name' ? '<span class="optional">选填</span>' : '') +
            '</label>' +
            (key === 'brief' || key === 'opportunity' ? '<textarea' : '<input') +
            ' id="field-' +
            key +
            '" class="input" data-field="' +
            key +
            '" ' +
            (offline || p.pending ? 'disabled' : '') +
            (key === 'brief' || key === 'opportunity'
              ? '>' + esc(s.draft[key]) + '</textarea>'
              : ' value="' + esc(s.draft[key]) + '" />') +
            '</div>'
        )
        .join('')}</section>` +
      `<section class="config-section"><h3>${
        p.kind === 'git' ? '代码仓' : '文件夹'
      }</h3><div class="repo-detail">${
        p.remote ? '<span class="mono">' + esc(p.remote) + '</span>' : ''
      }<span class="mono muted">${esc(
        p.path
      )}</span></div><button class="btn btn-ghost" data-action="handoff" data-id="仓库设置">打开仓库设置</button></section>` +
      `<section class="config-section"><h3>所在主机</h3><div class="source-row">${W.sourceTags(
        p
      )}</div><button class="btn btn-ghost" data-action="hosts">管理主机</button></section></div>` +
      `<footer class="config-footer"><div id="config-status" class="config-status">${
        p.remote ? '编辑后查看对比，通过 PR 共享' : '编辑后保存到项目所在主机'
      }</div>${
        p.pending
          ? '<button class="btn btn-secondary" data-action="' +
            (p.merged ? 'apply-info' : 'preview-pr') +
            '">' +
            (p.merged ? '更新项目信息' : '查看待合入变更') +
            '</button>'
          : '<button id="review-info" class="btn btn-primary" data-action="review-info" disabled>查看变更</button>'
      }</footer>`
  }
  W.render = () => {
    W.renderRail()
    if (s.active) {
      W.renderWorkspace()
    } else {
      W.renderWall()
    }
    W.renderConfig()
  }
})()
