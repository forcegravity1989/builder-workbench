// Fixture facts only: no product API, filesystem, network requests or persistent storage.
;(() => {
  const paths = {
    wall: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    folder:
      '<path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="m18 6-12 12M6 6l12 12"/>',
    arrow: '<path d="m9 5 7 7-7 7"/>',
    back: '<path d="m12 19-7-7 7-7m-7 7h14"/>',
    refresh: '<path d="M3 11a9 9 0 0 1 15-6l3 2m0-4v4h-4M21 13a9 9 0 0 1-15 6l-3-2m4 0H3v4"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>',
    settings: '<path d="M21 4h-7m-4 0H3m18 8h-9m-4 0H3m18 8h-5m-4 0H3M14 2v4m-6 4v4m8 4v4"/>',
    external:
      '<path d="M15 3h6v6m0-6-9 9M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>',
    git: '<circle cx="6" cy="3" r="2"/><path d="M6 5v12m12-9a6 6 0 0 1-6 6H6"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="19" r="2"/>',
    pr: '<circle cx="6" cy="3" r="2"/><circle cx="6" cy="21" r="2"/><path d="M6 5v14m9-16 3 3-3 3m3-3h-3v9"/><circle cx="15" cy="19" r="2"/>',
    session: '<path d="m5 7 5 5-5 5m8 0h6"/><rect x="2" y="3" width="20" height="18" rx="2"/>',
    task: '<path d="m3 6 2 2 4-4m-6 9 2 2 4-4m4-5h8m-8 7h8m-8 7h8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    book: '<path d="M3 3h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v17h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3Zm9 2v17"/>',
    pin: '<path d="m16 3 5 5-4 1-4 4-1 5-6-6 5-1 4-4Zm-8 13-5 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    globe:
      '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>'
  }
  const W = {
    $: (id) => document.getElementById(id),
    esc: (value) =>
      String(value ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
      ),
    icon: (name, cls = '') =>
      `<svg class="${
        cls
      }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
        paths[name] || paths.folder
      }</svg>`,
    fields: [
      ['name', '项目名称'],
      ['brief', '简介'],
      ['benchmark', '对标'],
      ['opportunity', '目标方向'],
      ['builder', '主要 Builder']
    ],
    state: {
      projects: [],
      active: null,
      host: 'local',
      config: null,
      draft: null,
      filter: 'all',
      category: 'all',
      view: 'projects',
      viewer: 'self',
      remembered: {},
      workspaceSessions: {},
      workspace: 'main',
      sort: 'native',
      query: '',
      scenario: 'mixed',
      updated: '刚刚更新',
      addHost: 'local',
      addMode: '',
      added: null,
      dialog: '',
      pendingLeave: null,
      newSession: false
    }
  }
  W.button = (action, icon, label, id = '', extra = '') =>
    `<button type="button" class="icon-btn ${extra}" data-action="${action}" data-id="${W.esc(
      id
    )}" aria-label="${W.esc(label)}">${W.icon(icon)}<span class="tip" role="tooltip">${W.esc(
      label
    )}</span></button>`
  W.hosts = {
    local: { name: '本机', online: true },
    dev: { name: '研发主机', online: true },
    lab: { name: '实验室主机', online: false },
    ssh: { name: 'SSH 开发机', online: true }
  }
  W.fixtures = () => [
    {
      id: 'bw',
      name: 'Builder Workbench',
      brief: '从项目计划到交付，让每一版的承诺可追溯。',
      benchmark: '团队现有研发工作台',
      opportunity: '减少重复操作，保持项目上下文',
      hosts: ['local', 'dev'],
      version: 'v0.9',
      done: 12,
      open: 5,
      sessions: 3,
      prs: 8,
      kind: 'git',
      remote: 'github.com/example/builder-workbench',
      path: 'E:/projects/builder-workbench',
      charter: true
    },
    {
      id: 'shun',
      name: 'shunfenger',
      brief: '',
      benchmark: '',
      opportunity: '',
      hosts: ['local'],
      version: null,
      done: null,
      open: null,
      sessions: 1,
      prs: 2,
      kind: 'git',
      remote: 'github.com/example/shunfenger',
      path: 'E:/projects/shunfenger',
      charter: false
    },
    {
      id: 'ops',
      name: '运维看板',
      brief: '服务运行情况与日常巡检。',
      benchmark: '',
      opportunity: '',
      hosts: ['dev'],
      version: 'v1.3',
      done: 7,
      open: 3,
      sessions: 2,
      prs: 1,
      kind: 'git',
      remote: 'github.com/example/ops-dashboard',
      path: '/home/projects/ops-dashboard',
      charter: true
    },
    {
      id: 'notes',
      name: '工作笔记',
      brief: '',
      benchmark: '',
      opportunity: '',
      hosts: ['local'],
      version: null,
      sessions: 0,
      prs: null,
      kind: 'folder',
      remote: '',
      path: 'E:/notes',
      charter: false
    },
    {
      id: 'lab',
      name: '数据实验',
      brief: '小样本实验与结果整理。',
      benchmark: '',
      opportunity: '',
      hosts: ['lab'],
      version: undefined,
      done: null,
      open: null,
      sessions: null,
      prs: null,
      kind: 'git',
      remote: 'github.com/example/data-lab',
      path: '/home/projects/data-lab',
      charter: true
    },
    {
      id: 'web',
      name: '个人网站',
      brief: '',
      benchmark: '',
      opportunity: '',
      hosts: ['local'],
      version: null,
      sessions: 0,
      prs: 0,
      kind: 'git',
      remote: 'github.com/example/personal-site',
      path: 'E:/projects/personal-site',
      charter: false
    }
  ]
  const baseFixtures = W.fixtures
  W.fixtures = () => {
    const projects = baseFixtures()
    // Explicit sample choices, never an inference from an existing charter.
    projects[0].sharing = { local: 'team', dev: 'team' }
    projects[0].builder = '张悦'
    projects[2].sharing = { dev: 'team' }
    projects[2].builder = '李青'
    projects[4].sharing = { lab: 'team' }
    projects[5].builder = '陈知'
    projects[0].delivery = {
      promise: '统一项目入口，让个人项目可以直接进入工作',
      date: '2026-11-12',
      handshake: '已确认',
      plan: '已归档',
      development: '2 个 PR 待审',
      acceptance: '未记录',
      note: '本版有 3 个实现 PR 已合入、2 个待审；尚未读到本版人工验收记录。',
      pr: '计划 PR #101 · 已合入',
      devPr: '实现 PR #102 / #103 · 待审',
      verdict: null
    }
    projects[2].delivery = {
      promise: '告警可定位到具体服务，完成首轮试运行',
      date: '2026-11-10',
      handshake: '已确认',
      plan: '已归档',
      development: '实现已合入',
      acceptance: '未达成',
      note: '人工验收确认：服务定位已可用，告警误报仍需修正。实现 PR 合入不改变此结论。',
      pr: '计划 PR #201 · 已合入',
      devPr: '实现 PR #202 · 已合入',
      verdict: '人工确认未达成 · 同版同承诺'
    }
    projects[5].version = 'v1.0'
    projects[5].delivery = {
      promise: '发布作品页，并完成移动端浏览验证',
      date: '2026-11-06',
      handshake: '已确认',
      plan: '已归档',
      development: '实现已合入',
      acceptance: '已达成',
      note: '同版同承诺的人工验收已确认达成。后续拟议日期不改变这次结果。',
      pr: '计划 PR #301 · 已合入',
      devPr: '实现 PR #302 · 已合入',
      verdict: '人工确认达成 · 同版同承诺'
    }
    return [projects[0], projects[2], projects[5], projects[1], projects[3], projects[4]]
  }
  W.project = (id) => W.state.projects.find((p) => p.id === id)
  W.available = (p) => p.hosts.some((h) => W.hosts[h].online)
  W.dirty = () =>
    W.state.config &&
    W.fields.some(
      ([key]) => W.state.draft[key].trim() !== (W.project(W.state.config)[key] || '').trim()
    )
  W.sourceTags = (p) =>
    p.hosts
      .map(
        (h) =>
          `<span class="source-chip ${!W.hosts[h].online ? 'offline' : ''}">${
            h === 'local'
              ? W.icon('monitor')
              : `<i class="connection-dot ${W.hosts[h].online ? 'online' : ''}"></i>`
          }${W.hosts[h].name}${
            h !== 'local' ? (W.hosts[h].online ? ' · 在线' : ' · 离线') : ''
          }</span>`
      )
      .join('')
  const s = W.state
  W.visibility = (p, host) => p.sharing?.[host] || 'personal'
  W.visibleProjects = () =>
    s.projects.flatMap((p) => {
      const hosts = p.hosts
        .filter((h) =>
          s.viewer === 'peer'
            ? h === 'local' && W.visibility(p, h) === 'team'
            : h === 'local' || W.visibility(p, h) === 'team'
        )
        .filter((h) => s.category === 'all' || W.visibility(p, h) === s.category)
        .filter((h) => s.filter === 'all' || (s.filter === 'local' ? h === 'local' : h !== 'local'))
      return hosts.length &&
        (!s.query ||
          `${p.name} ${p.brief} ${p.builder || ''} ${p.path}`
            .toLowerCase()
            .includes(s.query.toLowerCase()))
        ? [{ ...p, hosts }]
        : []
    })
  W.categoryOf = (p) => W.visibility(p, p.hosts.includes('local') ? 'local' : p.hosts[0])
  W.motto = '<p class="four-principles">聚焦目标 · 关注引领指标 · 建立记分表 · 保持问责节奏</p>'
  window.WallProto = W
})()
