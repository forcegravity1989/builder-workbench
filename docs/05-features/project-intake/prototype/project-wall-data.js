// Review fixtures only. No product API, filesystem or persistent storage.
;(() => {
  const paths = {
    wall: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    folder:
      '<path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="m18 6-12 12M6 6l12 12"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    refresh: '<path d="M3 11a9 9 0 0 1 15-6l3 2m0-4v4h-4M21 13a9 9 0 0 1-15 6l-3-2m4 0H3v4"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>',
    settings: '<path d="M21 4h-7m-4 0H3m18 8h-9m-4 0H3m18 8h-5m-4 0H3M14 2v4m-6 4v4m8 4v4"/>',
    external:
      '<path d="M15 3h6v6m0-6-9 9M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>',
    git: '<circle cx="6" cy="3" r="2"/><path d="M6 5v12m12-9a6 6 0 0 1-6 6H6"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="19" r="2"/>',
    task: '<path d="m3 6 2 2 4-4m-6 9 2 2 4-4m4-5h8m-8 7h8m-8 7h8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    book: '<path d="M3 3h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v17h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3Zm9 2v17"/>',
    overview:
      '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    workspace: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5V13m9-5v5m-7 5 3 3 5-6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4m0 3h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11v6"/>',
    card: '<rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M5 16a3 3 0 0 1 6 0m4-8h3m-3 4h3m-3 4h3"/>',
    edit: '<path d="m16 3 5 5-12 12-5 1 1-5L16 3Z"/>',
    unlink:
      '<path d="m10 13 4-4m-6 7-2 2a4 4 0 0 1-6-6l4-4m12 2 2-2a4 4 0 0 0-6-6l-2 2M3 3l18 18"/>',
    'file-input':
      '<path d="M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1M14 2v5a1 1 0 0 0 1 1h5M2 15h10m-3 3 3-3-3-3"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
  }
  const W = {
    $: (id) => document.getElementById(id),
    esc: (value) =>
      String(value ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
      ),
    icon: (name) =>
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.folder}</svg>`,
    fields: [
      ['name', '项目名称'],
      ['builder', '项目负责人'],
      ['brief', '简介'],
      ['benchmark', '对标'],
      ['opportunity', '目标方向']
    ],
    state: {
      projects: [],
      active: null,
      config: null,
      draft: null,
      editing: false,
      filter: 'all',
      category: 'all',
      viewer: 'self',
      query: '',
      scenario: 'mixed',
      mode: 'wall',
      reuse: null,
      pendingLeave: null,
      updated: '',
      hostReadFailed: false
    }
  }
  W.button = (action, name, label, id = '', extra = '', disabled = false) =>
    `<button type="button" class="icon-btn ${extra}" data-action="${action}" data-id="${W.esc(id)}" aria-label="${W.esc(label)}"${disabled ? ' disabled' : ''}>${W.icon(name)}<span class="tip" role="tooltip">${W.esc(label)}</span></button>`
  W.help = (text) =>
    `<button type="button" class="icon-btn help-tip" aria-label="${W.esc(text)}">${W.icon('info')}<span class="tip" role="tooltip">${W.esc(text)}</span></button>`
  W.annotation = (text) =>
    `<div class="prototype-note"><strong>原型注释</strong><p>${text}</p></div>`
  W.hosts = {
    local: { name: '本机', online: true },
    dev: { name: '张三的电脑', online: true },
    lab: { name: '李四的电脑', online: false }
  }
  W.fixtures = () => [
    {
      id: 'bw',
      name: 'Builder Workbench',
      builder: '张悦',
      brief: '把项目计划、开发与验收放在同一条旅程里。',
      benchmark: '团队现有研发工作台',
      opportunity: '减少重复操作，保持项目上下文',
      hosts: ['local', 'dev'],
      sharing: { local: 'team', dev: 'team' },
      version: 'v1.0',
      goals: [
        '项目墙：原型评审与开发落地',
        '消息通知：聚焦 PR 评审旅程落地',
        '用户旅程盘点与存量问题清理'
      ],
      plan: '已归档',
      tasks: { completed: 3, total: 7 },
      acceptance: '待验收',
      kind: 'git',
      remote: 'github.com/example/builder-workbench',
      path: 'E:/projects/builder-workbench'
    },
    {
      id: 'ops',
      name: '运维看板',
      builder: '',
      brief: '服务运行情况与日常巡检。',
      benchmark: '',
      opportunity: '',
      hosts: ['dev'],
      sharing: { dev: 'team' },
      version: 'v1.3',
      goals: [
        '让每条告警都能准确定位到对应服务、关联最近一次变更，并让值班同学在一次操作内找到完整排查上下文与处置记录',
        '降低日常巡检中的重复操作'
      ],
      plan: '已归档',
      tasks: { completed: 10, total: 10 },
      acceptance: '未达成',
      kind: 'git',
      remote: 'github.com/example/ops-dashboard',
      path: '/home/projects/ops-dashboard'
    },
    {
      id: 'lab',
      name: '数据实验',
      builder: '李青',
      brief: '小样本实验与结果整理。',
      benchmark: '',
      opportunity: '',
      hosts: ['lab'],
      sharing: { lab: 'team' },
      version: undefined,
      goals: [],
      kind: 'git',
      remote: 'github.com/example/data-lab',
      path: '/home/projects/data-lab'
    },
    {
      id: 'web',
      name: '个人网站',
      builder: '陈知',
      brief: '',
      benchmark: '',
      opportunity: '',
      hosts: ['local'],
      version: 'v1.0',
      goals: ['发布作品页', '完成移动端浏览验证'],
      plan: '已归档',
      tasks: { completed: 6, total: 6 },
      acceptance: '已达成',
      kind: 'git',
      remote: 'github.com/example/personal-site',
      path: 'E:/projects/personal-site'
    },
    {
      id: 'shun',
      group: true,
      name: 'shunfenger',
      builder: '',
      brief: '日常工具与小实验。',
      benchmark: '',
      opportunity: '',
      hosts: ['local'],
      version: null,
      goals: [],
      kind: 'git',
      remote: 'github.com/example/shunfenger',
      path: 'E:/projects/shunfenger',
      repos: [
        {
          id: 'shun-api',
          name: 'shunfenger-api',
          remote: 'github.com/example/shunfenger-api',
          path: 'E:/projects/shunfenger/api',
          host: 'local'
        },
        {
          id: 'shun-web',
          name: 'shunfenger-web',
          remote: 'github.com/example/shunfenger-web',
          path: 'E:/projects/shunfenger/web',
          host: 'local'
        }
      ]
    },
    {
      id: 'notes',
      name: '工作笔记',
      builder: '',
      brief: '随手记录，按需整理。',
      benchmark: '',
      opportunity: '',
      hosts: ['local'],
      version: null,
      goals: [],
      kind: 'folder',
      remote: '',
      path: 'E:/notes'
    }
  ]
  const s = W.state
  W.project = (id) => s.projects.find((p) => p.id === id)
  W.repoSlots = (p) => p.repos || [{ id: p.id, name: p.name, remote: p.remote, path: p.path }]
  W.updateTime = () => `更新于 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`
  W.available = (p) => p.hosts.some((h) => W.hosts[h].online)
  W.visibility = (p, host) => p.sharing?.[host] || 'personal'
  W.categoryOf = (p) => W.visibility(p, p.hosts.includes('local') ? 'local' : p.hosts[0])
  W.dirty = () =>
    Boolean(
      s.config &&
      s.draft &&
      W.fields.some(([key]) => s.draft[key].trim() !== (W.project(s.config)[key] || '').trim())
    )
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
          `${p.name} ${p.brief} ${p.builder || ''}`.toLowerCase().includes(s.query.toLowerCase()))
        ? [{ ...p, hosts }]
        : []
    })
  W.sourceTags = (p) =>
    p.hosts
      .map(
        (h) =>
          `<span class="source-chip${!W.hosts[h].online ? ' offline' : ''}" title="${W.esc(W.hosts[h].name)}${h === 'local' ? '' : W.hosts[h].online ? ' · 在线' : ' · 离线'}">${W.icon('monitor')}<span>${W.esc(W.hosts[h].name)}${!W.hosts[h].online ? ' · 离线' : ''}</span></span>`
      )
      .join('')
  W.motto = '<p class="four-principles">聚焦目标 · 关注引领指标 · 建立记分表 · 保持问责节奏</p>'
  window.WallProto = W
})()
