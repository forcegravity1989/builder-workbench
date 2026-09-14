/*
 * V3 一体原型的行为层：左栏四屏导航（总览 · 计划 · 自动化 · 知识库）+ Projects 常显
 * + 计划屏（hifi/plan.html 定稿逻辑，列表当默认视图）+ ▶开工 / 点树进执行面 + 执行顶条
 * + 自动化屏 + 知识库 + 顶层覆盖层（项目墙 / 设置）+ 演示条。
 *
 * 没有「会话」页签。执行面靠 Projects 点树或计划 ▶开工 进入；在执行面时导航四格全灭。
 * Open Design 在 Orca 中栏 tabstrip（与 Terminal / Claude Code 并列），不是壳层分段。
 *
 * 没有「配置」页签：开工工具映射与技能 / workflow 归设置的「能力」一节，跟真壳
 * （crates/app-shell/src/screens/settings/）同一套分节：本机（目录 · 外观）+
 * 能力（Connector · Skills · Category · Plugins · AI Assets）。
 *
 * 项目墙 / 设置是顶层覆盖层，渲染进 #bw-top（不是 #bw-screen —— 那一整块在执行面时是 hidden 的）。
 * 项目墙给了两版长相，在墙自己的头上切：弹窗（默认）/ 全窗。
 *
 * 会话面（终端 / 建树序 / Explorer / Source Control / Diff）的行为只有 prototype.js 一份实现，
 * 本文件不复制它，只发指令、收状态。协议沿用 postMessage，V3 同页：
 *   宿主 → 面：{__bw:'v2',  t:'openCreate'|'activate'|'stop'|'demo'|'theme', …}
 *   面 → 宿主：{__bw:'orca', t:'ready'|'state', worktree,title,branch,path,running,isMain,creating,counts}
 *
 * 调用方：prototype-v3.html（唯一）。演示数据写死在本文件，不读写任何数据文件。
 */
;(function () {
  'use strict'

  const $ = (id) => document.getElementById(id)
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  /* ── 侧栏图标（与 hifi/plan.html 同一套） ───────────────── */

  const ICONS = {
    overview: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6"/>',
    plan: '<path d="M5 6h14M5 12h14M5 18h9"/>',
    auto: '<circle cx="12" cy="12.5" r="7.5"/><path d="M12 9.2v3.6l2.4 1.6M9 3.6h6"/>',
    space: '<path d="M4 6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"/><path d="M4 9h16"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 015 .9c0 1.7-2.5 2.1-2.5 3.9M12 17.2v.1"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33A1.65 1.65 0 0014 20.83V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82A1.65 1.65 0 003.17 14H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6h.09A1.65 1.65 0 0010 3.17V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9v.09A1.65 1.65 0 0020.83 10H21a2 2 0 010 4h-.09A1.65 1.65 0 0019.4 15z"/>'
  }

  function svg(name) {
    return (
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      (ICONS[name] || '') +
      '</svg>'
    )
  }

  /* ── 计划屏演示数据（沿用 hifi/plan.html 定稿） ────────────
     work: 这条活在会话面里有没有对应的 workspace fixture。
       create   —— 树还没建，▶开工 走建树序
       attach   —— 树已在，▶开工 只 activate/reveal，不建第二棵
       none     —— 会话面没这条活的 fixture，如实提示，不起假会话 */

  const cards = [
    { id: 71, col: 'todo', seg: 'unscheduled', title: '补充首次接入的失败提示', body: '仓信息读不到时，把原话交给人。', plan: '', who: '未指派', ago: '2小时前', brand: 'CodeHub', work: 'none' },
    { id: 68, col: 'todo', seg: 'scheduled', title: '计划屏版本下拉与远端里程碑对齐', body: '切版本后重新读取对应的 issue。', plan: 'v0.4', who: 'xiaoduo', ago: '1天前', brand: 'CodeHub', work: 'none' },
    { id: 74, col: 'progress', seg: 'progress', title: '校准计划屏高保真', body: '按当前真壳更新版式和交互。', plans: ['v0.3', 'v0.4'], released: '', who: 'claude', ago: '刚刚', brand: 'CodeHub', work: 'create', branch: 'bw/issue-74', tool: 'Claude Code' },
    { id: 70, col: 'progress', seg: 'progress', title: '完善出包进度回执', body: '关闭弹窗不打断后台任务。', plan: 'v0.4', who: 'claude', ago: '3小时前', brand: 'CodeHub', work: 'attach', branch: 'bw/issue-70', tool: 'Claude Code' },
    { id: 66, col: 'pending', seg: 'review', title: '设置屏工具探活收口', body: 'MR 已开，等人验收。', plan: 'v0.4', who: 'xiaoduo', ago: '5小时前', brand: 'CodeHub', work: 'none' },
    { id: 63, col: 'pending', seg: 'blocked', title: 'CodeHub 远端授权联调', body: '等待测试账号权限。', plan: 'v0.4', who: 'xiaoduo', ago: '2天前', brand: 'CodeHub', work: 'none' },
    { id: 60, col: 'done', seg: 'done', title: '移除过时通知入口', body: '个人提醒回到系统通知。', plan: 'v0.4', who: 'claude', ago: '3天前', brand: 'CodeHub', work: 'none' },
    { id: 58, col: 'done', seg: 'done', title: '接入 Builder 设计系统', body: '壳编译期使用统一样式正本。', plan: 'v0.4', who: 'claude', ago: '4天前', brand: 'CodeHub', work: 'none' },
    { id: 55, col: 'done', seg: 'cancelled', title: '保留旧版周列表兼容层', body: '产品不再保留旧路径。', plan: 'v0.4', who: 'xiaoduo', ago: '5天前', brand: 'CodeHub', work: 'none' },
    { id: 49, col: 'done', seg: 'done', title: '单侧栏壳骨架接线', body: '项目入口收进一条紧凑侧栏。', plan: 'v0.3', who: 'claude', ago: '9天前', brand: 'CodeHub', work: 'none' },
    { id: 47, col: 'done', seg: 'cancelled', title: '独立通知页面', body: '群通知与个人提醒不再占一个产品页面。', plan: 'v0.3', who: 'xiaoduo', ago: '10天前', brand: 'CodeHub', work: 'none' }
  ]

  const columns = [
    { key: 'todo', title: '待办', dot: 'status-todo', segments: [['unscheduled', '未排期'], ['scheduled', '已排期']] },
    { key: 'progress', title: '进行中', dot: 'status-progress is-live', segments: [['progress', '进行中']] },
    { key: 'pending', title: '待处理', dot: 'status-review', segments: [['review', '待评审'], ['blocked', '阻塞']] },
    { key: 'done', title: '已完成', dot: 'status-done', segments: [['done', '完成'], ['cancelled', '拒绝']] }
  ]

  /* 四屏：执行面不是第五屏，靠 Projects / ▶开工 进入；项目墙与设置是覆盖层，也不占格 */
  const SCREENS = [
    { key: 'overview', name: '总览', icon: 'overview' },
    { key: 'plan', name: '计划', icon: 'plan' },
    { key: 'auto', name: '自动化', icon: 'auto' },
    { key: 'kb', name: '知识库', icon: 'space' }
  ]

  /* ── 项目墙演示数据（字段照真壳 wall/mod.rs 的 ProjectCardVm） ──── */

  const PROJECTS = [
    { slug: 'loop-buddy', name: 'loop-buddy', logo: 'L', ver: 'v0.4', signal: 'green', running: true, unread: 1, brief: '单人构建者的 Rust 原生桌面工作台', goal: '让版本计划、开工与发版形成一条清楚的工作路径', delivery: '3 天前 · v0.3', done: 3, total: 10, remote: 'codehub' },
    { slug: 'jianmu', name: 'jianmu', logo: 'J', ver: 'v0.2', signal: 'unknown', running: false, unread: 0, brief: '给团队看的指标看板', goal: '', delivery: '', done: 0, total: 4, remote: 'codehub' },
    { slug: 'opsboard', name: 'opsboard', logo: 'O', ver: '', signal: 'red', running: false, unread: 2, brief: '值班与告警的一页视图', goal: '把告警收敛成一条时间线', delivery: '12 天前 · v0.1', done: 1, total: 6, remote: 'github' },
    { slug: 'benchmark', name: 'benchmark', logo: 'B', ver: 'v1.1', signal: 'amber', running: false, unread: 0, brief: '对标产品的拆解记录', goal: '每周拆一个对标', delivery: '6 天前 · v1.0', done: 4, total: 5, remote: 'github' }
  ]

  /* 健康灯颜色跟真壳 theme::signal_color 一路：没数据是灰，不是绿 */
  const SIGNAL_C = {
    green: 'var(--color-success)',
    amber: 'var(--color-warning)',
    red: 'var(--color-danger)',
    unknown: 'var(--color-neutral-400)'
  }
  const SIGNAL_NAME = { green: '平稳', amber: '需要关注', red: '异常', unknown: '无数据' }

  /* 本机环境探活：真壳这条在项目墙与设置的 Connector 页共用同一份数据 */
  const ENV = [
    { label: 'claude', ok: true, detail: '/usr/local/bin/claude' },
    { label: 'cursor-agent', ok: null, detail: '还没探活' },
    { label: 'codehub-cli', ok: true, detail: '本机路径里找得到；凭证在系统钥匙串' },
    { label: 'Open Design', ok: true, detail: '本机已探活' },
    { label: 'welink-cli', ok: null, detail: '探活函数待内部补（留位）' }
  ]

  /* ── 自动化演示数据（列与字段照 ../orca 的 Automations） ────────
     钟原来在 Orca，现在收进 Workbench 自己；铁律不变：到点开会话，
     自动开出来的活最多推到待评审，完成永远由人点。 */

  const AUTOMATIONS = [
    {
      id: 'a1', name: '每天早上盘一遍资产', enabled: true, schedule: '每天 09:00',
      preset: 'daily', time: '09:00', dow: '1', cron: '', grace: '30',
      project: 'loop-buddy', wsMode: 'new', ws: '', base: 'main', reuse: false,
      agent: 'Claude Code', next: '明天 09:00', last: '今天 09:00', lastOk: true,
      lastNote: '开了 1 张待评审 issue',
      precheck: 'git fetch --all', precheckTimeout: '60', setup: 'run',
      prompt: '盘一遍 .bw/ 跟不跟得上现行契约，跟不上就开一张 issue，写清差在哪。不要改代码。'
    },
    {
      id: 'a2', name: '工作日审一遍待评审', enabled: true, schedule: '工作日 18:30',
      preset: 'weekdays', time: '18:30', dow: '1', cron: '', grace: '15',
      project: 'loop-buddy', wsMode: 'existing', ws: 'issue-70', base: 'main', reuse: true,
      agent: 'Claude Code', next: '今天 18:30', last: '昨天 18:30', lastOk: true,
      lastNote: '3 条待评审，都留了评审意见',
      precheck: '', precheckTimeout: '60', setup: 'skip',
      prompt: '把待评审的活逐条读一遍，留评审意见。不要点完成——完成由人点。'
    },
    {
      id: 'a3', name: '每周对一遍远端里程碑', enabled: false, schedule: '每周一 10:00',
      preset: 'weekly', time: '10:00', dow: '1', cron: '', grace: '60',
      project: 'loop-buddy', wsMode: 'new', ws: '', base: 'main', reuse: false,
      agent: 'Cursor', next: '已暂停', last: '9 天前', lastOk: false,
      lastNote: 'precheck 超时：codehub-cli 没登录',
      precheck: 'codehub-cli auth status', precheckTimeout: '30', setup: 'run',
      prompt: '把远端里程碑和计划屏的版本对一遍，差异如实列出来。'
    },
    {
      id: 'a4', name: '整点跑一次指标读数', enabled: true, schedule: 'cron 0 * * * *',
      preset: 'custom', time: '09:00', dow: '1', cron: '0 * * * *', grace: '5',
      project: 'jianmu', wsMode: 'new', ws: '', base: 'main', reuse: false,
      agent: 'Claude Code', next: '整点', last: '38 分钟前', lastOk: true,
      lastNote: '写进 bw/ledger',
      precheck: '', precheckTimeout: '60', setup: 'skip',
      prompt: '读一次指标，记进 bw/ledger。指标定义不在这里改。'
    }
  ]

  /* ── 设置演示数据（分节与页照真壳 settings/mod.rs） ───────────── */

  const SET_CONNECTORS = [
    { name: 'claude', kind: '执行器', status: 'done', used: ['构建', '优化', '文档'], detail: '/usr/local/bin/claude', gives: ['开工起交互式会话', '一次性系统提示词注入'] },
    { name: 'cursor-agent', kind: '执行器', status: 'unset', used: ['原型'], detail: '还没探活', gives: ['开工起交互式会话'] },
    { name: 'codehub-cli', kind: '远端', status: 'done', used: ['issue 读写', '里程碑'], detail: '凭证在系统钥匙串', gives: ['issue 与标签读写', 'MR 与 Release'] },
    { name: 'gh', kind: '远端', status: 'idle', used: [], detail: '装了但这个项目走 codehub', gives: ['issue 与标签读写'] },
    { name: 'Open Design', kind: '设计', status: 'done', used: ['原型'], detail: '本机已探活', gives: ['原型跑完停在设计面'] }
  ]

  /* Category = 原「配置 · 开工工具映射」的正主，五个工作类别各挂执行器 + workflow */
  const SET_STAGE = [
    { key: 'prototype', label: '原型', tool: 'cursor', workflow: 'mattpocock-skills', ok: null, injects: ['SYSTEM.md.tmpl', 'issue-state.md'] },
    { key: 'build', label: '构建', tool: 'claude_cli', workflow: 'mattpocock-skills', ok: true, injects: ['SYSTEM.md.tmpl', 'issue-state.md', 'workbench-start'] },
    { key: 'optimize', label: '优化', tool: 'claude_cli', workflow: 'mattpocock-skills', ok: true, injects: ['SYSTEM.md.tmpl', 'issue-state.md'] },
    { key: 'growth', label: '增长', tool: '', workflow: 'mattpocock-skills', ok: null, injects: [] },
    { key: 'ops', label: '运维', tool: 'claude_cli', workflow: 'mattpocock-skills', ok: true, injects: ['SYSTEM.md.tmpl'] }
  ]

  const SET_TOOLS = [
    { value: 'claude_cli', label: 'Claude CLI' },
    { value: 'cursor', label: 'Cursor' },
    { value: 'open_design', label: 'Open Design' },
    { value: '', label: '—（未定）' }
  ]

  const SET_SKILLS = [
    { name: 'workbench-start', from: 'standard/skills/', used: '构建 · 优化', state: '在用' },
    { name: 'design-system-import', from: 'standard/skills/', used: '原型', state: '在用' },
    { name: 'grill-me', from: 'standard/vendor/', used: '构建', state: '在用' },
    { name: '技能提炼', from: '—', used: '—', state: '没接' }
  ]

  const SET_PLUGINS = [
    { name: 'mattpocock-skills', ver: '0.4.2', skills: 12, used: '五个类别的默认 workflow', license: 'MIT' },
    { name: 'superpowers', ver: '6.2.0', skills: 14, used: '没有类别用到', license: 'MIT' }
  ]

  const SET_ASSETS = [
    { name: 'system-prompt/SYSTEM.md.tmpl', kind: '主提示词', note: '开工必注入' },
    { name: 'references/issue-state.md', kind: 'reference', note: '状态机与写入者边界，按需加载' },
    { name: 'references/labels.md', kind: 'reference', note: '标签词表，按需加载' },
    { name: 'templates/', kind: '模板', note: 'CONTEXT / adr / spec 的骨架' }
  ]

  const SET_NAV = [
    { key: 'dirs', sec: '本机', label: '目录' },
    { key: 'theme', sec: '本机', label: '外观' },
    { key: 'connector', sec: '能力', label: 'Connector', count: SET_CONNECTORS.length },
    { key: 'skills', sec: '能力', label: 'Skills', count: SET_SKILLS.length },
    { key: 'stage', sec: '能力', label: 'Category', count: SET_STAGE.length },
    { key: 'plugins', sec: '能力', label: 'Plugins', count: SET_PLUGINS.length },
    { key: 'assets', sec: '能力', label: 'AI Assets', count: SET_ASSETS.length }
  ]

  /* 知识库文档树：.bw/ 骨架 + architecture，跟现行壳一致 —— 不挂 docs/plan/、docs/releases.md */
  const KB_DOCS = [
    {
      group: '项目约定 · .bw/',
      id: 'project',
      name: 'project.toml',
      path: '.bw/project.toml',
      lines: [
        '# 名片：项目自报家门的那几行。常驻工作树 bw/project 维护，走 MR 合入。',
        'name = "loop-buddy"',
        'display_name = "Builders\' Workbench"',
        'remote = "codehub"',
        'default_branch = "main"',
        '',
        '[direction]',
        'goal = "让单人构建者用一个窗口跑完周循环"'
      ]
    },
    {
      group: '项目约定 · .bw/',
      id: 'metrics',
      name: 'metrics.toml',
      path: '.bw/metrics.toml',
      lines: [
        '# 指标定义由「更新指标与版本计划」Issue 维护；读数记录在 bw/ledger，不在这里。',
        '[[metric]]',
        'key = "weekly_shipped"',
        'label = "本周交付"',
        'source = "codehub:issues:closed"'
      ]
    },
    {
      group: '架构 · docs/',
      id: 'architecture',
      name: 'architecture.md',
      path: 'docs/architecture.md',
      lines: [
        '# 架构（演示节选，正本以仓文件为准）',
        '',
        '§1 用例：整体用户旅程 —— 接入 → 纳入 → 开工 → 审结果 → 发版',
        '§2 特性：会话与执行、关键信息维护、指标与版本计划',
        '§3 三 crate：bw（内核，本地零库）→ bw-engine（底座，PTY/worktree/远端）→ app-shell（壳）'
      ]
    },
    {
      group: '架构 · docs/',
      id: 'context',
      name: 'CONTEXT.md',
      path: 'CONTEXT.md',
      lines: [
        '# 领域词表（演示节选）',
        '',
        'Workspace  一棵 git worktree，一条活一棵，路径 .bw/worktrees/issue-N',
        '开工        从计划屏把一张 Issue 交给 agent，走建树序后落到执行面',
        '接回        activate/reveal 同一棵树，绝不悄悄建第二棵'
      ]
    },
    {
      group: '规范 · standard/',
      id: 'sysprompt',
      name: 'system-prompt/SYSTEM.md.tmpl',
      path: 'standard/system-prompt/SYSTEM.md.tmpl',
      lines: [
        '# 主提示词模板（演示节选）',
        '',
        '补被管仓看不见的 Workbench 信息：issue 状态机、标签词表、完成永远由人点。',
        'references/ 里的细则按需渐进加载，不一次性灌进上下文。'
      ]
    },
    {
      group: '规范 · standard/',
      id: 'issuestate',
      name: 'references/issue-state.md',
      path: 'standard/system-prompt/references/issue-state.md',
      lines: [
        '# 状态机与写入者边界（演示节选）',
        '',
        'bw:status:{todo|inprogress|inreview|blocked|cancelled}',
        'closed 且非 cancelled = Done，不打标签',
        '',
        'agent 跑完最多推到 inreview。Done 只有人能点，settled_at 只落一次。'
      ]
    }
  ]

  const state = {
    // null = 执行面（导航四格全灭）；否则是四屏之一
    screen: 'overview',
    // 当前项目（项目墙点卡切换）
    project: 'loop-buddy',
    // 顶层覆盖层：null / 'wall' / 'settings'
    top: null,
    // 项目墙两版长相的对比开关：'dialog'（默认，人选的）/ 'sheet'（推荐那版：全窗）
    wallMode: 'dialog',
    setPage: 'dirs',
    setQ: '',
    wallQ: '',
    // 计划屏（定稿同名字段）；列表是默认视图，看板退到 ▦
    mode: 'list',
    version: 'v0.4',
    segments: { todo: 'unscheduled', pending: 'review', done: 'done' },
    plan: '',
    stage: '',
    q: '',
    // 列表视图：分组维度 + 折叠了哪几组（照 ../orca tasks 的分组表头）
    groupBy: 'status',
    collapsed: {},
    // 自动化屏
    autoQ: '',
    autoStatus: '',
    autoMenu: null,
    draft: null,
    // 执行面上下文
    issue: null,
    stoppedBranch: null,
    railStep: -1,
    // 知识库
    kbTab: 'docs',
    kbDoc: 'project',
    // 会话面回报的实况
    live: {
      branch: 'main',
      path: '~/projects/loop-buddy',
      running: false,
      isMain: true,
      creating: false,
      counts: { staged: 0, changes: 0, untracked: 0 }
    }
  }

  /* ── 提示条 ──────────────────────────────────────────────── */

  let toastTimer = null
  function notice(message) {
    $('bw-toast-body').textContent = message
    $('bw-toast').classList.remove('is-hidden')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(hideToast, 4600)
  }
  function hideToast() {
    $('bw-toast').classList.add('is-hidden')
  }

  /* ── 会话桥：只发指令、收状态 ───────────────────────────── */

  function post(payload) {
    window.postMessage(Object.assign({ __bw: 'v2' }, payload), '*')
  }

  /* ── 左栏 ────────────────────────────────────────────────── */

  function renderNav() {
    $('bw-nav').innerHTML = SCREENS.map((s) => {
      return (
        '<button type="button" class="bw-nav-item" data-bw-go="' +
        s.key +
        '"' +
        (state.screen === s.key ? ' aria-current="page"' : '') +
        '><span class="bw-nav-glyph">' +
        svg(s.icon) +
        '</span><span class="bw-nav-label">' +
        s.name +
        '</span></button>'
      )
    }).join('')
  }

  /* ── 屏路由 ──────────────────────────────────────────────── */

  function enterWork() {
    state.screen = null
    $('bw-sess').hidden = false
    $('bw-screen').hidden = true
    SCREENS.forEach((s) => {
      const el = $('screen-' + s.key)
      if (el) el.hidden = true
    })
    renderNav()
    renderSession()
  }

  function go(screen) {
    state.screen = screen
    $('bw-sess').hidden = true
    $('bw-screen').hidden = false
    SCREENS.forEach((s) => {
      const el = $('screen-' + s.key)
      if (el) el.hidden = s.key !== screen
    })
    if (screen === 'plan') {
      renderBoard()
      if (state.mode === 'list') renderList()
    }
    if (screen === 'auto') renderAuto()
    if (screen === 'kb') renderKb()
    renderNav()
  }

  /* ── 总览：注入定稿内容，再执行定稿脚本 ─────────────────── */

  function mountOverview() {
    const html = window.__BW_HIFI_OVERVIEW_HTML
    if (!html) {
      $('ov-mount').innerHTML =
        '<div style="padding:24px">总览定稿没抽出来：先跑 node tools/extract-overview.mjs</div>'
      return
    }
    $('ov-mount').innerHTML = html
    const s = document.createElement('script')
    s.src = 'hifi-overview.boot.js?v=' + Date.now()
    s.charset = 'utf-8'
    document.body.appendChild(s)
  }

  /* ── 计划屏：定稿逻辑，只把 Start 接到会话屏 ─────────────── */

  const plansOf = (c) => c.plans || [c.plan].filter(Boolean)
  const placeOf = (c) => {
    const plans = plansOf(c)
    return plans.length ? plans.map((v) => '版本·' + v).join(' · ') : '未排期'
  }
  const carryoverLabel = (c) =>
    state.version === 'v0.3' && plansOf(c).includes('v0.3') && plansOf(c).includes('v0.4') && c.released !== 'v0.3'
      ? '遗留 v0.4'
      : ''
  const visibleCards = () => cards.filter((c) => state.version === 'all' || plansOf(c).includes(state.version))
  const statusClass = (c) =>
    c.seg === 'blocked'
      ? 'status-blocked'
      : c.col === 'progress'
        ? 'status-progress is-live'
        : c.seg === 'review'
          ? 'status-review'
          : c.col === 'done'
            ? 'status-done'
            : 'status-todo'
  const stageLabel = (c) =>
    ({
      unscheduled: '未排期',
      scheduled: '已排期',
      progress: '进行中',
      review: '待评审',
      blocked: '阻塞',
      done: '完成',
      cancelled: '已取消'
    })[c.seg]
  const pill = (c) =>
    c.seg === 'progress'
      ? 'tag-warning'
      : c.seg === 'review'
        ? 'tag-accent-2'
        : c.seg === 'blocked'
          ? 'tag-danger'
          : c.seg === 'done'
            ? 'tag-success'
            : c.seg === 'cancelled'
              ? 'tag-outline'
              : 'tag-neutral'

  // 卡上直接给开工入口：进行中 / 已排期的活才有，别的按状态走详情
  function startBtnLabel(c) {
    if (c.seg === 'progress') return c.work === 'attach' ? '接回' : '▶开工'
    if (c.seg === 'scheduled') return '▶开工'
    return ''
  }

  function cardHtml(c) {
    const initial = c.who === '未指派' ? '?' : c.who.slice(0, 1).toUpperCase()
    const place = placeOf(c)
    const carryover = carryoverLabel(c)
    const start = startBtnLabel(c)
    return (
      '<div class="card kcard" draggable="true" data-act="openDetail" data-arg="' + c.id + '">' +
      '<div class="kcard-top"><span class="mono">#' + c.id + '</span>' +
      '<span class="tag tag-accent-2">' + esc(c.brand) + '</span>' +
      '<span class="status-dot ' + statusClass(c) + ' ml-auto"></span></div>' +
      '<div class="kcard-title">' + esc(c.title) + '</div>' +
      '<div class="kcard-desc">' + esc(c.body) + '</div>' +
      (state.version === 'all'
        ? '<div class="tag tag-neutral kcard-place"><span class="kcard-folder">▸</span>' + esc(place) + '</div>'
        : '') +
      (carryover ? '<div class="tag tag-warning kcard-place">' + carryover + '</div>' : '') +
      '<div class="kcard-foot"><span class="kcard-who"><span class="avatar avatar-sm">' + esc(initial) + '</span>' +
      esc(c.who) + '</span>' +
      (start
        ? '<button class="btn btn-ghost btn-sm" data-act="startWork" data-arg="' + c.id + '">' + start + '</button>'
        : '<span class="kcard-ago">' + esc(c.ago) + '</span>') +
      '</div></div>'
    )
  }

  function renderBoard() {
    const pool = visibleCards()
    $('board-view').innerHTML = columns
      .map((col) => {
        const inCol = pool.filter((c) => c.col === col.key)
        const active = col.segments.length === 1 ? col.segments[0][0] : state.segments[col.key] || col.segments[0][0]
        const seg =
          col.segments.length > 1
            ? '<div class="seg board-seg">' +
              col.segments
                .map(
                  ([key, label]) =>
                    '<label class="seg-opt"><input type="radio" name="seg-' + col.key + '" ' +
                    (active === key ? 'checked' : '') +
                    ' data-act-change="chooseSegment" data-arg="' + col.key + ':' + key + '">' + label +
                    '<span class="seg-count">' + inCol.filter((c) => c.seg === key).length + '</span></label>'
                )
                .join('') +
              '</div>'
            : ''
        const shown = inCol.filter((c) => c.seg === active)
        return (
          '<div class="board-col"><div class="board-col-head"><span class="status-dot ' + col.dot + '"></span>' +
          col.title + '<span class="count">' + inCol.length + '</span></div>' + seg +
          '<div class="board-seg-box">' +
          (shown.map(cardHtml).join('') || '<div class="board-empty">无 issue</div>') +
          '</div></div>'
        )
      })
      .join('')
  }

  /* ── 列表视图：泳道换成列表（照 ../orca 的 tasks） ───────────────
     跟看板的区别不只是「不分列」：列表按分组维度插可折叠的分组表头
     （名字 + 计数），一屏能看完所有状态，行尾常显开工 / 接回，不用悬停才出来。 */

  const SEG_DOT = {
    progress: 'status-progress is-live',
    review: 'status-review',
    blocked: 'status-blocked',
    done: 'status-done',
    cancelled: 'status-done',
    scheduled: 'status-todo',
    unscheduled: 'status-todo'
  }

  const GROUP_BY = {
    status: {
      keyOf: (c) => c.seg,
      order: ['progress', 'review', 'blocked', 'scheduled', 'unscheduled', 'done', 'cancelled'],
      nameOf: (k) => stageLabel({ seg: k }),
      dotOf: (k) => SEG_DOT[k] || 'status-todo'
    },
    owner: {
      keyOf: (c) => c.who,
      order: null,
      nameOf: (k) => k,
      dotOf: () => ''
    }
  }

  function listRows() {
    return visibleCards()
      .filter(
        (c) => !state.plan || (state.plan === 'unscheduled' ? plansOf(c).length === 0 : plansOf(c).includes(state.plan))
      )
      .filter((c) => !state.stage || c.seg === state.stage)
      .filter((c) => !state.q || (c.title + ' ' + c.who).toLowerCase().includes(state.q.toLowerCase()))
  }

  function listRowHtml(c) {
    const label = c.seg === 'unscheduled' ? 'schedule' : startBtnLabel(c) || 'Open →'
    const isStart = label === '▶开工' || label === '接回'
    return (
      '<div class="list-row" data-act="openDetail" data-arg="' + c.id + '">' +
      '<span class="il-num"><span class="il-idmark"></span>#' + c.id + '</span>' +
      '<span class="il-title"><span class="il-t1">' + esc(c.title) + '</span>' +
      '<span class="il-t2">by ' + esc(c.who) + ' · ' + esc(placeOf(c)) +
      (c.branch ? ' · <span class="mono">' + esc(c.branch) + '</span>' : '') +
      (carryoverLabel(c) ? ' · <span class="tag tag-warning">' + carryoverLabel(c) + '</span>' : '') +
      '</span></span>' +
      '<span class="il-owner"><span class="avatar avatar-sm">' + esc(c.who.slice(0, 1)) + '</span>' +
      esc(c.who) + '</span>' +
      '<span class="il-status"><span class="tag ' + pill(c) + '">' + stageLabel(c) + '</span></span>' +
      '<span class="il-updated">' + esc(c.ago) + '</span>' +
      '<span class="il-act"><button class="btn btn-ghost" data-act="' +
      (isStart ? 'startWork' : 'notice') + '" data-arg="' +
      (isStart ? c.id : '真壳按当前状态执行对应动作') + '">' + label + '</button></span>' +
      '</div>'
    )
  }

  function listGroupsHtml(rows) {
    const g = GROUP_BY[state.groupBy]
    if (!g) return rows.map(listRowHtml).join('') || '<div class="empty">没有匹配的 issue</div>'
    const keys = []
    rows.forEach((c) => {
      const k = g.keyOf(c)
      if (!keys.includes(k)) keys.push(k)
    })
    if (g.order) keys.sort((a, b) => g.order.indexOf(a) - g.order.indexOf(b))
    if (!keys.length) return '<div class="empty">没有匹配的 issue</div>'
    return keys
      .map((k) => {
        const inGroup = rows.filter((c) => g.keyOf(c) === k)
        const shut = !!state.collapsed[state.groupBy + ':' + k]
        const dot = g.dotOf(k)
        return (
          '<button type="button" class="il-group' + (shut ? ' is-shut' : '') +
          '" data-act="toggleGroup" data-arg="' + esc(k) + '">' +
          '<span class="il-group-caret">▾</span>' +
          (dot ? '<span class="status-dot ' + dot + '"></span>' : '') +
          '<span class="il-group-name">' + esc(g.nameOf(k)) + '</span>' +
          '<span class="il-group-count">' + inGroup.length + '</span>' +
          '</button>' +
          (shut ? '' : inGroup.map(listRowHtml).join(''))
        )
      })
      .join('')
  }

  function renderList() {
    const opts = [
      '<option value="">全部</option>',
      '<option value="unscheduled">未排期</option>',
      '<option value="v0.4">v0.4</option>',
      '<option value="v0.3">v0.3</option>'
    ].join('')
    const groupOpt = (v, name) =>
      '<option value="' + v + '"' + (state.groupBy === v ? ' selected' : '') + '>' + name + '</option>'
    $('list-view').innerHTML =
      '<div class="il-bar"><div class="il-presets"><div class="seg">' +
      '<label class="seg-opt"><input type="radio" name="il-preset" checked>开放</label>' +
      '<label class="seg-opt"><input type="radio" name="il-preset">分配我的</label>' +
      '<label class="seg-opt"><input type="radio" name="il-preset">我的</label></div>' +
      '<span class="il-shown" id="il-shown"></span></div>' +
      '<div class="il-tools">' +
      (state.version === 'all' ? '<select class="input input-sm" data-act-change="filterPlan">' + opts + '</select>' : '') +
      '<select class="input input-sm" data-act-change="filterStage"><option value="">全部阶段</option><option value="scheduled">已排期</option><option value="progress">进行中</option><option value="review">待评审</option><option value="blocked">阻塞</option><option value="done">完成</option><option value="cancelled">已取消</option></select>' +
      '<select class="input input-sm" data-act-change="groupBy" title="分组">' +
      groupOpt('status', '按状态分组') + groupOpt('owner', '按负责人分组') + groupOpt('none', '不分组') +
      '</select>' +
      '<div class="il-search-wrap"><input class="input input-sm" placeholder="Search issues..." data-act-input="search" value="' +
      esc(state.q) + '"></div>' +
      '</div></div>' +
      '<div class="list issue-list" id="il-list"></div>'
    renderListRows()
  }

  /* 搜索框在工具条里：整块重绘会把焦点连着光标一起吞掉，所以敲字只重绘行 */
  function renderListRows() {
    const rows = listRows()
    const shown = $('il-shown')
    if (shown) shown.textContent = '显示 ' + rows.length + ' / ' + visibleCards().length
    $('il-list').innerHTML =
      '<div class="list-row il-head"><span class="il-num">ID</span><span class="il-title">标题 · 上下文</span><span class="il-owner">负责人</span><span class="il-status">状态</span><span class="il-updated">已更新</span><span class="il-act"></span></div>' +
      listGroupsHtml(rows)
  }

  function modalShell(kicker, title, body, actions, extra) {
    return (
      '<div class="dialog-backdrop" data-backdrop><div class="dialog dialog-wide plan-modal ' + (extra || '') + '">' +
      '<div class="plan-modal-head"><div class="plan-modal-tag">' + kicker + '</div>' +
      '<div class="plan-modal-title">' + title + '</div>' +
      '<button class="btn btn-ghost btn-quiet btn-icon plan-modal-x" data-act="closeModal">✕</button></div>' +
      '<div class="plan-modal-body">' + body + '</div>' +
      '<div class="plan-modal-foot"><span></span><div class="row">' + actions + '</div></div></div></div>'
    )
  }

  function openDetail(id) {
    const c = cards.find((x) => x.id === Number(id))
    if (!c) return
    const carryover = carryoverLabel(c)
    const body =
      '<textarea class="input detail-body-text">' + esc(c.body) + '</textarea>' +
      '<div class="plan-meta-grid">' +
      '<div class="detail-row span-all"><div class="k">链接</div>issue #' + c.id + ' ↗</div>' +
      '<div class="detail-row span-all"><div class="k">类别</div><select class="input"><option>构建</option><option>优化</option><option>原型</option></select></div>' +
      '<div class="detail-row"><div class="k">状态</div><select class="input"><option>' + stageLabel(c) +
      '</option><option>完成</option></select></div>' +
      '<div class="detail-row"><div class="k">计划</div><div class="row-wrap"><select class="input"><option>' +
      (state.version === 'all' ? placeOf(c) : state.version) + '</option><option>未排期</option></select>' +
      (carryover ? '<span class="tag tag-warning">' + carryover + '</span>' : '') + '</div></div>' +
      '<div class="detail-row"><div class="k">负责人</div><input class="input" value="' +
      esc(c.who === '未指派' ? '' : c.who) + '" placeholder="指派谁"></div></div>' +
      '<div class="plan-review-hint">Complete 由人确认。agent 跑完只到待评审。</div>'
    const start = startBtnLabel(c)
    const primary = start
      ? '<button class="btn btn-secondary" data-act="startWork" data-arg="' + c.id + '">' + start + '</button>'
      : '<button class="btn btn-secondary" data-act="notice" data-arg="真壳会按当前状态执行对应动作">' +
        (c.seg === 'unscheduled' ? 'schedule' : 'Open') + '</button>'
    $('bw-modal-root').innerHTML = modalShell(
      '详情 · #' + c.id,
      '<input class="input plan-modal-title-input" value="' + esc(c.title) + '">',
      body,
      primary +
        '<button class="btn btn-secondary" data-act="notice" data-arg="完成需要人确认">Complete</button>' +
        '<button class="btn btn-primary" data-act="saveDetail">保存</button>'
    )
  }

  const MODALS = {
    new: ['新建', '新建 issue', '<div class="field"><label>标题 *</label><input class="input" placeholder="这张活要干什么"></div><div class="field"><label>正文</label><textarea class="input" placeholder="要做成什么、边界。可空"></textarea></div><div class="field"><label>类别</label><select class="input"><option>原型</option><option>构建</option><option>优化</option></select></div><div class="field"><label>负责人</label><input class="input" placeholder="指派谁(可空)"></div><div class="hint">新建的 issue 排进当前版本。</div>', '创建'],
    create: ['版本', '创建版本', '<div class="field"><label>版本名 *</label><input class="input" value="v0.5" placeholder="例如 v0.5"></div><div class="field-2"><div class="field"><label>开始</label><input class="input" type="date" value="2026-09-07"></div><div class="field"><label>结束</label><input class="input" type="date" value="2026-09-11"></div></div><div class="hint">创建版本时会同时建立这个版本的运作活①。</div>', '创建'],
    delete: ['删除版本', '删除版本', '<div class="field"><label>选版本</label><select class="input"><option>v0.4</option></select></div><div class="hint">确认后摘掉 issue 上的 bw:plan 标签。</div>', '删除'],
    pack: ['出包', '出包', '<div class="field"><label>版本号</label><input class="input" value="v0.4" readonly></div><div class="ship-rows"><div class="ship-row ship-row--idle"><span class="ship-dot"></span><span class="ship-row-label">出包</span><span class="ship-row-text">还没开始</span></div><div class="ship-row ship-row--idle"><span class="ship-dot"></span><span class="ship-row-label">验包</span><span class="ship-row-text">出包过了再验</span></div></div>', '确认 · 出包'],
    release: ['发版本', '发版本', '<div class="field"><label>版本号</label><input class="input" value="v0.4" readonly></div><div class="field"><label>说明</label><textarea class="input">版本 v0.4 完成的活</textarea></div><div class="hint">确认后给这份代码打远端 tag；勾上的已完成 issue 才打发版标签。</div>', '确认 · 发版']
  }

  function openModal(kind) {
    const x = MODALS[kind]
    if (!x) return
    const danger = kind === 'delete' ? 'btn-danger' : 'btn-primary'
    $('bw-modal-root').innerHTML = modalShell(
      x[0],
      x[1],
      x[2],
      '<button class="btn btn-secondary" data-act="closeModal">取消</button>' +
        '<button class="btn ' + danger + '" data-act="confirmModal" data-arg="' + x[3] + '：原型不写远端">' + x[3] +
        '</button>'
    )
  }

  function closeModal() {
    $('bw-modal-root').innerHTML = ''
  }

  function switchVersion(version) {
    state.version = version
    state.plan = ''
    state.stage = ''
    state.q = ''
    const all = version === 'all'
    $('view-title').textContent = all ? '全部 issue' : version + (version === 'v0.4' ? ' · 本周' : '')
    $('rename-btn').classList.toggle('modal-hidden', all || version === 'v0.3')
    $('version-head').classList.toggle('modal-hidden', all)
    $('create-version').classList.toggle('modal-hidden', !all)
    $('delete-version').classList.toggle('modal-hidden', !all)
    $('pack-btn').classList.toggle('modal-hidden', all)
    $('release-btn').classList.toggle('modal-hidden', all)
    $('release-btn').disabled = version === 'v0.3'
    renderBoard()
    if (state.mode === 'list') renderList()
  }

  function toggleMode() {
    state.mode = state.mode === 'board' ? 'list' : 'board'
    $('board-view').classList.toggle('modal-hidden', state.mode !== 'board')
    $('list-view').classList.toggle('modal-hidden', state.mode !== 'list')
    $('mode-btn').textContent = state.mode === 'board' ? '☰' : '▦'
    $('mode-btn').title = state.mode === 'board' ? '切换列表视图' : '切换看板视图'
    if (state.mode === 'list') renderList()
  }

  /* ── 知识库：文档树 + 代码图 ─────────────────────────────── */

  function codeGraph() {
    const box = (x, label, sub) =>
      '<rect x="' + x + '" y="58" width="128" height="58" rx="8" fill="var(--color-card)" ' +
      'stroke="var(--color-accent)" stroke-width="1.3"/>' +
      '<text x="' + (x + 64) + '" y="82" text-anchor="middle" font-family="var(--font-mono)" font-size="12.5" ' +
      'fill="var(--color-text)">' + label + '</text>' +
      '<text x="' + (x + 64) + '" y="99" text-anchor="middle" font-family="var(--font-mono)" font-size="10.5" ' +
      'fill="var(--color-text)" opacity="0.6">' + sub + '</text>'
    const arrow = (x1, x2) =>
      '<line x1="' + x1 + '" y1="87" x2="' + x2 + '" y2="87" stroke="var(--color-text)" stroke-opacity="0.45" ' +
      'stroke-width="1.3" marker-end="url(#kbArrow)"/>'
    return (
      '<svg viewBox="0 0 640 175" width="100%" style="max-width:640px;display:block">' +
      '<defs><marker id="kbArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">' +
      '<path d="M0,0 L6,3 L0,6 Z" fill="var(--color-text)" fill-opacity="0.45"/></marker></defs>' +
      arrow(148, 240) + arrow(384, 476) +
      box(20, 'bw', '内核 · 本地零库') +
      box(256, 'bw-engine', '底座 · PTY / 远端') +
      box(492, 'app-shell', '壳 · 八屏') +
      '</svg>'
    )
  }

  function renderKb() {
    if (state.kbTab === 'graph') {
      $('kb-body').innerHTML =
        '<div class="card kb-graph">' +
        '<span class="card-kicker">代码图</span>' +
        '<span class="card-title">bw → bw-engine → app-shell</span>' +
        codeGraph() +
        '<div class="kb-graph-foot">索引时间 2026-09-13 09:10 · codegraph explore</div>' +
        '</div>'
      return
    }
    const groups = []
    KB_DOCS.forEach((d) => {
      let g = groups.find((x) => x.name === d.group)
      if (!g) groups.push((g = { name: d.group, docs: [] }))
      g.docs.push(d)
    })
    const tree = groups
      .map(
        (g) =>
          '<div class="kb-tree-group">' + esc(g.name) + '</div>' +
          g.docs
            .map(
              (d) =>
                '<button type="button" class="kb-tree-item" data-act="kbDoc" data-arg="' + d.id + '"' +
                (state.kbDoc === d.id ? ' aria-current="true"' : '') + '>' + esc(d.name) + '</button>'
            )
            .join('')
      )
      .join('')
    const doc = KB_DOCS.find((d) => d.id === state.kbDoc) || KB_DOCS[0]
    $('kb-body').innerHTML =
      '<div class="kb-split"><div class="card kb-tree">' + tree + '</div>' +
      '<div class="card kb-doc"><span class="card-title">' + esc(doc.name) + '</span>' +
      '<div class="kb-doc-path">' + esc(doc.path) + '</div>' +
      '<pre>' + esc(doc.lines.join('\n')) + '</pre></div></div>'
  }

  /* ── 自动化屏 ──────────────────────────────────────────────
     字段与列照 ../orca 的 Automations（名字 / 计划 / 项目 / 下次运行 / 上次运行 /
     状态 / Agent / ⋯），但表格用设计系统的 .table —— 这屏是 Workbench 屏，
     不是 Orca 执行面，视觉归设计系统。

     钟从 Orca 收回来了。铁律没松：到点只负责开会话，自动开出来的活最多推到
     待评审，完成永远由人点。 */

  function autoRows() {
    const q = state.autoQ.trim().toLowerCase()
    return AUTOMATIONS.filter((a) => a.project === state.project)
      .filter((a) => !state.autoStatus || (state.autoStatus === 'on' ? a.enabled : !a.enabled))
      .filter((a) => !q || (a.name + ' ' + a.prompt + ' ' + a.schedule).toLowerCase().includes(q))
  }

  function autoRowHtml(a) {
    const menu =
      state.autoMenu === a.id
        ? '<div class="auto-menu">' +
          '<button class="auto-menu-item" data-act="autoRunNow" data-arg="' + a.id + '">立刻跑一次</button>' +
          '<button class="auto-menu-item" data-act="autoEdit" data-arg="' + a.id + '">编辑</button>' +
          '<button class="auto-menu-item" data-act="autoToggle" data-arg="' + a.id + '">' +
          (a.enabled ? '暂停' : '启用') + '</button>' +
          '<button class="auto-menu-item is-danger" data-act="autoDelete" data-arg="' + a.id + '">删除</button>' +
          '</div>'
        : ''
    return (
      '<tr data-act="autoEdit" data-arg="' + a.id + '" class="rowbtn">' +
      '<td class="t-name">' + esc(a.name) + '</td>' +
      '<td class="mono auto-sched">' + esc(a.schedule) + '</td>' +
      '<td class="t-sub">' + esc(a.project) + '</td>' +
      '<td class="t-sub">' + esc(a.next) + '</td>' +
      '<td><span class="auto-last"><span class="dot ' + (a.lastOk ? 'c-done' : 'c-blocked') + '"></span>' +
      esc(a.last) + '</span><span class="auto-last-note">' + esc(a.lastNote) + '</span></td>' +
      '<td>' + (a.enabled
        ? '<span class="tag tag-success">启用</span>'
        : '<span class="tag tag-outline">暂停</span>') + '</td>' +
      '<td class="t-sub">' + esc(a.agent) + '</td>' +
      '<td class="auto-more"><button class="btn btn-ghost btn-icon" title="更多" data-act="autoMenu" data-arg="' +
      a.id + '">⋯</button>' + menu + '</td>' +
      '</tr>'
    )
  }

  function renderAuto() {
    const opt = (v, name) =>
      '<option value="' + v + '"' + (state.autoStatus === v ? ' selected' : '') + '>' + name + '</option>'
    $('auto-wrap').innerHTML =
      '<div class="pane-head"><h2>自动化</h2>' +
      '<span class="hint">到点自己开会话；开出来的活最多到待评审，完成永远由人点</span>' +
      '<span class="spacer"></span>' +
      '<div class="il-search-wrap auto-search"><input class="input input-sm" placeholder="搜自动化…" data-act-input="autoSearch" value="' +
      esc(state.autoQ) + '"></div>' +
      '<select class="input input-sm" data-act-change="autoStatus">' +
      opt('', '全部状态') + opt('on', '启用') + opt('off', '暂停') + '</select>' +
      '<button class="btn btn-secondary" data-act="notice" data-arg="已重新读一遍本机的定时任务与上次运行结果">刷新</button>' +
      '<button class="btn btn-primary" data-act="autoNew">新建自动化</button>' +
      '</div>' +
      '<div class="tbl-wrap auto-tbl"><table class="table" data-list="automations"><thead><tr>' +
      '<th style="width:22%">名字</th><th style="width:13%">计划</th><th style="width:9%">项目</th>' +
      '<th style="width:11%">下次运行</th><th style="width:21%">上次运行</th><th style="width:8%">状态</th>' +
      '<th style="width:11%">Agent</th><th style="width:5%"></th>' +
      '</tr></thead><tbody id="auto-tbody"></tbody></table></div>' +
      '<p class="auto-note">' +
      '钟在 Workbench 自己（原来这句话是「钟在 Orca」）。precheck 不过就不开会话，如实记一条失败，' +
      '不悄悄跳过；错过的那次按宽限时间补跑，过了宽限就不补。' +
      '</p>'
    renderAutoRows()
  }

  // 同上：搜索框在头上，敲字只重绘行
  function renderAutoRows() {
    const rows = autoRows()
    $('auto-tbody').innerHTML = rows.length
      ? rows.map(autoRowHtml).join('')
      : '<tr><td colspan="8" class="empty">这个项目下没有匹配的自动化</td></tr>'
  }

  /* 自动化编辑弹窗：左边名字 + 提示词，右边设置栏（Agent · 项目 · Workspace ·
     会话 · 计划 · 补跑宽限 · Precheck · setup），字段跟 ../orca 的 AutomationDraft 对齐 */

  const AUTO_PRESETS = [
    ['hourly', '每小时'],
    ['daily', '每天'],
    ['weekdays', '工作日'],
    ['weekly', '每周'],
    ['custom', '自定义 cron']
  ]
  const DOW = [['1', '周一'], ['2', '周二'], ['3', '周三'], ['4', '周四'], ['5', '周五'], ['6', '周六'], ['0', '周日']]

  function selectHtml(act, value, options) {
    return (
      '<select class="input input-sm" data-act-change="' + act + '">' +
      options
        .map(([v, name]) => '<option value="' + v + '"' + (value === v ? ' selected' : '') + '>' + name + '</option>')
        .join('') +
      '</select>'
    )
  }

  function renderAutoEditor() {
    const d = state.draft
    if (!d) return
    const scheduleRow =
      d.preset === 'custom'
        ? '<input class="input input-sm mono" placeholder="0 * * * *" data-act-input="draftCron" value="' + esc(d.cron) + '">'
        : d.preset === 'hourly'
          ? '<span class="hint">每小时的第 ' + esc((d.time || '09:00').split(':')[1] || '00') + ' 分</span>'
          : '<input class="input input-sm" type="time" data-act-input="draftTime" value="' + esc(d.time) + '">'
    const wsRow =
      d.wsMode === 'existing'
        ? selectHtml('draftWs', d.ws, [['issue-70', 'issue-70'], ['issue-74', 'issue-74'], ['project', 'bw/project']])
        : '<input class="input input-sm mono" placeholder="基分支" data-act-input="draftBase" value="' + esc(d.base) + '">'
    const body =
      '<div class="ae-grid">' +
      '<div class="ae-main">' +
      '<input class="input ae-name" placeholder="给这条自动化起个名字" data-act-input="draftName" value="' + esc(d.name) + '">' +
      '<textarea class="input ae-prompt" placeholder="到点了让 agent 干什么。写清边界：能不能改代码、要不要开 issue" data-act-input="draftPrompt">' +
      esc(d.prompt) + '</textarea>' +
      '<p class="hint">这段提示词就是开会话时发过去的第一句话。系统提示词与规范件由产品注入，不用在这里重复。</p>' +
      '</div>' +
      '<div class="ae-side">' +
      '<div class="ae-row"><span class="k">Agent</span>' +
      selectHtml('draftAgent', d.agent, [['Claude Code', 'Claude Code'], ['Cursor', 'Cursor']]) + '</div>' +
      '<div class="ae-row"><span class="k">项目</span>' +
      selectHtml('draftProject', d.project, PROJECTS.map((p) => [p.slug, p.name])) + '</div>' +
      '<div class="ae-row"><span class="k">Workspace</span>' +
      selectHtml('draftWsMode', d.wsMode, [['new', '每次新建一棵树'], ['existing', '复用现有 worktree']]) + '</div>' +
      '<div class="ae-row"><span class="k"></span>' + wsRow + '</div>' +
      '<div class="ae-row"><span class="k">会话</span>' +
      selectHtml('draftReuse', d.reuse ? 'reuse' : 'fresh', [['fresh', '每次新起一场'], ['reuse', '复用上一场']]) + '</div>' +
      '<div class="ae-sep"></div>' +
      '<div class="ae-row"><span class="k">计划</span>' + selectHtml('draftPreset', d.preset, AUTO_PRESETS) + '</div>' +
      '<div class="ae-row"><span class="k"></span>' + scheduleRow + '</div>' +
      (d.preset === 'weekly'
        ? '<div class="ae-row"><span class="k">星期</span>' + selectHtml('draftDow', d.dow, DOW) + '</div>'
        : '') +
      '<div class="ae-row"><span class="k">补跑宽限</span>' +
      '<input class="input input-sm" data-act-input="draftGrace" value="' + esc(d.grace) + '"><span class="hint">分钟</span></div>' +
      '<div class="ae-sep"></div>' +
      '<div class="ae-row"><span class="k">Precheck</span>' +
      '<input class="input input-sm mono" placeholder="不填就不预检" data-act-input="draftPrecheck" value="' + esc(d.precheck) + '"></div>' +
      '<div class="ae-row"><span class="k">超时</span>' +
      '<input class="input input-sm" data-act-input="draftPrecheckTimeout" value="' + esc(d.precheckTimeout) + '"><span class="hint">秒</span></div>' +
      '<div class="ae-row"><span class="k">setup</span>' +
      selectHtml('draftSetup', d.setup, [['run', '跑仓里的 setup'], ['skip', '跳过']]) + '</div>' +
      '</div></div>' +
      '<p class="plan-review-hint">自动化不会把活推到完成：它最多把活推到待评审，完成由人点。</p>'
    $('bw-modal-root').innerHTML = modalShell(
      d.id ? '自动化 · 编辑' : '自动化 · 新建',
      esc(d.name || '新建自动化'),
      body,
      '<button class="btn btn-secondary" data-act="closeModal">取消</button>' +
        (d.id
          ? '<button class="btn btn-secondary" data-act="autoRunNow" data-arg="' + d.id + '">立刻跑一次</button>'
          : '') +
        '<button class="btn btn-primary" data-act="autoSave">保存</button>',
      'bw-dialog-xl'
    )
  }

  function autoDraft(a) {
    return Object.assign({}, a)
  }

  /* ── 顶层覆盖层：项目墙 / 设置 ──────────────────────────────
     为什么是覆盖层而不是第五、第六屏：这两样都在项目之上，做成屏就得回答
     「左栏此刻代表谁」；做成覆盖层不用回答 —— 关掉就回原地，上下文一点不丢。
     渲染进 #bw-top（不是 #bw-screen：人在执行面时那一整块是 hidden 的）。 */

  const curProject = () => PROJECTS.find((p) => p.slug === state.project) || PROJECTS[0]

  function dotStyle(signal) {
    return ' style="--status-c:' + (SIGNAL_C[signal] || SIGNAL_C.unknown) + '"'
  }

  function wallProjects() {
    const q = state.wallQ.trim().toLowerCase()
    if (!q) return PROJECTS
    return PROJECTS.filter((p) =>
      (p.slug + ' ' + p.name + ' ' + p.brief + ' ' + (p.ver || '')).toLowerCase().includes(q)
    )
  }

  function wallGridHtml() {
    const rows = wallProjects()
    if (!rows.length) {
      return '<div class="empty">没有名字或一句话对得上「' + esc(state.wallQ) + '」的项目</div>'
    }
    return '<div class="wall-grid">' + rows.map(wallCardHtml).join('') + '</div>'
  }

  function renderWallGrid() {
    const host = $('wall-grid-host')
    if (host) host.innerHTML = wallGridHtml()
  }

  function wallBody() {
    const counts = { green: 0, amber: 0, red: 0, unknown: 0 }
    PROJECTS.forEach((p) => {
      counts[p.signal] = (counts[p.signal] || 0) + 1
    })
    const envItem = (t) =>
      '<span class="env-item' + (t.ok === false ? ' fail' : '') + '" title="' + esc(t.detail) + '">' +
      '<span class="status-dot"' + dotStyle(t.ok === true ? 'green' : t.ok === false ? 'red' : 'unknown') + '></span>' +
      esc(t.label) + ' · ' + (t.ok === true ? '可用' : t.ok === false ? '不可用' : '未检测') + '</span>'
    const healthGroup = (k) =>
      '<span class="health-group"><span class="status-dot"' + dotStyle(k) + '></span>' +
      SIGNAL_NAME[k] + ' ' + counts[k] + '</span>'
    return (
      '<div class="pane-head bw-top-head"><h2>项目墙</h2>' +
      '<span class="hint">共 ' + PROJECTS.length + ' 个项目 · 换项目不打断已经在跑的会话</span>' +
      '<span class="spacer"></span>' +
      '<input class="input wall-q" type="search" placeholder="找项目（名字 / 一句话 / 版本号）" ' +
      'data-act-input="wallSearch" value="' + esc(state.wallQ) + '">' +
      '<div class="seg wall-seg" title="原型对比：同一份内容两种长相">' +
      '<label class="seg-opt"><input type="radio" name="wall-mode"' +
      (state.wallMode === 'dialog' ? ' checked' : '') + ' data-act-change="wallMode" data-arg="dialog">弹窗</label>' +
      '<label class="seg-opt"><input type="radio" name="wall-mode"' +
      (state.wallMode === 'sheet' ? ' checked' : '') + ' data-act-change="wallMode" data-arg="sheet">全窗</label>' +
      '</div>' +
      '<button class="btn btn-secondary" data-act="notice" data-arg="已重新读一遍各仓与远端">刷新</button>' +
      '<button class="btn btn-primary" data-act="notice" data-arg="接入项目是另一条旅程（打开本地仓 / 克隆远端仓），V3 没做">+ 接入项目</button>' +
      '<button class="btn btn-ghost btn-icon" title="关闭（Esc）" data-bw-act="closeTop">✕</button>' +
      '</div>' +
      '<div class="card envbar"><span class="bar-label">本机环境</span>' + ENV.map(envItem).join('') +
      '<span class="spacer"></span>' +
      '<button class="btn btn-secondary btn-sm" data-act="notice" data-arg="探活：只报本机装没装，不管登录；探不到如实说，不退回别的工具">测一下</button>' +
      '</div>' +
      '<div class="card healthbar"><span class="bar-label">健康概览</span>' +
      ['green', 'amber', 'red', 'unknown'].map(healthGroup).join('') +
      '<span class="spacer hint">信号只从数据来：没数据是灰的，不是绿的</span></div>' +
      '<div id="wall-grid-host">' + wallGridHtml() + '</div>'
    )
  }

  function wallCardHtml(p) {
    const pct = p.total ? Math.round((p.done / p.total) * 100) : 0
    return (
      '<div class="card pcard' + (p.slug === state.project ? ' is-current' : '') +
      '" data-bw-pick="' + p.slug + '">' +
      '<div class="pcard-top">' +
      (p.ver
        ? '<span class="tag tag-outline mono">' + esc(p.ver) + '</span>'
        : '<span class="tag tag-outline mono" title="当前没有在研版本">版本未定</span>') +
      '<span class="tag tag-neutral">' + esc(p.remote) + '</span>' +
      (p.unread ? '<span class="tag tag-accent" title="待评审">⚑ ' + p.unread + '</span>' : '') +
      '<span class="spacer"></span>' +
      (p.slug === state.project ? '<span class="tag tag-accent-2">当前</span>' : '') +
      '<span class="status-dot status-dot-lg"' + dotStyle(p.signal) + '></span>' +
      '</div>' +
      '<div class="pcard-name">' + esc(p.name) + '</div>' +
      '<div class="pcard-oneliner">' + esc(p.brief) + '</div>' +
      '<div class="pcard-meta"><span>' +
      (p.goal ? '版本目标：' + esc(p.goal) : '版本目标：还没定') + '</span><span>' +
      (p.delivery ? '上次交付 ' + esc(p.delivery) : '上次交付：仓里还没有发版记录') + '</span></div>' +
      '<div class="pcard-bar"><div class="pcard-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="hint">' + (p.total ? '本版 ' + p.done + '/' + p.total + ' 完成' : '本版暂无排期') + '</div>' +
      '</div>'
    )
  }

  function settingsNav() {
    const q = state.setQ.trim().toLowerCase()
    const hit = (label) => !q || label.toLowerCase().includes(q)
    return (
      ['本机', '能力']
      .map((sec) => {
        const items = SET_NAV.filter((n) => n.sec === sec && hit(n.label))
        if (!items.length) return ''
        return (
          '<div class="st-sec">' + sec + '</div>' +
          items
            .map(
              (n) =>
                '<button type="button" class="sidebar-item" data-act="setPage" data-arg="' + n.key + '"' +
                (state.setPage === n.key ? ' aria-current="page"' : '') + '>' + esc(n.label) +
                (n.count ? '<span class="count">' + n.count + '</span>' : '') + '</button>'
            )
            .join('')
        )
        })
        .join('') || '<div class="empty">没有匹配项</div>'
    )
  }

  function settingsBody() {
    return (
      '<div class="pane-head bw-top-head"><h2>设置</h2>' +
      '<span class="hint">顶层的东西：本机目录与外观、装了什么能力。没有登录 —— 凭证在系统钥匙串</span>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-ghost btn-icon" title="关闭（Esc）" data-bw-act="closeTop">✕</button>' +
      '</div>' +
      '<div class="st-shell">' +
      '<div class="st-nav"><input class="input search" type="search" placeholder="搜索设置" data-act-input="setSearch" value="' +
      esc(state.setQ) + '"><div id="st-nav-list">' + settingsNav() + '</div></div>' +
      '<div class="st-body" id="st-body">' + settingsPage() + '</div>' +
      '</div>'
    )
  }

  function tbl(cols, rows) {
    return (
      '<div class="tbl-wrap"><table class="table"><thead><tr>' +
      cols.map((c) => '<th' + (c[1] ? ' style="width:' + c[1] + '"' : '') + '>' + c[0] + '</th>').join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>'
    )
  }

  function settingsPage() {
    if (state.setPage === 'dirs') {
      return (
        '<div class="pane-head"><h2>目录</h2></div>' +
        '<div class="set-group">' +
        '<div class="set-row"><div class="set-text"><div class="set-title">工作区根目录</div>' +
        '<div class="hint">只决定以后新接进来的项目默认落在哪。已接入的项目各自记着自己的仓路径，一个都不会被牵着走。</div></div>' +
        '<div class="set-ctl"><input class="input mono" value="/Users/dong/projects">' +
        '<button class="btn btn-secondary" data-act="notice" data-arg="原型不写盘；真壳存本机 settings.toml，立刻生效">保存</button></div></div>' +
        '<div class="set-row"><div class="set-text"><div class="set-title">数据目录</div>' +
        '<div class="hint">进程起来就定了，改它得重启，所以这里只如实显示，不给一个按不动的按钮。</div></div>' +
        '<div class="set-ctl"><span class="path mono">~/Library/Application Support/bw</span></div></div>' +
        '</div>'
      )
    }
    if (state.setPage === 'theme') {
      return (
        '<div class="pane-head"><h2>外观</h2></div>' +
        '<div class="set-group"><div class="set-row"><div class="set-ctl">' +
        ['claude', 'apple']
          .map(
            (k) =>
              '<label class="choice"><input type="radio" name="bw-theme"' + (k === 'claude' ? ' checked' : '') +
              ' data-act-change="setTheme" data-arg="' + k + '">' +
              '<span class="choice-pv" data-theme="' + k + '"><span class="theme-pv"><span></span>' +
              '<span class="theme-pv-lines"><i></i><i></i><i class="w-70"></i></span></span></span>' +
              '<span class="choice-label">' + (k === 'claude' ? 'Claude' : 'Apple') + '</span></label>'
          )
          .join('') +
        '</div></div></div>'
      )
    }
    if (state.setPage === 'connector') {
      return (
        '<div class="pane-head"><h2>Connector</h2>' +
        '<button class="btn btn-secondary" data-act="notice" data-arg="重新探活：只报装没装，探不到如实报错，不悄悄退回别的工具">重新检测</button></div>' +
        tbl(
          [['', '5%'], ['名字', '26%'], ['类型', '14%'], ['谁用到', '40%'], ['', '5%']],
          SET_CONNECTORS.map(
            (c) =>
              '<tr class="rowbtn" data-act="notice" data-arg="' +
              esc(c.name + '：' + c.detail + '。供' + c.gives.join(' / ')) + '">' +
              '<td><span class="dot ' + (c.status === 'done' ? 'c-done' : c.status === 'unset' ? 'c-unset' : 'c-idle') + '"></span></td>' +
              '<td class="t-name">' + esc(c.name) + '</td>' +
              '<td><span class="tag tag-outline">' + esc(c.kind) + '</span></td>' +
              '<td class="t-sub">' + (c.used.length ? esc(c.used.join(' · ')) : '没有类别用到') + '</td>' +
              '<td class="go">›</td></tr>'
          )
        ) +
        '<p class="auto-note">「Orca 网页地址」这一项已经删了（ADR-0006 会话执行内嵌）；定时任务的钟也不在这里配，' +
        '在项目内的自动化屏。</p>'
      )
    }
    if (state.setPage === 'stage') {
      return (
        '<div class="pane-head"><h2>Category</h2>' +
        '<span class="hint">原来这张表在项目内的「配置」屏。执行器映射不挂项目维度，摆在设置才对</span></div>' +
        tbl(
          [['', '5%'], ['工作类别', '16%'], ['执行器', '30%'], ['Workflow', '44%'], ['', '5%']],
          SET_STAGE.map(
            (r) =>
              '<tr><td><span class="dot ' + (r.ok ? 'c-done' : 'c-blocked') + '" title="' +
              (r.ok ? '执行器探到了' : '执行器探不到') + '"></span></td>' +
              '<td class="t-name">' + esc(r.label) + '</td>' +
              '<td>' + selectHtml('cfgTool', r.tool, SET_TOOLS.map((t) => [t.value, t.label])) + '</td>' +
              '<td>' + selectHtml('cfgWorkflow', r.workflow, [['mattpocock-skills', 'mattpocock-skills'], ['superpowers', 'superpowers（⚠ 接不上）']]) + '</td>' +
              '<td class="go" data-act="notice" data-arg="' +
              esc(r.label + ' 开工会拿到：' + (r.injects.length ? r.injects.join(' · ') : '没有规范件')) + '">›</td></tr>'
          )
        ) +
        '<p class="auto-note">探不到就如实报错，不悄悄退回 Claude —— 上面红点那两行就是现在开不了工的。</p>'
      )
    }
    if (state.setPage === 'skills') {
      return (
        '<div class="pane-head"><h2>Skills</h2></div>' +
        tbl(
          [['名字', '30%'], ['来源', '26%'], ['谁用到', '26%'], ['状态', '18%']],
          SET_SKILLS.map(
            (s) =>
              '<tr><td class="t-name">' + esc(s.name) + '</td>' +
              '<td class="t-sub mono">' + esc(s.from) + '</td>' +
              '<td class="t-sub">' + esc(s.used) + '</td>' +
              '<td>' + (s.state === '在用'
                ? '<span class="tag tag-success">在用</span>'
                : '<span class="tag tag-outline">没接</span>') + '</td></tr>'
          )
        )
      )
    }
    if (state.setPage === 'plugins') {
      return (
        '<div class="pane-head"><h2>Plugins</h2>' +
        '<span class="hint">vendor 进仓的业界 workflow 库，跟着产品走，不跟人走</span></div>' +
        tbl(
          [['名字', '28%'], ['版本', '14%'], ['skill', '12%'], ['谁用到', '34%'], ['许可', '12%']],
          SET_PLUGINS.map(
            (p) =>
              '<tr><td class="t-name">' + esc(p.name) + '</td>' +
              '<td class="mono t-sub">' + esc(p.ver) + '</td>' +
              '<td class="num">' + p.skills + '</td>' +
              '<td class="t-sub">' + esc(p.used) + '</td>' +
              '<td class="t-sub">' + esc(p.license) + '</td></tr>'
          )
        )
      )
    }
    return (
      '<div class="pane-head"><h2>AI Assets</h2>' +
      '<span class="hint">开工时会注入给 agent 的规范件；哪一类注入哪几份在 Category 里定</span></div>' +
      tbl(
        [['名字', '42%'], ['类型', '18%'], ['说明', '40%']],
        SET_ASSETS.map(
          (a) =>
            '<tr><td class="t-name mono">' + esc(a.name) + '</td>' +
            '<td><span class="tag tag-outline">' + esc(a.kind) + '</span></td>' +
            '<td class="t-sub">' + esc(a.note) + '</td></tr>'
        )
      )
    )
  }

  function renderTop() {
    const host = $('bw-top')
    if (!state.top) {
      host.innerHTML = ''
      return
    }
    const body = state.top === 'wall' ? wallBody() : settingsBody()
    // 项目墙的「全窗」那版：盖住左栏，才是真的顶层；设置一直是居中弹窗
    if (state.top === 'wall' && state.wallMode === 'sheet') {
      host.innerHTML = '<div class="bw-sheet"><div class="bw-sheet-inner">' + body + '</div></div>'
      return
    }
    host.innerHTML =
      '<div class="dialog-backdrop" data-bw-backdrop><div class="dialog bw-dialog-xl">' + body + '</div></div>'
  }

  function openTop(which) {
    state.top = which
    if (which === 'wall') state.wallQ = ''
    renderTop()
  }

  function closeTop() {
    state.top = null
    renderTop()
  }

  function pickProject(slug) {
    const p = PROJECTS.find((x) => x.slug === slug)
    if (!p) return
    state.project = slug
    state.issue = null
    closeTop()
    renderProjectHead()
    go(state.screen || 'overview')
    // Projects 里那棵树是 Orca 会话面自己的演示数据，不跟着换 —— 如实说，别让人以为切干净了
    notice('切到 ' + p.name + '：项目头、计划、自动化跟着换；Projects 里的树是会话面演示数据（原型留白）')
  }

  function renderProjectHead() {
    const p = curProject()
    $('bw-proj-logo').textContent = p.logo
    $('bw-proj-name').textContent = p.name
    $('bw-proj-ver').textContent = p.ver || '版本未定'
    $('bw-proj-dot').className = 'status-dot ' + (p.running ? 'running' : 'idle')
    $('bw-proj-dot').title = p.running ? '有 agent 在跑' : '没有 agent 在跑'
    const badge = $('bw-proj-badge')
    badge.textContent = p.unread || ''
    badge.hidden = !p.unread
  }

  /* ── 会话屏顶条 ──────────────────────────────────────────── */

  function renderSession() {
    const c = state.issue
    const s = state.live
    $('bw-issue-num').textContent = c ? '#' + c.id : '—'
    $('bw-issue-title').textContent = c ? c.title : '还没开工'
    $('bw-tool').textContent = c && c.tool ? c.tool : '—'
    $('bw-branch').textContent = s.branch
    $('bw-path').textContent = s.path
    const dirty = s.counts.staged + s.counts.changes + s.counts.untracked
    $('bw-changes').textContent = dirty ? '变更 ' + dirty + ' 个文件' : '变更 —'

    let dot = 'idle'
    let text = '空闲'
    if (s.creating) {
      dot = 'running'
      text = '建树中'
    } else if (s.running) {
      dot = 'running'
      text = '运行中'
    } else if (!s.isMain) {
      // 分清两件事：人刚点了停止，和这棵树本来就没有 agent 在跑
      dot = 'idle'
      text = state.stoppedBranch === s.branch ? '已停止 · 树还在' : '树在 · 未在跑'
    }
    $('bw-run-dot').className = 'status-dot ' + dot
    $('bw-run-text').textContent = text
    $('bw-stop').disabled = !s.running
    $('bw-attach').disabled = !c
    renderNav()
  }

  function startWork(id) {
    const c = cards.find((x) => x.id === Number(id))
    if (!c) return
    if (c.work === 'none') {
      notice('#' + c.id + ' 在这份原型里没有会话 fixture：只有 #74（建树）和 #70（接回）能真开工，不给假会话')
      return
    }
    closeModal()
    state.issue = c
    state.stoppedBranch = null
    enterWork()
    if (c.work === 'attach') {
      post({ t: 'activate', worktree: 'wt-' + c.id })
      notice('#' + c.id + ' 已有 workspace：只 activate/reveal，不建第二棵树')
    } else {
      post({ t: 'openCreate', name: '#' + c.id + ' ' + c.title, branch: c.branch, issue: c.id })
      notice('开工 #' + c.id + '：建树弹窗已带上 Issue 与分支，点 Create worktree 走建树序')
      setRail(1)
    }
    renderSession()
  }

  /* ── 演示条：一条链路，别让人猜下一步点哪 ───────────────── */

  const RAIL = [
    {
      label: '计划屏',
      run: () => {
        state.issue = null
        post({ t: 'demo', step: 0 })
        go('plan')
        renderSession()
      }
    },
    { label: '开工', run: () => startWork(74) },
    { label: '建树中', run: () => { enterWork(); post({ t: 'demo', step: 2 }) } },
    { label: '终端', run: () => { enterWork(); post({ t: 'demo', step: 3 }) } },
    { label: '审变更', run: () => { enterWork(); post({ t: 'demo', step: 4 }) } },
    {
      label: '停止',
      run: () => {
        enterWork()
        state.stoppedBranch = state.live.branch
        post({ t: 'stop' })
      }
    }
  ]

  function setRail(i) {
    state.railStep = i
    renderRail()
  }

  function renderRail() {
    $('bw-rail').innerHTML =
      RAIL.map(
        (s, i) =>
          '<button type="button" class="rail-step' + (state.railStep === i ? ' is-active' : '') +
          '" data-bw-rail="' + i + '"><span class="idx">' + (i + 1) + '</span>' + esc(s.label) + '</button>'
      ).join('') + '<span class="rail-tag">一体 V3</span>'
  }

  /* ── 事件 ────────────────────────────────────────────────── */

  const ACTS = {
    notice: (arg) => notice(arg),
    closeModal,
    openModal,
    openDetail,
    startWork,
    toggleMode,
    kbDoc: (arg) => {
      state.kbDoc = arg
      renderKb()
    },
    renameVersion: () => {
      const next = prompt('版本名', state.version)
      if (!next || !next.trim()) return
      $('view-title').textContent = next.trim() + ' · 本周'
      notice('原型只演示改名；真壳会同步到远端里程碑与标签')
    },
    toggleGoal: (arg, el) => el.closest('.goal-box').classList.toggle('is-open'),
    saveDetail: () => {
      closeModal()
      notice('已保存原型中的编辑')
    },
    confirmModal: (arg) => {
      closeModal()
      notice(arg)
    },

    /* 计划列表的分组折叠头 */
    toggleGroup: (arg) => {
      const key = state.groupBy + ':' + arg
      state.collapsed[key] = !state.collapsed[key]
      renderListRows()
    },

    /* 自动化 */
    autoMenu: (arg) => {
      state.autoMenu = state.autoMenu === arg ? null : arg
      renderAutoRows()
    },
    autoNew: () => {
      state.draft = {
        id: '', name: '', enabled: true, schedule: '', preset: 'daily', time: '09:00', dow: '1', cron: '',
        grace: '30', project: state.project, wsMode: 'new', ws: '', base: 'main', reuse: false,
        agent: 'Claude Code', next: '', last: '还没跑过', lastOk: true, lastNote: '',
        precheck: '', precheckTimeout: '60', setup: 'run', prompt: ''
      }
      renderAutoEditor()
    },
    autoEdit: (arg) => {
      const a = AUTOMATIONS.find((x) => x.id === arg)
      if (!a) return
      state.autoMenu = null
      state.draft = autoDraft(a)
      renderAutoEditor()
    },
    autoToggle: (arg) => {
      const a = AUTOMATIONS.find((x) => x.id === arg)
      if (!a) return
      a.enabled = !a.enabled
      a.next = a.enabled ? '按计划' : '已暂停'
      state.autoMenu = null
      renderAutoRows()
      notice(a.name + (a.enabled ? '：已启用，到点自己开会话' : '：已暂停，钟不再响'))
    },
    autoDelete: (arg) => {
      const i = AUTOMATIONS.findIndex((x) => x.id === arg)
      if (i < 0) return
      const name = AUTOMATIONS[i].name
      AUTOMATIONS.splice(i, 1)
      state.autoMenu = null
      renderAutoRows()
      notice('原型里删掉了「' + name + '」；真壳会先问一次，历史运行记录另存')
    },
    autoRunNow: (arg) => {
      const a = AUTOMATIONS.find((x) => x.id === arg)
      state.autoMenu = null
      closeModal()
      renderAutoRows()
      notice((a ? a.name : '这条自动化') + '：真壳会立刻开一场会话；跑完最多把活推到待评审，不推完成')
    },
    autoSave: () => {
      const d = state.draft
      if (!d) return
      if (!d.name.trim()) {
        notice('先给这条自动化起个名字')
        return
      }
      d.schedule = scheduleLabelOf(d)
      const hit = AUTOMATIONS.find((x) => x.id === d.id)
      if (hit) Object.assign(hit, d)
      else {
        d.id = 'a' + (AUTOMATIONS.length + 1) + Date.now().toString(36).slice(-3)
        d.next = d.enabled ? '按计划' : '已暂停'
        AUTOMATIONS.push(Object.assign({}, d))
      }
      state.draft = null
      closeModal()
      renderAutoRows()
      notice('原型只演示存下来；真壳写本机定时任务表，到点由 Workbench 自己开会话')
    },

    /* 设置：换页 */
    setPage: (arg) => {
      state.setPage = arg
      $('st-nav-list').innerHTML = settingsNav()
      $('st-body').innerHTML = settingsPage()
    }
  }

  function scheduleLabelOf(d) {
    if (d.preset === 'custom') return 'cron ' + (d.cron || '* * * * *')
    if (d.preset === 'hourly') return '每小时'
    if (d.preset === 'weekdays') return '工作日 ' + d.time
    if (d.preset === 'weekly') {
      const name = (DOW.find((x) => x[0] === d.dow) || ['', '周一'])[1]
      return '每' + name + ' ' + d.time
    }
    return '每天 ' + d.time
  }

  const BW_ACTS = {
    hideToast,
    openWall: () => openTop('wall'),
    openSettings: () => openTop('settings'),
    closeTop,
    stopRun: () => {
      state.stoppedBranch = state.live.branch
      post({ t: 'stop' })
      setRail(5)
    },
    attachRun: () => {
      const c = state.issue
      if (!c) return
      post({ t: 'activate', worktree: 'wt-' + c.id })
      notice('接回 #' + c.id + '：activate/reveal 同一棵树')
    }
  }

  document.addEventListener('click', (ev) => {
    // V3 自己的属性一律 data-bw-*，避开会话面已经在用的 data-action / data-tab / data-file …
    const rail = ev.target.closest('[data-bw-rail]')
    if (rail) {
      const i = Number(rail.dataset.bwRail)
      setRail(i)
      RAIL[i].run()
      return
    }

    const nav = ev.target.closest('[data-bw-go]')
    if (nav) {
      go(nav.dataset.bwGo)
      return
    }

    // 项目墙里点一张卡 = 换项目
    const pick = ev.target.closest('[data-bw-pick]')
    if (pick) {
      pickProject(pick.dataset.bwPick)
      return
    }

    // 顶层覆盖层：点弹窗外面关掉（全窗那版没有「外面」，只能点 ✕ 或 Esc）
    const topBackdrop = ev.target.closest('[data-bw-backdrop]')
    if (topBackdrop && ev.target === topBackdrop) {
      closeTop()
      return
    }

    // 自动化那颗 ⋯ 菜单：点别处就收起来
    if (state.autoMenu && !ev.target.closest('.auto-more')) {
      state.autoMenu = null
      if ($('auto-tbody')) renderAutoRows()
    }

    /* 点 Projects 里的树 / New workspace → 进执行面（prototype.js 自己处理选树与弹窗）。
       这里只能认属性，不能写 '#worktree-list [data-worktree]'：会话面的 click 监听注册得早、
       先跑，它会把整条 worktree 列表 innerHTML 重绘掉，等这里拿到 ev.target 时它已经脱离
       文档，往上找不到 #worktree-list 这个祖先 —— 带作用域的选择器会永远落空。 */
    if (ev.target.closest('[data-worktree]') || ev.target.closest('#new-workspace-btn')) {
      enterWork()
    }

    const bwAct = ev.target.closest('[data-bw-act]')
    if (bwAct && BW_ACTS[bwAct.dataset.bwAct]) {
      BW_ACTS[bwAct.dataset.bwAct]()
      return
    }

    const notif = ev.target.closest('[data-bw-notice]')
    if (notif) {
      notice(notif.dataset.bwNotice)
      return
    }

    const backdrop = ev.target.closest('[data-backdrop]')
    if (backdrop && ev.target === backdrop) {
      closeModal()
      return
    }

    const act = ev.target.closest('[data-act]')
    if (act && ACTS[act.dataset.act]) {
      // 卡上的 ▶开工 不要连带把详情也打开
      ev.stopPropagation()
      ACTS[act.dataset.act](act.dataset.arg, act)
    }
  })

  document.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-act-change]')
    if (!el) return
    const act = el.dataset.actChange
    if (act === 'switchVersion') switchVersion(el.value)
    else if (act === 'chooseSegment') {
      const parts = String(el.dataset.arg).split(':')
      state.segments[parts[0]] = parts[1]
      renderBoard()
    } else if (act === 'filterPlan') {
      state.plan = el.value
      renderList()
    } else if (act === 'filterStage') {
      state.stage = el.value
      renderList()
    } else if (act === 'kbTab') {
      state.kbTab = el.dataset.arg
      renderKb()
    } else if (act === 'groupBy') {
      state.groupBy = el.value
      renderList()
    } else if (act === 'autoStatus') {
      state.autoStatus = el.value
      renderAutoRows()
    } else if (act === 'wallMode') {
      state.wallMode = el.dataset.arg
      renderTop()
    } else if (act === 'cfgTool') {
      notice('原型只演示改映射；真壳写本机 settings，探不到的执行器如实报错，不悄悄退回 Claude')
    } else if (act === 'cfgWorkflow') {
      notice('原型只演示改 workflow；接不上的那条真壳里带 ⚠，不假装能用')
    } else if (act === 'setTheme') {
      notice('原型固定浅色；真壳这里切设计系统的 Claude / Apple 两套 token')
    } else if (act.startsWith('draft')) {
      draftSet(act, el.dataset.arg || el.value)
      // 计划预设 / Workspace 方式变了，右栏跟着换字段，所以要重绘
      renderAutoEditor()
    }
  })

  /* 编辑弹窗里的文本框：只更新草稿，不重绘 —— 重绘会把焦点和光标一起吞掉 */
  const DRAFT_FIELD = {
    draftName: 'name',
    draftPrompt: 'prompt',
    draftCron: 'cron',
    draftTime: 'time',
    draftBase: 'base',
    draftGrace: 'grace',
    draftPrecheck: 'precheck',
    draftPrecheckTimeout: 'precheckTimeout',
    draftAgent: 'agent',
    draftProject: 'project',
    draftWs: 'ws',
    draftWsMode: 'wsMode',
    draftPreset: 'preset',
    draftDow: 'dow',
    draftSetup: 'setup'
  }

  function draftSet(act, value) {
    if (!state.draft) return
    if (act === 'draftReuse') {
      state.draft.reuse = value === 'reuse'
      return
    }
    const key = DRAFT_FIELD[act]
    if (key) state.draft[key] = value
  }

  document.addEventListener('input', (ev) => {
    const el = ev.target.closest('[data-act-input]')
    if (!el) return
    const act = el.dataset.actInput
    if (act === 'search') {
      state.q = el.value
      renderListRows()
    } else if (act === 'autoSearch') {
      state.autoQ = el.value
      renderAutoRows()
    } else if (act === 'wallSearch') {
      state.wallQ = el.value
      renderWallGrid()
    } else if (act === 'setSearch') {
      state.setQ = el.value
      $('st-nav-list').innerHTML = settingsNav()
    } else if (act.startsWith('draft')) {
      draftSet(act, el.value)
    }
  })

  /* Esc：先关屏内弹窗，再关顶层覆盖层 —— 一次只关一层，别一下清空 */
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return
    if ($('bw-modal-root').innerHTML) {
      state.draft = null
      closeModal()
      return
    }
    if (state.top) closeTop()
  })

  /* 会话面回报：V3 是同页宿主，消息在本窗内往返 */
  window.addEventListener('message', (ev) => {
    const d = ev.data
    if (!d || d.__bw !== 'orca') return
    if (d.t === 'ready') {
      post({ t: 'demo', step: 0 })
      return
    }
    if (d.t === 'state') {
      state.live = {
        branch: d.branch,
        path: d.path,
        running: !!d.running,
        isMain: !!d.isMain,
        creating: !!d.creating,
        counts: d.counts || { staged: 0, changes: 0, untracked: 0 }
      }
      // 人直接在会话面里建树 / 切树时，顶条也要跟上；建树开始则确保已在执行面
      if (d.creating && state.screen !== null) enterWork()
      if (!d.isMain) {
        const hit = cards.find((c) => c.branch === d.branch)
        if (hit) state.issue = hit
      }
      renderSession()
    }
  })

  /* ── 起手 ────────────────────────────────────────────────── */

  function boot() {
    document.querySelectorAll('[data-bw-icon]').forEach((el) => {
      el.innerHTML = svg(el.dataset.bwIcon)
    })
    renderProjectHead()
    mountOverview()
    renderBoard()
    renderKb()
    renderSession()
    renderRail()
    go('overview')
    // 握手：prototype.js 的 ready 可能在本文件注册监听之前就发出去了，
    // 所以主动要一次状态（demo step 0 = 空闲态，它会 render 并回报）。
    post({ t: 'demo', step: 0 })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})()
