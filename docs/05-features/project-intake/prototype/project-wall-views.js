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
      )}${button('overview', 'book', '项目总览 ' + p.name, p.id)}${button('config', 'settings', '设置 ' + p.name, p.id)}</div></div><div class="identity-row"><span class="type-chip ${W.categoryOf(p)}">${W.categoryOf(p) === 'team' ? '团队项目' : '个人项目'}</span>${p.delivery ? `<span class="builder-label">Builder · ${esc(p.builder || '未填写')}</span>` : ''}</div>${
        p.brief && !p.delivery ? '<p class="card-description">' + esc(p.brief) + '</p>' : ''
      }<div class="source-row">${W.sourceTags(p)}${
        p.kind === 'folder' ? '<span class="source-chip">文件夹</span>' : ''
      }${!W.project(p.id).hosts.includes('local') && p.remote ? `<button class="inline-link" data-action="clone-local" data-id="${p.id}">克隆到本机</button>` : ''}</div>` +
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
    const projects = W.visibleProjects()
    const root = W.$('project-grid')
    root.className = s.view === 'projects' ? 'project-grid' : 'comparison-view'
    const empty =
      '<div class="empty-state"><h2>没有匹配的项目</h2><button class="btn btn-secondary" data-action="clear-filter">清除筛选</button></div>'
    if (s.view === 'projects') {
      root.innerHTML = projects.length
        ? ['team', 'personal']
            .map((type) => {
              const group = projects.filter((p) => W.categoryOf(p) === type)
              return group.length
                ? `<h2 class="project-group-title">${type === 'team' ? '团队项目' : '个人项目'} <span>${group.length}</span></h2>${group.map(W.renderCard).join('')}`
                : ''
            })
            .join('')
        : empty
    } else if (s.view === 'rhythm') {
      const dated = projects
        .filter((p) => p.delivery)
        .sort((a, b) => a.delivery.date.localeCompare(b.delivery.date))
      root.innerHTML = `<p class="view-caption">按约定验收日期查看版本安排 · 示例观察日 2026/11/10 · 日期不按自然周自动改动</p>${dated.map((p) => `<article class="rhythm-row"><div class="rhythm-date">${esc(p.delivery.date)}<span>${esc(p.version)}</span></div><div><button class="project-name" data-action="open" data-id="${p.id}">${esc(p.name)}</button><p>${esc(p.delivery.promise)}</p><span class="muted">Builder · ${esc(p.builder || '未填写')}</span></div><button class="btn btn-secondary" data-action="delivery" data-id="${p.id}">${esc(p.delivery.acceptance)} · 查看依据</button>${button('config', 'settings', `设置 ${p.name}`, p.id)}</article>`).join('') || '<p class="muted">当前范围没有可展示的版本安排。</p>'}${
        projects.some((p) => !p.delivery)
          ? `<div class="comparison-note">无版本或依据不可用：${projects
              .filter((p) => !p.delivery)
              .map(
                (p) =>
                  `<button class="inline-link" data-action="open" data-id="${p.id}">${esc(p.name)}</button>`
              )
              .join('、')}。仍可直接工作。</div>`
          : ''
      }`
    } else {
      const people = [...new Set(projects.map((p) => p.builder || '未填写负责人'))]
      root.innerHTML = `<p class="view-caption">按项目主要负责人分组 · 不是主机持有人或个人排名 · 同项目只统计一份</p>${
        people
          .map(
            (person) =>
              `<section class="builder-section"><h2>${esc(person)}</h2>${projects
                .filter((p) => (p.builder || '未填写负责人') === person)
                .map(
                  (p) =>
                    `<div class="builder-project"><button class="project-name" data-action="open" data-id="${p.id}">${esc(p.name)}</button><span>${esc(p.version || '无可读版本')}</span><span>${esc(p.delivery?.promise || p.brief || '可直接开始工作')}</span>${p.delivery ? `<button class="inline-link" data-action="delivery" data-id="${p.id}">${esc(p.delivery.acceptance)} · 依据</button>` : '<span class="muted">未使用版本交付</span>'}${button('config', 'settings', `设置 ${p.name}`, p.id)}</div>`
                )
                .join('')}</section>`
          )
          .join('') || empty
      }`
    }
    W.$('visible-count').textContent = `${projects.length} 个项目`
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
      }${W.motto}<nav class="view-switch" aria-label="项目墙视图">${[
        ['projects', '项目墙'],
        ['rhythm', '版本节奏'],
        ['builders', 'Builder 交付']
      ]
        .map(
          ([id, label]) =>
            `<button class="filter" data-action="view" data-id="${id}" aria-pressed="${s.view === id}">${label}</button>`
        )
        .join('')}</nav>${
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
              .join('')}</div><div class="filter-group" aria-label="项目类型">${[
              ['all', '全部类型'],
              ['team', '团队'],
              ['personal', '个人']
            ]
              .map(
                ([id, label]) =>
                  `<button class="filter" data-action="category" data-id="${id}" aria-pressed="${s.category === id}">${label}</button>`
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
      `<div class="sidebar-project">${icon('folder')}<span>${esc(p.name)}</span>${button('add', 'plus', '添加项目')}${button('workspace-options', 'settings', 'Workspace options')}</div>` +
      `<button class="tree-row" data-action="wall">${icon('back')}项目墙</button>` +
      `<div class="sidebar-section">${icon('pin')}已固定</div>${s.projects
        .filter((q) => q.id === 'bw' || q.id === 'shun')
        .map(
          (q) =>
            '<button class="tree-row" data-action="open-pinned" data-id="' +
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
              ? `<details class="version-trees" open><summary>${esc(p.version)}</summary><button class="tree-row" data-action="handoff" data-id="版本计划">${icon('book')}计划</button><button class="tree-row" data-action="choose-workspace" data-id="版本开发">${icon('git')}开发工作区</button><button class="tree-row" data-action="handoff" data-id="版本验收">${icon('check')}验收</button></details>`
              : '<div class="sidebar-note">暂无版本</div>') +
            '<button class="tree-row" data-action="handoff" data-id="新建版本">' +
            icon('plus') +
            '新建版本</button>'
          : ''
      }<div class="sidebar-section">${icon('folder')}${p.version ? '其他工作区' : '工作区'}</div>${[
        ...new Set([
          ...(p.id === 'bw' || p.id === 'shun'
            ? ['临时排查']
            : [
                p.kind === 'folder' ? p.name : 'main',
                ...(p.kind === 'git' && !p.id.startsWith('added-') ? ['临时排查'] : [])
              ]),
          ...(p.extraWorkspace ? [p.extraWorkspace] : [])
        ])
      ]
        .sort((a, b) => (s.sort === 'name' ? a.localeCompare(b) : 0))
        .map(
          (name) =>
            `<button class="tree-row ${s.workspace === name ? 'selected' : ''}" data-action="choose-workspace" data-id="${esc(name)}">${icon(p.kind === 'folder' ? 'folder' : 'git')}${esc(name)}</button>${s.workspace === name && s.newSession ? `<button class="tree-row session-child" data-action="workspace">${icon('session')}继续会话</button>` : ''}`
        )
        .join('')}<button class="tree-row" data-action="new-workspace">${icon(
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
        p.kind === 'folder' ? '文件夹工作区' : esc(s.workspace)
      } · ${W.hosts[s.host].name}</div><h2>${
        s.newSession ? '继续当前工作' : '今天想做些什么？'
      }</h2>` +
      `<div class="composer"><textarea id="prompt" aria-label="会话输入" placeholder="描述要做的事情…"></textarea><div class="composer-footer"><span>Codex · 默认配置</span><button class="btn btn-primary" data-action="start-session">开始会话</button></div></div>` +
      `<div class="workspace-links"><button class="btn btn-ghost" data-action="overview" data-id="${p.id}">项目总览</button><button class="btn btn-ghost" data-action="config" data-id="${
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
      }<section class="config-section"><h3>${p.hosts.includes('local') ? '本机展示' : '所属主机展示'}</h3><div class="field"><label for="project-visibility">项目类型</label><select id="project-visibility" class="input" ${!p.hosts.includes('local') ? 'disabled' : ''}><option value="personal" ${W.categoryOf(p) === 'personal' ? 'selected' : ''}>个人项目</option><option value="team" ${W.categoryOf(p) === 'team' ? 'selected' : ''}>团队项目</option></select></div><p class="form-hint">${p.hosts.includes('local') ? '个人项目不出现在其他客户端的共享项目墙。切换立即保存到本机，不提交 PR；已打开的工作区不受影响。' : '此项目仅在远端主机上；展示类型由所属主机设置。克隆到本机后可设置本机副本。'}</p></section><section class="config-section"><h3>共享项目信息</h3><p class="form-hint">名称、介绍与主要 Builder 在同一处维护。</p>${W.fields
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
      )}</span></div>${(p.extraRepos || []).map((r, i) => `<div class="repo-detail"><span>${esc(r.name)}</span><span class="mono muted">${esc(r.path)}</span><button class="inline-link" data-action="remove-extra-repo" data-id="${i}">移除登记</button></div>`).join('')}<button class="btn btn-ghost" data-action="handoff" data-id="仓库设置">打开仓库设置</button><button class="btn btn-ghost" data-action="add-repo">添加代码仓</button><button class="btn btn-ghost" data-action="remove-repo">移除本机登记</button></section>` +
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
          : `<button id="review-info" class="btn btn-primary" data-action="review-info" ${!W.dirty() || !s.draft.name.trim() ? 'disabled' : ''}>查看变更</button>`
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
