;(() => {
  'use strict'

  // Static output from the same Lucide components as the current renderer.
  const icons = {
    CircleHelp:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-question-mark" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg>',
    RefreshCw:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw" aria-hidden="true" focusable="false"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>',
    UsersRound:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-users-round" aria-hidden="true" focusable="false"><path d="M18 21a8 8 0 0 0-16 0"></path><circle cx="10" cy="8" r="5"></circle><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"></path></svg>',
    Plus: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus" aria-hidden="true" focusable="false"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>',
    X: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true" focusable="false"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>',
    LayoutGrid:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-grid" aria-hidden="true" focusable="false"><rect width="7" height="7" x="3" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="14" rx="1"></rect><rect width="7" height="7" x="3" y="14" rx="1"></rect></svg>',
    PackageCheck:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-package-check" aria-hidden="true" focusable="false"><path d="M12 22V12"></path><path d="m16 17 2 2 4-4"></path><path d="M21 11.127V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.32-.753"></path><path d="M3.29 7 12 12l8.71-5"></path><path d="m7.5 4.27 8.997 5.148"></path></svg>',
    LayoutDashboard:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-dashboard" aria-hidden="true" focusable="false"><rect width="7" height="9" x="3" y="3" rx="1"></rect><rect width="7" height="5" x="14" y="3" rx="1"></rect><rect width="7" height="9" x="14" y="12" rx="1"></rect><rect width="7" height="5" x="3" y="16" rx="1"></rect></svg>',
    ListTodo:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-todo" aria-hidden="true" focusable="false"><path d="M13 5h8"></path><path d="M13 12h8"></path><path d="M13 19h8"></path><path d="m3 17 2 2 4-4"></path><rect x="3" y="4" width="6" height="6" rx="1"></rect></svg>',
    CalendarClock:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-clock" aria-hidden="true" focusable="false"><path d="M16 14v2.2l1.6 1"></path><path d="M16 2v4"></path><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"></path><path d="M3 10h5"></path><path d="M8 2v4"></path><circle cx="16" cy="16" r="6"></circle></svg>',
    BookOpen:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-book-open" aria-hidden="true" focusable="false"><path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg>',
    Settings:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true" focusable="false"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    ExternalLink:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-external-link" aria-hidden="true" focusable="false"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>',
    SlidersHorizontal:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sliders-horizontal" aria-hidden="true" focusable="false"><path d="M10 5H3"></path><path d="M12 19H3"></path><path d="M14 3v4"></path><path d="M16 17v4"></path><path d="M21 12h-9"></path><path d="M21 19h-5"></path><path d="M21 5h-7"></path><path d="M8 10v4"></path><path d="M8 12H3"></path></svg>',
    Download:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download" aria-hidden="true" focusable="false"><path d="M12 15V3"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m7 10 5 5 5-5"></path></svg>',
    FilePenLine:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-pen-line" aria-hidden="true" focusable="false"><path d="M14.364 13.634a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506l4.013-4.009a1 1 0 0 0-3.004-3.004z"></path><path d="M14.487 7.858A1 1 0 0 1 14 7V2"></path><path d="M20 19.645V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l2.516 2.516"></path><path d="M8 18h1"></path></svg>',
    Ellipsis:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-ellipsis" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>',
    GitPullRequest:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-git-pull-request" aria-hidden="true" focusable="false"><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M13 6h3a2 2 0 0 1 2 2v7"></path><line x1="6" x2="6" y1="9" y2="21"></line></svg>',
    PanelLeft:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-left" aria-hidden="true" focusable="false"><rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M9 3v18"></path></svg>',
    PanelRight:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-right" aria-hidden="true" focusable="false"><rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M15 3v18"></path></svg>',
    Minus:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus" aria-hidden="true" focusable="false"><path d="M5 12h14"></path></svg>',
    Square:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square" aria-hidden="true" focusable="false"><rect width="18" height="18" x="3" y="3" rx="2"></rect></svg>',
    FolderGit2:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-git2 lucide-folder-git-2" aria-hidden="true" focusable="false"><path d="M18 19a5 5 0 0 1-5-5v8"></path><path d="M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5"></path><circle cx="13" cy="12" r="2"></circle><circle cx="20" cy="19" r="2"></circle></svg>',
    ArrowLeft:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left" aria-hidden="true" focusable="false"><path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path></svg>',
    Check:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"></path></svg>',
    Terminal:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-terminal" aria-hidden="true" focusable="false"><path d="M12 19h8"></path><path d="m4 17 6-6-6-6"></path></svg>',
    Network:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-network" aria-hidden="true" focusable="false"><rect x="16" y="16" width="6" height="6" rx="1"></rect><rect x="2" y="16" width="6" height="6" rx="1"></rect><rect x="9" y="2" width="6" height="6" rx="1"></rect><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"></path><path d="M12 12V8"></path></svg>',
    Lock: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock" aria-hidden="true" focusable="false"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
    Search:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search" aria-hidden="true" focusable="false"><path d="m21 21-4.34-4.34"></path><circle cx="11" cy="11" r="8"></circle></svg>',
    Copy: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy" aria-hidden="true" focusable="false"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>',
    Trash2:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2 lucide-trash-2" aria-hidden="true" focusable="false"><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
    Pencil:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil" aria-hidden="true" focusable="false"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path><path d="m15 5 4 4"></path></svg>',
    Server:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-server" aria-hidden="true" focusable="false"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"></rect><rect width="20" height="8" x="2" y="14" rx="2" ry="2"></rect><line x1="6" x2="6.01" y1="6" y2="6"></line><line x1="6" x2="6.01" y1="18" y2="18"></line></svg>',
    Pin: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pin" aria-hidden="true" focusable="false"><path d="M12 17v5"></path><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path></svg>',
    Send: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send" aria-hidden="true" focusable="false"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path></svg>'
  }

  const names = { lead: '韩岚', lin: '林安', chen: '陈远' }
  const hosts = {
    lin: { name: '安泰工作站', tree: 'issue-184-export', task: '发布清单导出' },
    chen: { name: '远舟工作站', tree: 'issue-192-import', task: '导入错误定位' }
  }
  const project = '星图服务'
  const teamName = '神盾局'
  const demoGroup = '938583054774198541'
  const demoSpace = '200000000000000001'
  const demoProjectGroup = '300000000000000001'
  const employees = { lead: 'A0010001', lin: 'A0010002', chen: 'A0010003' }
  const addresses = { lin: 'ws://192.0.2.10:6768', chen: 'ws://192.0.2.11:6771' }
  const dayMs = 86_400_000
  const auditRetentionDays = 30
  // Catalog identity only. Which desktop currently has the repo is wallRepos.
  const catalogRepos = {
    star: {
      repoId: 'star',
      name: project,
      repository: 'https://codehub.example.invalid/team/star',
      group: demoProjectGroup,
      task: '发布清单导出'
    },
    board: {
      repoId: 'board',
      name: '交付看板',
      repository: 'https://codehub.example.invalid/team/delivery-board',
      group: '',
      task: '整理项目看板'
    }
  }
  // The project wall is the local source of truth for what a desktop can publish.
  // A team directory records only the canonical project identity and host members
  // who have actively published that project as a source.
  const wallRepos = { lead: [], lin: ['star'], chen: ['star', 'board'] }
  const samplePairing = 'orca://pair?code=demo-antai'
  const charterOwner = '林安'
  const key = 'bw-team-collaboration-342-bind'
  const auditActionTaxonomy = [
    '连接共享主机',
    '查看工作树',
    '读取项目文件',
    '查看已有会话',
    '查看终端输出',
    '订阅资源更新',
    '结束资源订阅',
    '新建工作树',
    '新建会话',
    '发送会话输入',
    '执行终端命令',
    '授予完全访问',
    '恢复只读',
    '撤销共享连接',
    '未归类动作'
  ]
  const actor = document.querySelector('#actor')
  const surface = document.querySelector('#surface')
  const dialog = document.querySelector('#dialog')
  const status = document.querySelector('#status')
  let confirmForm
  let desktops = resetDesktops()
  let state = load()

  function resetDesktops() {
    return Object.fromEntries(
      Object.keys(names).map((person) => [
        person,
        {
          screen: 'wall',
          directoryDraft: null,
          directoryBase: 'null',
          source: person === 'lead' ? 'lin' : person,
          panel: '',
          prior: 'wall',
          server: false,
          workflow: 'connect',
          repoId: 'star',
          addingServer: false,
          notifications: false,
          tab: 'session',
          auditFilters: defaultAuditFilters()
        }
      ])
    )
  }

  function fixture(ready = false) {
    return {
      directory: ready ? seedDirectory() : null,
      bound: ready
        ? { lead: true, lin: true, chen: true }
        : { lead: false, lin: false, chen: false },
      teamEndpoints: ready ? { ...addresses } : {},
      teamConnections: ready
        ? {
            lead: { lin: addresses.lin, chen: addresses.chen },
            lin: { chen: addresses.chen },
            chen: { lin: addresses.lin }
          }
        : { lead: {}, lin: {}, chen: {} },
      // WeLink group-space permissions decide who can edit the shared file.
      // The prototype keeps every bound member editable so the UI does not
      // invent a second permission system.
      directoryEditable: { lead: true, lin: true, chen: true },
      generatedLinks: ready ? { lin: samplePairing } : {},
      offered: ready,
      accessModes: ready ? { chen: { lin: 'readonly' } } : { lead: {}, lin: {}, chen: {} },
      full: false,
      review: null,
      prunedExpired: 0,
      logs: {
        lin: ready
          ? [
              [
                Date.now(),
                '韩岚 · 韩岚桌面',
                '星图服务 · issue-184-export',
                '发送会话输入',
                '已拒绝 · 团队只读'
              ],
              [
                Date.now() - dayMs,
                '陈远 · 陈远桌面',
                '星图服务',
                '未归类动作',
                '已拒绝 · 未知动作'
              ],
              [Date.now() - 29 * dayMs, '韩岚 · 韩岚桌面', '星图服务', '查看已有会话', '已放行'],
              [Date.now() - 31 * dayMs, '韩岚 · 韩岚桌面', '星图服务', '查看已有会话', '已放行']
            ]
          : [],
        chen: []
      }
    }
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(key))
      if (!raw) {
        return fixture(false)
      }
      raw.bound ??= { lead: false, lin: false, chen: false }
      raw.directory = normalizeDirectory(raw.directory)
      raw.directoryEditable = { lead: true, lin: true, chen: true, ...(raw.directoryEditable ?? {}) }
      raw.generatedLinks ??= raw.offered ? { lin: samplePairing } : {}
      raw.accessModes ??= { lead: {}, lin: {}, chen: {} }
      raw.teamConnections ??= { lead: {}, lin: {}, chen: {} }
      raw.teamEndpoints ??= {}
      return raw
    } catch {
      return fixture(false)
    }
  }

  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // The local fixture remains available in this browser session.
    }
  }

  function current() {
    return desktops[actor.value]
  }

  function esc(value) {
    return String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[char]
    )
  }

  function icon(name) {
    return icons[name]
  }

  function iconButton(
    name,
    label,
    action,
    { value = '', selected = false, added = false, disabled = false, hint = '' } = {}
  ) {
    if (!action) {
      return `<span class="icon-button quiet-icon" title="${label}">${icon(name)}</span>`
    }
    return `<button type="button" class="icon-button${selected ? ' selected' : ''}${added ? ' proposed' : ''}" aria-label="${label}" title="${hint || label}"${hint ? ' data-permission-hint' : ''}${action ? ` data-action="${action}" data-value="${value}"` : ''}${disabled ? ' disabled' : ''}>${icon(name)}</button>`
  }

  function button(label, action, { value = '', kind = 'secondary', disabled = false } = {}) {
    return `<button type="button" class="btn btn-${kind}" data-action="${action}" data-value="${value}"${disabled ? ' disabled' : ''}>${label}</button>`
  }

  function notify(text) {
    status.textContent = text
  }

  function show(screen) {
    const desktop = current()
    if (screen === 'settings') {
      desktop.prior = desktop.screen
    }
    desktop.screen = screen
    desktop.panel = ''
    desktop.notifications = false
    render()
  }

  function confirm(title, body, label, handler) {
    confirmForm = handler
    dialog.innerHTML = `<form class="dialog-form"><header><h2 id="dialog-title">${title}</h2></header>${body}<footer class="dialog-actions">${button('取消', 'close-dialog', { kind: 'ghost' })}<button type="submit" class="btn btn-primary">${label}</button></footer></form>`
    dialog.showModal()
  }

  function blankDirectory(groupId = demoGroup) {
    return {
      schema_version: 1,
      team_group_id: groupId,
      team_space_id: demoSpace,
      hosts: [],
      projects: []
    }
  }

  function seedDirectory() {
    const directory = blankDirectory()
    directory.hosts = Object.keys(hosts).map((person) => ({
      id: `${person}-desktop`,
      member_id: employees[person],
      name: hosts[person].name,
      address: addresses[person]
    }))
    directory.projects = [
      {
        repo_id: catalogRepos.star.repoId,
        name: catalogRepos.star.name,
        repository: catalogRepos.star.repository,
        sources: [employees.lin, employees.chen]
      }
    ]
    return directory
  }

  function repoIdForEntry(entry) {
    if (!entry) {
      return ''
    }
    if (entry.repo_id && catalogRepos[entry.repo_id]) {
      return entry.repo_id
    }
    return Object.keys(catalogRepos).find(
      (id) => catalogRepos[id].repository === entry.repository
    ) ?? ''
  }

  function normalizeDirectory(directory) {
    if (!directory) {
      return directory
    }
    directory.projects = (directory.projects ?? []).map((entry) => {
      const repoId = repoIdForEntry(entry)
      return {
        ...entry,
        repo_id: repoId,
        name: entry.name ?? catalogRepos[repoId]?.name ?? '未命名项目',
        repository: entry.repository ?? catalogRepos[repoId]?.repository ?? '',
        sources: [...new Set(entry.sources ?? [])]
      }
    })
    return directory
  }

  function localRepos(person = actor.value) {
    return (wallRepos[person] ?? [])
      .map((id) => [id, catalogRepos[id]])
      .filter(([, repo]) => repo)
  }

  function knownDirectory() {
    return state.bound?.[actor.value] ? state.directory : null
  }

  function teamProjects(directory = knownDirectory()) {
    return directory?.projects ?? []
  }

  function teamProject(repoId = 'star', directory = knownDirectory()) {
    return teamProjects(directory).find((entry) => repoIdForEntry(entry) === repoId)
  }

  function directoryHost(person, directory = knownDirectory()) {
    return directory?.hosts.find((entry) => entry.member_id === employees[person])
  }

  function sourceOwners(repoId = 'star', directory = knownDirectory()) {
    const entry = teamProject(repoId, directory)
    return (entry?.sources ?? [])
      .map((memberId) => Object.keys(employees).find((person) => employees[person] === memberId))
      .filter((person) => person && hosts[person])
  }

  function memberName(id) {
    const person = Object.keys(employees).find((key) => employees[key] === id)
    return person ? names[person] : esc(id)
  }

  function accessLevel(owner, visitor = actor.value) {
    if (owner === visitor) {
      return 'owner'
    }
    return state.accessModes?.[visitor]?.[owner] ??
      (state.full && owner === 'lin' && visitor === 'chen' ? 'full' : 'readonly')
  }

  function registered(person, repoId = 'star', directory = knownDirectory()) {
    return Boolean(teamProject(repoId, directory) && directoryHost(person, directory) && sourceOwners(repoId, directory).includes(person))
  }

  function canReadTeamSource(owner, visitor = actor.value, repoId = 'star') {
    const host = directoryHost(owner)
    return (
      registered(owner, repoId) &&
      state.teamConnections?.[visitor]?.[owner] === host?.address &&
      state.teamEndpoints?.[owner] === host?.address
    )
  }

  function sourceAvailable(owner, repoId = 'star') {
    return owner === actor.value || accessLevel(owner) === 'full' || canReadTeamSource(owner, actor.value, repoId)
  }

  function sourceValue(value) {
    const [owner, repoId = 'star'] = String(value || '').split('|')
    return { owner, repoId }
  }

  function enterSource(value) {
    const { owner, repoId } = sourceValue(value)
    if (!hosts[owner]) {
      return
    }
    if (sourceAvailable(owner, repoId)) {
      openWorkspace(owner, repoId)
      return
    }
    if (!registered(owner, repoId)) {
      notify('这个项目来源尚未登记，请在项目墙加入本机来源或返回选择可用来源。')
      return
    }
    const host = directoryHost(owner)
    if (state.teamEndpoints[owner] !== host.address) {
      confirm(
        '无法连接 Orca 共享主机',
        '<p>请让主机持有人先共享此主机，并核对群空间目录里的共享地址。</p>',
        '返回项目墙',
        () => show('wall')
      )
      return
    }
    confirm(
      '连接共享主机',
      `<p>连接 <strong>${esc(host.name)}</strong> <span class="field-note">${esc(host.address)}</span>。团队成员默认只读。</p>`,
      '连接',
      () => {
        state.teamConnections[actor.value][owner] = host.address
        state.accessModes[actor.value] ??= {}
        state.accessModes[actor.value][owner] = 'readonly'
        audit(owner, '连接共享主机', '已放行', host.name)
        openWorkspace(owner, repoId)
      }
    )
  }

  function ensureShareEndpoint(person) {
    if (!addresses[person]) {
      return null
    }
    if (!state.teamEndpoints[person]) {
      state.teamEndpoints[person] = addresses[person]
    }
    return state.teamEndpoints[person]
  }

  function editCatalogProject(value) {
    const draft = current().directoryDraft
    const index = value === '' ? -1 : Number(value)
    const entry = draft.projects[index]
    const available = localRepos()
    if (!available.length && index < 0) {
      confirm(
        '本机没有可加入的项目',
        `<p>${names[actor.value]}的项目墙上还没有仓库。</p>`,
        '关闭',
        () => {}
      )
      return
    }
    const currentRepoId = repoIdForEntry(entry)
    const repoKey =
      available.find(([id]) => id === currentRepoId)?.[0] ??
      available[0]?.[0] ??
      ''
    if (!repoKey) {
      notify('本机没有可更换的仓库。')
      return
    }
    const selection = available
      .map(
        ([id, repo]) =>
          `<option value="${id}"${id === repoKey ? ' selected' : ''}>${repo.name}</option>`
      )
      .join('')
    confirm(
      entry ? '更换仓库' : '加入团队目录',
      `<label class="field">本机项目<select id="directory-repo" class="input" name="repo">${selection}</select></label><p class="field-note" id="directory-remote">${catalogRepos[repoKey].repository}</p><p class="field-note">目录只记录项目身份和来源成员，负责人及参与者仍以项目约定为准。</p>`,
      '确认',
      (data) => {
        const repoId = data.get('repo')
        const repo = catalogRepos[repoId]
        if (!repo || !(wallRepos[actor.value] ?? []).includes(repoId)) {
          notify('只能加入本机已有的仓库。')
          return
        }
        if (
          draft.projects.some(
            (other, slot) => slot !== index && repoIdForEntry(other) === repoId
          )
        ) {
          notify('这个项目已经在团队目录中，请从项目墙加入本机来源。')
          return
        }
        const next = {
          repo_id: repo.repoId,
          name: repo.name,
          repository: repo.repository,
          sources: [...new Set([...(entry?.sources ?? []), employees[actor.value]])]
        }
        if (index < 0) {
          draft.projects.push(next)
        } else {
          draft.projects[index] = next
        }
        render()
      }
    )
  }

  function joinTeamProject(repoId) {
    const repo = catalogRepos[repoId]
    const directory = knownDirectory()
    const entry = teamProject(repoId, directory)
    if (!repo || !directory || !entry) {
      notify('这个项目还没有团队目录条目，请由团队成员从团队设置加入本机项目。')
      return
    }
    if (!(wallRepos[actor.value] ?? []).includes(repoId)) {
      notify('只能发布本机项目墙上的来源。')
      return
    }
    entry.sources ??= []
    const memberId = employees[actor.value]
    if (entry.sources.includes(memberId)) {
      notify('本机来源已经在团队项目中。')
      return
    }
    entry.sources.push(memberId)
    state.directory = normalizeDirectory(directory)
    notify(`已把${repo.name}的本机来源加入${teamName}团队项目`)
    render()
  }

  function recordAddress(person, address) {
    const draft = current().directoryDraft
    const at = draft.hosts.findIndex((host) => host.member_id === employees[person])
    if (!address.trim()) {
      if (at !== -1) {
        draft.hosts.splice(at, 1)
      }
      return
    }
    const next = {
      id: `${person}-desktop`,
      member_id: employees[person],
      name: hosts[person]?.name ?? `${names[person]}桌面`,
      address: address.trim()
    }
    if (at === -1) {
      draft.hosts.push(next)
    } else {
      draft.hosts[at] = next
    }
  }

  function validHostAddress(value) {
    try {
      const endpoint = new URL(value)
      return (
        /^(wss?):\/\//i.test(value) &&
        endpoint.hostname &&
        !endpoint.username &&
        !endpoint.password &&
        !endpoint.search &&
        !endpoint.hash
      )
    } catch {
      return false
    }
  }

  function hostAddressProblem(value) {
    const text = value.trim()
    if (!text) {
      return null
    }
    if (/^orca:/i.test(text) || /#?pairing=/i.test(text) || /^https?:\/\//i.test(text)) {
      return 'access-link'
    }
    return validHostAddress(text) ? null : 'invalid'
  }

  function saveDirectory() {
    const draft = current().directoryDraft
    if (current().directoryBase !== JSON.stringify(state.directory)) {
      notify('群空间目录已更新。保留了你的草稿，请先核对最新目录。')
      return
    }
    const invalid = draft.hosts.find((host) => hostAddressProblem(host.address))
    if (invalid) {
      const kind = hostAddressProblem(invalid.address)
      const who = memberName(invalid.member_id)
      notify(
        kind === 'access-link'
          ? `${who}填的是访问链接。共享地址用「填入本机共享地址」。`
          : `${who}的共享地址格式不对。`
      )
      return
    }
    state.directory = structuredClone(draft)
    state.bound[actor.value] = true
    current().directoryBase = JSON.stringify(state.directory)
    notify('已保存到群空间')
    render()
  }

  function teamDirectory() {
    const close = iconButton('X', '关闭团队设置', 'panel')
    const draft = current().directoryDraft
    if (!draft) {
      return `<div class="overlay"><section class="surface-dialog" role="dialog" aria-label="团队设置"><header class="row between"><div><small>团队资产</small><h2>团队设置</h2></div>${close}</header><p class="field-note">输入群号后，BW 通过 WeLink 读取群主、成员和群空间。成员与项目来源直接在共享目录中维护。</p><form id="team-lookup"><label class="field">WeLink 群 ID<input class="input" name="group" inputmode="numeric" pattern="[0-9]+" placeholder="${demoGroup}" required></label><footer class="dialog-actions"><button type="submit" class="btn btn-primary">绑定团队</button></footer></form></section></div>`
    }
    const writable = state.directoryEditable[actor.value]
    const people = Object.entries(names)
      .map(([id, name]) => {
        const fill =
          id === actor.value && writable && addresses[id]
            ? button('填入本机共享地址', 'fill-own-share', { kind: 'ghost' })
            : ''
        return `<tr><td><span class="row"><span class="avatar team-avatar" aria-hidden="true">${name[0]}</span><span><strong>${name}</strong><small class="member-number">${employees[id]}</small></span></span></td><td>${id === 'lead' ? '群主' : '成员'}</td><td><div class="row wrap"><input class="input member-address" aria-label="${name}的 Orca 共享地址" data-address="${id}" value="${esc(directoryHost(id, draft)?.address ?? '')}" placeholder="${addresses[id] ? 'ws://…' : ''}"${writable ? '' : ' readonly'}>${fill}</div></td></tr>`
      })
      .join('')
    const projects = draft.projects
      .map((entry, index) => {
        const sources = (entry.sources ?? []).map(memberName).join('、') || '尚未发布来源'
        return `<tr><td><strong>${esc(entry.name)}</strong><small class="member-number">${esc(entry.repository)}</small><small class="member-number">来源成员 · ${esc(sources)}</small></td><td>${iconButton('Pencil', `更换${esc(entry.name)}`, 'edit-catalog-project', { value: String(index), disabled: !writable })}</td></tr>`
      })
      .join('')
    const projectTable = projects
      ? `<div class="table-scroll"><table class="table directory-projects" aria-label="团队项目目录"><thead><tr><th>项目身份与来源</th><th></th></tr></thead><tbody>${projects}</tbody></table></div>`
      : '<p class="field-note">还没有团队项目。成员可以先在自己的项目墙打开本机项目，再加入团队。</p>'
    return `<div class="overlay"><section class="surface-dialog team-directory" role="dialog" aria-label="团队设置">
      <header class="row between"><div><small>WeLink 群空间目录</small><h2>团队设置</h2></div>${close}</header>
      <div class="directory-scroll"><div class="team-binding"><div><small>团队群</small><strong>${teamName}</strong><small>${esc(draft.team_group_id)}</small></div><div><small>群空间</small><strong>${teamName}群空间</strong><small>${esc(draft.team_space_id)}</small></div></div>
      <p class="field-note directory-note">成员姓名和工号来自群成员信息。共享地址由各主机持有人发布，项目负责人和参与者留在项目约定中。</p>
      <div class="row between"><h3>成员与主机</h3>${iconButton('RefreshCw', '刷新团队目录', 'refresh-directory')}</div>
      <div class="table-scroll"><table class="table members-table" aria-label="成员与主机"><thead><tr><th>成员</th><th>身份</th><th>Orca 共享地址</th></tr></thead><tbody>${people}</tbody></table></div>
      <div class="row between directory-project-head"><div><h3>团队项目</h3><small>目录按 repoId 聚合，同一项目的主机来源在项目墙合并显示。</small></div>${button(`${icon('Plus')} 加入团队目录`, 'edit-catalog-project', { disabled: !writable })}</div>
      ${projectTable}
      </div><footer class="row between directory-footer">${button('查看目录文件', 'preview-directory', { kind: 'ghost' })}${writable ? button('保存到群空间', 'save-directory', { kind: 'primary' }) : '<span class="field-note">你有查看权限，编辑权限由 WeLink 管理。</span>'}</footer>
    </section></div>`
  }

  function projectSettings() {
    const repo = catalogRepos[current().repoId] ?? catalogRepos.star
    const entry = teamProject(repo.repoId)
    return `<aside class="project-settings" aria-label="项目设置"><header class="row between"><div><small>项目设置</small><h2>${esc(repo.name)}</h2></div>${iconButton('X', '关闭项目设置', 'panel')}</header>
      <section class="settings-type"><div class="row between"><strong>项目类型</strong><span class="source-access">${entry ? '团队项目' : '个人项目'}</span></div></section><section class="muted-frame"><header class="row between"><h3>项目信息</h3>${iconButton('FilePenLine', '编辑项目信息')}</header><dl><dt>项目名称</dt><dd>${esc(repo.name)}</dd><dt>想做什么</dt><dd>${esc(repo.task)}</dd><dt>项目群</dt><dd>星图服务项目群 · ${esc(demoProjectGroup)}</dd><dt>项目负责人</dt><dd>${charterOwner}</dd></dl></section>
    </aside>`
  }

  function projectCard(repoId, teamEntry = teamProject(repoId)) {
    const repo = catalogRepos[repoId]
    if (!repo) {
      return ''
    }
    const local = localRepos().some(([id]) => id === repoId)
    const owners = teamEntry ? sourceOwners(repoId) : local ? [actor.value] : []
    if (!teamEntry && !local && !owners.length) {
      return ''
    }
    const chips = owners
      .map((owner) => {
        const localSource = owner === actor.value
        const full = ownsFullAccess(owner)
        const accessible = sourceAvailable(owner, repoId)
        const access = localSource
          ? ''
          : ` <span class="source-access">${full ? '完全访问' : accessible ? '只读' : '只读 · 待连接'}</span>`
        const host = directoryHost(owner)?.name ?? hosts[owner].name
        const label = localSource ? `${esc(host)} · 本机` : `${names[owner]} · ${esc(host)}`
        return `<button type="button" class="source-tag" data-action="open-workspace" data-value="${owner}|${repoId}"><span class="source-dot${accessible ? '' : ' pending'}"></span>${label}${access}</button>`
      })
      .join('')
    const sourceOwnersForRepo = sourceOwners(repoId)
    const join = teamEntry && local && !sourceOwnersForRepo.includes(actor.value)
      ? iconButton('UsersRound', '把本机来源加入团队项目', 'join-team-project', { value: repoId, added: true })
      : ''
    const defaultSource = local
      ? actor.value
      : (owners.find((owner) => sourceAvailable(owner, repoId)) ?? owners[0] ?? '')
    const identity = teamEntry
      ? `<span>项目负责人 <strong>${charterOwner}</strong></span>${chips || '<span>尚未发布主机来源</span>'}`
      : `<span>个人项目 · 本机来源</span><small class="member-number">${esc(repo.repository)}</small>`
    return `<article class="project-card" data-project-name="${esc(repo.name)}">
      <header class="row between project-card-head">
        <button type="button" class="project-title" data-action="open-workspace" data-value="${defaultSource}|${repoId}"${defaultSource ? '' : ' disabled'}>${esc(repo.name)}</button>
        <div class="card-actions">${join}${iconButton('ExternalLink', '打开代码仓')}${iconButton('SlidersHorizontal', '仓库设置')}${iconButton('Download', '克隆到本机')}${iconButton('LayoutDashboard', '项目总览')}${iconButton('FilePenLine', '项目设置与项目信息', 'panel', { value: 'project', selected: current().panel === 'project' })}${iconButton('Ellipsis', '项目操作')}</div>
      </header>
      <div class="project-identity">${identity}</div>
      <div class="project-delivery"><div class="row between"><span>版本目标</span><span>v1.1</span></div><ul><li>发布清单支持导出</li><li>在任务入口反馈导入结果</li></ul></div>
      <footer class="project-stages"><span>计划 <b>已归档</b></span><span>交付 <b>进行中</b></span><span>验收 <b>未开始</b></span></footer>
    </article>`
  }

  function wallPage() {
    const desktop = current()
    const directory = knownDirectory()
    const teamEntries = teamProjects(directory)
      .map((entry) => [repoIdForEntry(entry), entry])
      .filter(([repoId]) => repoId)
    const teamIds = new Set(teamEntries.map(([repoId]) => repoId))
    const teamCards = teamEntries.map(([repoId, entry]) => projectCard(repoId, entry)).join('')
    const personalCards = localRepos()
      .filter(([repoId]) => !teamIds.has(repoId))
      .map(([repoId]) => projectCard(repoId, null))
      .join('')
    const teamCount = teamEntries.length
    const personalCount = localRepos().filter(([repoId]) => !teamIds.has(repoId)).length
    const count = teamCount + personalCount
    const team = directory
      ? `<p class="team-wall-label">${icon('UsersRound')} ${teamName} <small>${actor.value === 'lead' ? '群主' : '成员'}</small></p>`
      : ''
    const heading = `<header class="row between wall-heading"><div><h1>项目墙 <small>${count} 个项目</small></h1>${team}</div><div class="wall-actions" aria-label="项目墙操作">
      ${iconButton('CircleHelp', '项目墙帮助', 'help')}${iconButton('RefreshCw', '刷新项目目录和墙卡信息', 'refresh')}${iconButton('UsersRound', '团队设置', 'panel', { value: 'team', added: true })}${iconButton('Plus', '添加项目', 'legacy-add')}${iconButton('X', '关闭项目墙', 'open-workspace', { value: `${desktop.source}|${desktop.repoId}` })}
    </div></header>`
    const filters = `<div class="row wall-filters"><input class="input" aria-label="搜索项目" placeholder="搜索项目" data-filter><div class="row options"><span>全部</span><span>本机</span><span>远程</span></div><div class="row options"><span>全部类型</span><span>团队</span><span>个人</span></div></div>`
    const groups = count
      ? `${filters}<div id="wall-projects">${teamCount ? `<section><h2>团队项目 <small>${teamCount}</small></h2><div class="wall-grid">${teamCards}</div></section>` : ''}${personalCount ? `<section><h2>本机项目 <small>${personalCount}</small></h2><div class="wall-grid">${personalCards}</div></section>` : ''}</div>`
      : `<div class="empty-wall"><h2>从一个项目开始</h2><div class="row wrap">${button('团队设置', 'panel', { value: 'team', kind: 'primary' })}${button('添加项目', 'legacy-add', { kind: 'ghost' })}</div></div>`
    const wall = `<div class="wall-layout"><main class="wall">${heading}${groups}</main>${desktop.panel === 'project' ? projectSettings() : ''}</div>`
    return windowFrame(wall, { overlay: desktop.panel === 'team' ? teamDirectory() : '' })
  }

  function ownsFullAccess(owner) {
    return accessLevel(owner) === 'full'
  }

  function audit(owner, action, result, resource = `${catalogRepos[current().repoId]?.name ?? project} · ${hosts[owner]?.tree ?? '共享主机'}`) {
    const user = names[actor.value]
    state.logs[owner] ??= []
    state.logs[owner].unshift([Date.now(), `${user} · ${user}桌面`, resource, action, result])
  }

  function authorizeRemoteAction(owner, action, repoId = current().repoId) {
    const readActions = new Set([
      '连接共享主机',
      '查看工作树',
      '读取项目文件',
      '查看已有会话',
      '查看终端输出',
      '订阅资源更新',
      '结束资源订阅'
    ])
    const allowed = accessLevel(owner) === 'full' || readActions.has(action)
    const result = allowed ? '已放行' : action === '未归类动作' ? '已拒绝 · 未知动作' : '已拒绝 · 团队只读'
    audit(owner, action, result, `${catalogRepos[repoId]?.name ?? project} · ${hosts[owner]?.tree ?? '共享主机'}`)
    return allowed
  }

  function openWorkspace(owner, repoId = 'star') {
    const desktop = current()
    desktop.source = owner
    desktop.repoId = repoId
    desktop.tab = 'session'
    if (owner !== actor.value) {
      authorizeRemoteAction(owner, '查看已有会话', repoId)
    }
    show('workspace')
  }

  function windowControls() {
    return `<div class="row window-controls">${iconButton('Minus', '最小化')}${iconButton('Square', '最大化')}${iconButton('X', '关闭窗口')}</div>`
  }

  function titlebar(withControls = true) {
    return `<div class="titlebar"><div class="row"><img src="../../../resources/icon.png" class="title-logo" alt="">${iconButton('Ellipsis', '应用菜单')}${iconButton('PanelLeft', '切换侧栏')}</div>${withControls ? windowControls() : ''} </div>`
  }

  function rail(screen) {
    return `<aside class="rail" aria-label="Workbench 导航">
      ${iconButton('LayoutGrid', '项目墙', 'show', { value: 'wall', selected: screen === 'wall' })}
      <div class="rail-group">
        ${iconButton('PackageCheck', '版本工作区', 'open-workspace', { value: `${current().source}|${current().repoId}`, selected: screen === 'workspace' })}
        ${iconButton('LayoutDashboard', '项目总览')}
        ${iconButton('ListTodo', '任务')}
        ${iconButton('CalendarClock', '自动化')}
        ${iconButton('BookOpen', '知识库')}
      </div>
      <div class="rail-bottom">${iconButton('Network', 'SSH 状态')}${iconButton('Settings', '设置', 'show', { value: 'settings' })}${iconButton('CircleHelp', '帮助', 'help')}</div>
    </aside>`
  }

  function windowFrame(body, { mode = current().screen, overlay = '' } = {}) {
    if (mode === 'settings') {
      return `<div class="window" data-screen="settings">${titlebar()}<div class="desktop">${body}</div>${overlay}</div>`
    }
    const working = mode === 'workspace'
    return `<div class="window" data-screen="${mode}">${working ? '' : titlebar()}<div class="desktop${working ? ' working' : ''}">${working ? `<div class="left-workspace">${titlebar(false)}<div class="left-body">${rail(mode)}${worktreeSidebar()}</div></div>` : rail(mode)}<div class="main-pane">${body}</div></div>${notifications()}${overlay}</div>`
  }

  function table(label, headings, rows) {
    return `<div class="table-scroll"><table class="table" aria-label="${label}"><thead><tr>${headings.map((name) => `<th scope="col">${name}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  }

  function readOnly() {
    const owner = current().source
    return owner !== actor.value && !ownsFullAccess(owner)
  }

  function worktreeSidebar() {
    const desktop = current()
    const owner = desktop.source
    const repo = catalogRepos[desktop.repoId] ?? catalogRepos.star
    if (!sourceAvailable(owner, desktop.repoId)) {
      return `<aside class="worktree-sidebar"><header class="project-header"><span class="project-avatar">${repo.name[0]}</span><div><strong>${esc(repo.name)}</strong><small>项目来源未连接</small></div></header></aside>`
    }
    const showMenu = desktop.panel === 'worktree-menu'
    return `<aside class="worktree-sidebar"><header class="project-header"><span class="project-avatar">${repo.name[0]}</span><div><strong>${esc(repo.name)}</strong><small>当前项目</small></div></header>
      <div class="sidebar-heading">${icon('Pin')} 已固定</div>
      <div class="sidebar-heading">${icon('FolderGit2')} 版本</div><div class="quiet-tree">v1.1</div>
      <div class="sidebar-heading">${icon('FolderGit2')} 其他工作区</div>
      <div class="workspace-row" data-worktree>
        <div class="row"><span class="tree-dot"></span><strong>${hosts[owner].tree}</strong>${iconButton('Ellipsis', '工作树操作', 'panel', { value: showMenu ? '' : 'worktree-menu' })}</div>
        <small>${hosts[owner].name}${readOnly() ? ' · 只读' : ''}</small>
        ${showMenu ? `<div class="menu" role="menu" aria-label="工作树菜单"><small>工作区</small><span>${icon('Pencil')} 更新</span><span>${icon('Check')} 更改状态</span><span>${icon('PackageCheck')} 绑定版本</span>${button(`${icon('Send')} 发送评审…`, 'panel', { value: 'send', kind: 'ghost', disabled: readOnly() || owner !== 'lin' || !registered('lin', desktop.repoId) })}<hr><span>${icon('Copy')} 复制路径</span></div>` : ''}
      </div></aside>`
  }

  function workspacePage() {
    const desktop = current()
    const owner = desktop.source
    const repo = catalogRepos[desktop.repoId] ?? catalogRepos.star
    const isReadonly = readOnly()
    const available = sourceAvailable(owner, desktop.repoId)
    const caption =
      isReadonly && available
        ? `<span class="readonly" title="可以查看已有内容。创建会话和发送输入需要主机完全访问。">${icon('Lock')}团队项目只读</span>`
        : owner === actor.value || !available
          ? ''
          : '<span class="readonly">主机完全访问</span>'
    const tabs = `<div class="workspace-tabs"><div class="row">${button(`${icon('Terminal')} 会话`, 'tab', { value: 'session', kind: desktop.tab === 'session' ? 'secondary' : 'ghost' })}${button(`${icon('Terminal')} 终端`, 'tab', { value: 'terminal', kind: desktop.tab === 'terminal' ? 'secondary' : 'ghost' })}${caption}${iconButton('Plus', '新建会话', 'new-session', { disabled: !available, hint: isReadonly && available ? '新建会话 · 当前来源只读' : '' })}</div><div class="row">${iconButton('PanelRight', '文件与变更')}${windowControls()}</div></div>`
    const content =
      available && desktop.tab === 'new' && !isReadonly
        ? '<div class="session-preview"><h2>新会话</h2><p class="field-note">已在当前来源创建会话。</p></div>'
        : available
          ? `<div class="session-preview"><p class="field-note">${hosts[owner].name} · ${hosts[owner].tree}</p><h2>${esc(repo.task)}</h2>${desktop.tab === 'terminal' ? '<pre>&gt; git status --short\n M docs/usage.md</pre>' : '<p>已定位对应入口，下一步核对边界情况并补充评审说明。</p>'}<div class="quiet-lines" aria-hidden="true"><i></i><i></i><i></i></div></div>`
          : `<div class="empty-wall"><h2>${registered(owner, desktop.repoId) ? '共享主机尚未连接' : '项目来源暂不可用'}</h2><p>${registered(owner, desktop.repoId) ? '连接后默认可只读查看。新建会话请使用本机工作区。' : '返回项目墙选择可用来源。'}</p>${registered(owner, desktop.repoId) ? button('连接共享主机', 'open-workspace', { value: `${owner}|${desktop.repoId}` }) : button('返回项目墙', 'show', { value: 'wall' })}</div>`
    return windowFrame(tabs + content, { overlay: desktop.panel === 'send' ? sendReview() : '' })
  }

  function sendReview() {
    return `<div class="overlay"><section class="surface-dialog compact" role="dialog" aria-label="发送评审">
      <header class="row between"><h2>发送评审</h2>${iconButton('X', '关闭发送评审', 'panel')}</header><p class="field-note">星图服务 #187 · 发布清单导出</p>
      <form id="review-form"><p id="picked">收件人 · 已选 0 人</p><div class="recipient-list"><input type="search" class="input" placeholder="搜索团队成员…" aria-label="搜索团队成员" data-people-search><label><input type="checkbox" value="lead" name="recipient"> 韩岚 <small>${teamName}</small></label></div>
      <footer class="dialog-actions">${button('取消', 'panel', { kind: 'ghost' })}<button type="submit" class="btn btn-primary" disabled>发送至 0 人</button></footer></form></section></div>`
  }

  function notifications() {
    const request = state.review
    const incoming = request && actor.value === 'lead'
    const outgoing = request && actor.value === 'lin'
    const alert = incoming && !request.approved ? '<span class="count">1</span>' : ''
    const item =
      incoming || outgoing
        ? `<button class="notice-item" data-action="show" data-value="pr"><span class="row">${icon('GitPullRequest')} PR #187 ${icon('ExternalLink')}</span><strong>发布清单导出</strong><small>${incoming ? '林安请求你评审' : '已送达韩岚'}${request.approved ? ' · 已批准' : ''}</small></button>`
        : '<p class="field-note">暂无评审请求</p>'
    const popover = current().notifications
      ? `<aside class="review-popover" aria-label="评审通知"><header class="row between"><strong>评审通知</strong><div class="row">${iconButton('RefreshCw', '刷新评审动态', 'refresh')}${iconButton('X', '关闭评审通知', 'toggle-notifications')}</div></header><h3>${incoming ? '我收到的评审' : '我发出的评审'}</h3>${item}</aside>`
      : ''
    return `${popover}<div class="review-trigger">${iconButton('GitPullRequest', '评审通知', 'toggle-notifications')}${alert}</div>`
  }

  function prPage() {
    const reviewed = state.review?.approved
    const action =
      actor.value === 'lead' && !reviewed ? button('提交评审', 'approve', { kind: 'primary' }) : ''
    const body = `<div class="task-layout"><aside class="task-list"><h2>任务</h2><div class="quiet-tree">星图服务</div><div class="workspace-row selected">PR #187 · 发布清单导出</div></aside><article class="task-detail"><header class="row between"><div><small>星图服务 · PR #187</small><h2>发布清单导出</h2></div>${action}</header><div class="row options"><span>概览</span><span>文件改动</span><span>Checks</span></div><section class="muted-frame"><p>${reviewed ? `已批准 · ${esc(state.review.comment)}` : '等待韩岚评审'}</p><div class="quiet-lines" aria-hidden="true"><i></i><i></i><i></i></div></section></article></div>`
    return windowFrame(body)
  }

  function settingsPage() {
    const desktop = current()
    const nav = `<aside class="settings-nav">${button(`${icon('ArrowLeft')} 返回`, 'settings-back', { kind: 'ghost' })}<div class="settings-search">${icon('Search')} 搜索设置</div><div class="sidebar-heading">设置分类</div><div class="quiet-tree">通用</div><div class="quiet-tree">集成</div>${button(`${icon('Server')} 远程 Orca 服务器`, 'server', { kind: desktop.server ? 'secondary' : 'ghost' })}<div class="quiet-tree">SSH</div><div class="quiet-tree">隐私</div></aside>`
    if (!desktop.server) {
      return windowFrame(
        `${nav}<main class="settings-main"><h1>设置</h1><section class="muted-frame"><h2>通用</h2><div class="quiet-lines" aria-hidden="true"><i></i><i></i><i></i></div></section></main>`
      )
    }
    const modes = [
      ['connect', '连接到主机'],
      ['share', '共享此主机'],
      ['cloud', '云 VM']
    ]
    const workflows = `<div class="server-workflows">${modes.map(([value, label]) => button(label, 'server-workflow', { value, kind: desktop.workflow === value ? 'secondary' : 'ghost' })).join('')}</div>`
    const content =
      desktop.workflow === 'share'
        ? sharingServer()
        : desktop.workflow === 'connect'
          ? connectingServer()
          : '<p class="field-note">云 VM</p>'
    return windowFrame(
      `${nav}<main class="settings-main"><h1>远程 Orca 服务器</h1>${workflows}${content}</main>`
    )
  }

  function defaultAuditFilters() {
    return { action: '', result: '', period: '30', search: '' }
  }

  function pruneAudit() {
    const cutoff = Date.now() - auditRetentionDays * dayMs
    let removed = 0
    for (const owner of Object.keys(state.logs)) {
      const before = state.logs[owner].length
      state.logs[owner] = state.logs[owner].filter(([time]) => time >= cutoff)
      removed += before - state.logs[owner].length
    }
    if (removed) {
      state.prunedExpired = (state.prunedExpired ?? 0) + removed
    }
  }

  function auditResults() {
    const filters = current().auditFilters
    const cutoff = Date.now() - Number(filters.period) * dayMs
    const query = filters.search.trim().toLocaleLowerCase()
    const date = new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
    const rows = (state.logs[actor.value] ?? [])
      .filter(
        ([time, visitor, resource, action, result]) =>
          time >= cutoff &&
          (!filters.action || action === filters.action) &&
          result.startsWith(filters.result) &&
          `${visitor} ${resource}`.toLocaleLowerCase().includes(query)
      )
      .map(([time, ...record]) => [date.format(time), ...record])
    const body = rows.length
      ? table('本机访问日志', ['时间', '访问者与设备', '项目与资源', '动作', '结果'], rows)
      : '<p class="field-note">当前条件下暂无访问记录。</p>'
    return `<p class="field-note" role="status">共 ${rows.length} 条</p>${body}`
  }

  function auditFilter(label, name, choices) {
    const active = current().auditFilters[name]
    return `<label class="field">${label}<select class="input" data-audit-filter="${name}">${choices.map(([value, title]) => `<option value="${value}"${active === value ? ' selected' : ''}>${title}</option>`).join('')}</select></label>`
  }

  function auditPane() {
    const pruned = state.prunedExpired
      ? `<p class="field-note" role="status">已清理 ${state.prunedExpired} 条超过 ${auditRetentionDays} 天的记录。</p>`
      : ''
    return `<section class="muted-frame audit-pane"><h3>本机访问日志</h3><p class="field-note">最近 ${auditRetentionDays} 天，到期自动清理。</p>${pruned}
      <div class="audit-filters">
        ${auditFilter('动作', 'action', [['', '全部动作'], ...auditActionTaxonomy.map((action) => [action, action])])}
        ${auditFilter('结果', 'result', [
          ['', '全部结果'],
          ['已放行', '已放行'],
          ['已拒绝', '已拒绝'],
          ['已生效', '已生效']
        ])}
        ${auditFilter('时间', 'period', [
          ['1', '最近 24 小时'],
          ['7', '最近 7 天'],
          ['30', '最近 30 天']
        ])}
        <label class="field audit-search">搜索<input type="search" class="input" data-audit-filter="search" value="${esc(current().auditFilters.search)}" placeholder="成员、设备、项目或资源"></label>
        ${button('重置', 'reset-audit', { kind: 'ghost' })}
      </div><div id="audit-results">${auditResults()}</div></section>`
  }

  function updateAuditFilter(input) {
    current().auditFilters[input.dataset.auditFilter] = input.value
    surface.querySelector('#audit-results').innerHTML = auditResults()
  }

  function nativeGrantRows(owner) {
    const visitors = Object.keys(names).filter(
      (visitor) => visitor !== owner && canReadTeamSource(owner, visitor, current().repoId)
    )
    if (!visitors.length) {
      return '<p class="field-note">尚无共享服务器访问权限。</p>'
    }
    return visitors
      .map((visitor) => {
        const elevated = accessLevel(owner, visitor) === 'full'
        const access = elevated ? '完全访问' : '只读'
        const detail = elevated ? '同一连接 · 可创建工作树与会话' : '同一连接 · 只能查看已有内容'
        const controls = elevated
          ? `${button('恢复只读', 'demote-access', { kind: 'ghost' })}${iconButton('Trash2', `撤销${names[visitor]}桌面的共享连接`, 'revoke')}`
          : owner === 'lin' && visitor === 'chen'
            ? button('授予完全访问', 'elevate-access', { kind: 'secondary' })
            : ''
        return `<div class="grant-row row between"><div><strong>${names[visitor]}桌面</strong><small>${detail}</small></div><div class="row"><span class="source-access">${access}</span>${controls}</div></div>`
      })
      .join('')
  }

  function sharingServer() {
    const owner = actor.value
    const canShare = Boolean(hosts[owner])
    const generated = state.generatedLinks?.[owner]
      ? `<label class="field demo-link">访问链接 <input class="input" value="${esc(state.generatedLinks[owner])}" readonly data-select-all></label><p class="field-note">链接只负责建立 Orca 连接，连接建立后仍按这台主机的访问层级执行。</p>`
      : ''
    const form = canShare
      ? `<fieldset class="field"><legend>在哪里打开这个链接？</legend>
          <label class="check-row"><input type="radio" name="share-intent" checked disabled> 其他设备 <small>局域网或可达地址</small></label>
          <label class="check-row"><input type="radio" name="share-intent" disabled> 仅此计算机</label>
          <label class="check-row"><input type="radio" name="share-intent" disabled> 自定义地址</label>
        </fieldset>
        <label class="field">连接地址<select class="input" disabled><option>${addresses[owner] ? addresses[owner].replace(/^wss?:\/\//, '') : '127.0.0.1'}</option></select></label>
        <div class="row">${button('生成访问链接', 'generate-link', { kind: 'primary' })}</div>
        ${generated}`
      : '<p class="field-note">当前模拟桌面没有可共享的本机工作站。</p>'
    return `<section class="muted-frame"><h2>分享此 Orca 服务器</h2>
      <p class="permission-hint">${icon('Lock')}团队成员默认只读，完全访问在同一共享连接上单独授予。</p>
      ${form}</section>
      <section class="muted-frame"><header class="row between"><h3>共享服务器访问</h3>${iconButton('RefreshCw', '刷新共享访问', 'refresh')}</header>${nativeGrantRows(owner)}</section>
      ${auditPane()}`
  }

  function connectingServer() {
    const desktop = current()
    const form = desktop.addingServer
      ? `<form id="pair-form" class="pair-form"><label class="field">名称 <input class="input" name="name" value="安泰工作站" required></label><label class="field">访问链接 <input name="link" class="input" placeholder="粘贴访问链接" required></label><footer class="dialog-actions">${button('取消', 'add-server', { kind: 'ghost' })}<button class="btn btn-primary" type="submit">连接</button></footer></form>`
      : ''
    const connected =
      actor.value === 'chen' && canReadTeamSource('lin', 'chen', desktop.repoId)
        ? `<p>安泰工作站 · 已连接 · ${accessLevel('lin') === 'full' ? '完全访问' : '只读'} · 同一 Orca 共享连接</p>`
        : ''
    return `<section class="muted-frame"><header class="row between"><h2>连接到远程服务器</h2>${button(`${icon('Plus')} 添加服务器`, 'add-server')}</header>${connected}${form}</section>`
  }

  function render() {
    pruneAudit()
    surface.innerHTML = {
      wall: wallPage,
      workspace: workspacePage,
      settings: settingsPage,
      pr: prPage
    }[current().screen]()
    save()
  }

  const actions = {
    show,
    panel: (value) => {
      const desktop = current()
      if (value === 'team') {
        if (!state.bound[actor.value]) {
          desktop.directoryDraft = null
          desktop.directoryBase = 'null'
        } else {
          desktop.directoryDraft = structuredClone(state.directory ?? blankDirectory())
          desktop.directoryBase = JSON.stringify(state.directory)
        }
      }
      if (
        !value &&
        desktop.panel === 'team' &&
        desktop.directoryDraft &&
        JSON.stringify(desktop.directoryDraft) !== desktop.directoryBase
      ) {
        confirm('放弃未保存的团队目录？', '<p>当前修改还没保存到群空间。</p>', '放弃修改', () => {
          desktop.panel = ''
          desktop.directoryDraft = null
          render()
        })
        return
      }
      desktop.panel = value
      render()
    },
    reopen: () => {
      const reset = resetDesktops()
      desktops[actor.value] = reset[actor.value]
      notify('')
      render()
    },
    'fill-own-share': () => {
      const person = actor.value
      const endpoint = ensureShareEndpoint(person)
      if (!endpoint) {
        notify('当前桌面没有可共享的本机工作站。')
        return
      }
      if (!current().directoryDraft) {
        notify('先打开团队设置。')
        return
      }
      recordAddress(person, endpoint)
      notify(`已填入本机共享地址 ${endpoint}`)
      render()
    },
    'open-workspace': enterSource,
    reset: () => {
      state = fixture()
      desktops = resetDesktops()
      actor.value = 'lead'
      notify('')
      render()
    },
    sample: () => {
      state = fixture(true)
      desktops = resetDesktops()
      actor.value = 'lead'
      notify('')
      render()
    },
    theme: () => {
      document.documentElement.dataset.theme =
        document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    },
    help: () => confirm('项目墙帮助', '<p>用团队设置绑定 WeLink 团队群。</p>', '关闭', () => {}),
    refresh: () => notify('已刷新'),
    'refresh-directory': () => {
      const desktop = current()
      if (JSON.stringify(desktop.directoryDraft) !== desktop.directoryBase) {
        notify('请先保存当前目录修改。')
        return
      }
      desktop.directoryDraft = structuredClone(state.directory)
      desktop.directoryBase = JSON.stringify(state.directory)
      notify('已刷新')
      render()
    },
    'legacy-add': () =>
      confirm('添加项目', '<p>打开已有文件夹、克隆代码仓，或新建项目。</p>', '关闭', () => {}),
    'edit-catalog-project': editCatalogProject,
    'join-team-project': joinTeamProject,
    'save-directory': saveDirectory,
    'preview-directory': () =>
      confirm(
        '团队目录文件 · team.json',
        `<pre class="catalog-json">${esc(JSON.stringify(current().directoryDraft, null, 2))}</pre>`,
        '关闭',
        () => {}
      ),
    tab: (value) => {
      const desktop = current()
      desktop.tab = value
      if (desktop.source !== actor.value) {
        authorizeRemoteAction(desktop.source, value === 'terminal' ? '查看终端输出' : '查看已有会话', desktop.repoId)
      }
      render()
    },
    'toggle-notifications': () => {
      current().notifications = !current().notifications
      render()
    },
    approve: () =>
      confirm(
        '提交评审',
        '<label class="field">评审意见 <textarea name="comment" rows="3" class="input" required></textarea></label><label class="check-row"><input type="radio" checked> 批准</label>',
        '提交评审',
        (data) => {
          state.review = { approved: true, comment: data.get('comment') }
          render()
        }
      ),
    'settings-back': () => show(current().prior),
    server: () => {
      current().server = true
      render()
    },
    'server-workflow': (value) => {
      current().workflow = value
      render()
    },
    'generate-link': () => {
      const owner = actor.value
      if (!addresses[owner]) {
        notify('当前桌面没有可共享的本机工作站。')
        return
      }
      state.generatedLinks ??= {}
      state.generatedLinks[owner] = samplePairing
      state.offered = true
      state.teamEndpoints[owner] = addresses[owner]
      notify('已生成访问链接。对方粘贴后连上；团队成员默认只读。')
      render()
    },
    'add-server': () => {
      current().addingServer = !current().addingServer
      render()
    },
    'elevate-access': () => {
      if (!canReadTeamSource('lin', 'chen')) {
        notify('陈远还没有连上安泰工作站。先用访问链接连接。')
        return
      }
      confirm(
        '授予完全访问',
        '<p>陈远桌面将在<strong>同一条</strong> Orca 共享连接上升级为完全访问，可以创建工作树、启动会话并发送输入。</p>',
        '授予完全访问',
        () => {
          state.accessModes.chen ??= {}
          state.accessModes.chen.lin = 'full'
          state.full = true
          audit('lin', '授予完全访问', '已生效', '安泰工作站 · 陈远桌面')
          notify('陈远已提权为完全访问')
          render()
        }
      )
    },
    'demote-access': () => {
      state.accessModes.chen ??= {}
      state.accessModes.chen.lin = 'readonly'
      state.full = false
      audit('lin', '恢复只读', '已生效', '安泰工作站 · 陈远桌面')
      notify('已恢复为团队只读，连接仍在')
      render()
    },
    revoke: () => {
      state.full = false
      state.offered = false
      delete state.generatedLinks.lin
      delete state.teamConnections.chen.lin
      delete state.accessModes.chen?.lin
      audit('lin', '撤销共享连接', '已生效', '安泰工作站 · 陈远桌面')
      notify('已撤销陈远的共享连接')
      render()
    },
    'new-session': () => {
      if (readOnly()) {
        const owner = current().source
        const repoId = current().repoId
        const hasLocalWorkspace = Boolean(hosts[actor.value])
        authorizeRemoteAction(owner, '新建会话', repoId)
        confirm(
          '当前来源为只读',
          `<p>你可以查看 ${esc(hosts[owner].name)} 上的已有会话和终端输出。${hasLocalWorkspace ? '请切回本机工作区新建会话。' : '请回项目墙，打开或克隆到本机后新建会话。'}</p>`,
          hasLocalWorkspace ? '切回本机工作区' : '返回项目墙',
          () => {
            if (hasLocalWorkspace) {
              openWorkspace(actor.value, repoId)
            } else {
              show('wall')
            }
          }
        )
        return
      }
      current().tab = 'new'
      render()
    },
    'reset-audit': () => {
      current().auditFilters = defaultAuditFilters()
      render()
    },
    'close-dialog': () => {
      dialog.close()
      render()
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button[data-action]')
    if (target) {
      actions[target.dataset.action]?.(target.dataset.value)
    }
  })

  surface.addEventListener('contextmenu', (event) => {
    if (!event.target.closest('[data-worktree]')) {
      return
    }
    event.preventDefault()
    actions.panel('worktree-menu')
  })

  surface.addEventListener('input', (event) => {
    if (event.target.dataset.auditFilter === 'search') {
      updateAuditFilter(event.target)
    }
    if (event.target.hasAttribute('data-address')) {
      notify('')
      recordAddress(event.target.dataset.address, event.target.value)
    }
    if (event.target.hasAttribute('data-filter')) {
      const query = event.target.value.trim()
      for (const card of document.querySelectorAll('[data-project-name]')) {
        card.hidden = !card.dataset.projectName.includes(query)
      }
    }
    if (event.target.hasAttribute('data-people-search')) {
      event.target.nextElementSibling.hidden = !`韩岚 ${teamName}`.includes(
        event.target.value.trim()
      )
    }
  })

  document.addEventListener('submit', (event) => {
    event.preventDefault()
    const data = new FormData(event.target)
    if (dialog.contains(event.target)) {
      dialog.close()
      confirmForm(data)
    } else if (event.target.id === 'team-lookup') {
      if (data.get('group') !== demoGroup) {
        notify(`样例只支持群号 ${demoGroup}`)
        return
      }
      state.bound[actor.value] = true
      const desktop = current()
      desktop.directoryDraft = structuredClone(
        state.directory?.team_group_id === data.get('group')
          ? state.directory
          : blankDirectory(data.get('group'))
      )
      desktop.directoryBase = JSON.stringify(state.directory)
      notify('')
      render()
    } else if (event.target.id === 'review-form' && data.get('recipient') === 'lead') {
      state.review = { approved: false, comment: '' }
      current().panel = ''
      notify('评审请求已送达韩岚')
      render()
    } else if (event.target.id === 'pair-form') {
      if (actor.value !== 'chen' || !state.generatedLinks?.lin || data.get('link') !== state.generatedLinks.lin) {
        notify('访问链接无效或已撤销。')
        return
      }
      state.teamEndpoints.lin = addresses.lin
      state.teamConnections.chen.lin = addresses.lin
      state.accessModes.chen ??= {}
      state.accessModes.chen.lin = 'readonly'
      state.full = false
      current().addingServer = false
      audit('lin', '连接共享主机', '已放行', hosts.lin.name)
      notify('已连接安泰工作站 · 默认只读。持有人可在共享列表授予完全访问。')
      render()
    }
  })

  surface.addEventListener('change', (event) => {
    if (event.target.matches('select[data-audit-filter]')) {
      updateAuditFilter(event.target)
    }
    if (event.target.name === 'recipient') {
      const send = document.querySelector('#review-form button[type=submit]')
      const count = event.target.checked ? 1 : 0
      document.querySelector('#picked').textContent = `收件人 · 已选 ${count} 人`
      send.textContent = `发送至 ${count} 人`
      send.disabled = count === 0
    }
  })

  dialog.addEventListener('change', (event) => {
    if (event.target.id !== 'directory-repo') {
      return
    }
    const repo = catalogRepos[event.target.value]
    if (repo) {
      document.querySelector('#directory-remote').textContent = repo.repository
    }
  })

  surface.addEventListener('click', (event) => {
    if (event.target.hasAttribute('data-select-all')) {
      event.target.select()
    }
  })

  actor.addEventListener('change', () => {
    notify('')
    render()
  })
  dialog.addEventListener('cancel', render)
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || dialog.open) {
      return
    }
    current().panel = ''
    current().notifications = false
    render()
  })
  render()
})()
