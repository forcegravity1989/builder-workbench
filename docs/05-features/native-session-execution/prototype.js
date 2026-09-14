/* 原生会话执行 · Orca 1:1 原型 — 全部交互行为 */
;(function () {
  'use strict'

  // ── Icons (Lucide-like, inline) ──────────────────────────
  const PATHS = {
    folder:
      '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    code: '<path d="m10 20-6-8 6-8"/><path d="m14 4 6 8-6 8"/>',
    doc: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h6"/><path d="M8 17h4"/>',
    gitBranch:
      '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
    gitCommit: '<circle cx="12" cy="12" r="3"/><path d="M3 12h6"/><path d="M15 12h6"/>',
    gitPr: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
    collapse: '<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="m14 10 7-7"/><path d="m3 21 7-7"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9"/>',
    terminal: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
    discard: '<path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/><path d="M3 3v5h5"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    sparkle: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/>',
    layout:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>'
  }

  /** 每棵树默认开着的中栏页签：Terminal / Claude Code / Open Design（Diff 另开） */
  function defaultTabs() {
    return [
      { id: 'terminal', kind: 'terminal', label: 'Terminal' },
      { id: 'claude', kind: 'claude', label: 'Claude Code' },
      { id: 'opendesign', kind: 'opendesign', label: 'Open Design' }
    ]
  }

  function tabIcon(kind, label) {
    if (kind === 'terminal') return 'terminal'
    if (kind === 'claude') return 'sparkle'
    if (kind === 'opendesign') return 'layout'
    return glyphFor(label)
  }

  function isPinnedTab(kind) {
    return kind === 'terminal' || kind === 'claude' || kind === 'opendesign'
  }

  function icon(name, size) {
    const s = size || 14
    return (
      '<svg width="' +
      s +
      '" height="' +
      s +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      (PATHS[name] || '') +
      '</svg>'
    )
  }

  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  const $ = (sel) => document.querySelector(sel)

  // ── Fixture data ─────────────────────────────────────────

  const PROJECT = 'loop-buddy'
  const REPO = {
    id: 'repo-loop-buddy',
    displayName: PROJECT,
    path: '~/projects/loop-buddy'
  }

  // Orca model: Git worktrees hang under a Repo/Project header (Worktree.repoId).
  // Main checkout first; linked worktrees nest under the same repo — not peers of it.
  const WORKTREES = [
    {
      id: 'main',
      title: 'main',
      branch: 'main',
      path: '~/projects/loop-buddy',
      running: false,
      exists: true,
      isMain: true,
      repoId: REPO.id
    },
    {
      id: 'wt-70',
      title: '#70 · 完善出包进度回执',
      branch: 'bw/issue-70',
      path: '.bw/worktrees/issue-70',
      running: false,
      exists: true,
      isMain: false,
      repoId: REPO.id
    },
    {
      id: 'wt-74',
      title: '#74 · 校准计划屏高保真',
      branch: 'bw/issue-74',
      path: '.bw/worktrees/issue-74',
      running: true,
      exists: false,
      isMain: false,
      repoId: REPO.id
    }
  ]

  const TREE_PATHS = [
    'Cargo.toml',
    'README.md',
    'crates/app-shell/src/main.rs',
    'crates/app-shell/src/screens/mod.rs',
    'crates/app-shell/src/screens/plan/mod.rs',
    'crates/app-shell/src/screens/session/mod.rs',
    'crates/core/src/lib.rs',
    'docs/05-features/native-session-execution/intent.md',
    'docs/05-features/native-session-execution/notes.md',
    'docs/05-features/native-session-execution/spec.md',
    'docs/architecture.md',
    'docs/hifi/README.md'
  ]

  function initialFiles() {
    return [
      {
        path: 'crates/app-shell/src/screens/plan/mod.rs',
        status: 'M',
        add: 32,
        del: 9,
        section: 'changes'
      },
      { path: 'docs/hifi/README.md', status: 'M', add: 11, del: 3, section: 'changes' },
      {
        path: 'docs/05-features/native-session-execution/spec.md',
        status: 'A',
        add: 5,
        del: 0,
        section: 'changes'
      },
      {
        path: 'docs/05-features/native-session-execution/notes.md',
        status: 'U',
        add: 0,
        del: 0,
        section: 'untracked'
      }
    ]
  }

  const BRANCH_COMMITS = [
    { sha: '8f2c1ab', msg: 'plan: calibrate hifi spacing tokens', when: '2h ago', add: 31, del: 8 },
    { sha: '41d9e07', msg: 'session: wire native pty stream', when: '4h ago', add: 96, del: 24 }
  ]

  // kind: ctx | add | del
  const DIFFS = {
    'crates/app-shell/src/screens/plan/mod.rs': [
      {
        old: 118,
        new: 118,
        lines: [
          ['ctx', 'use crate::theme::tokens::{SPACE_2, SPACE_3};'],
          ['ctx', 'use dioxus::prelude::*;'],
          ['ctx', ''],
          ['del', 'const LANE_GAP: f32 = 12.0;'],
          ['del', 'const CARD_PAD: f32 = 10.0;'],
          ['add', 'const LANE_GAP: f32 = SPACE_3;'],
          ['add', 'const CARD_PAD: f32 = SPACE_2;'],
          ['add', 'const CARD_RADIUS: f32 = 6.0;'],
          ['ctx', ''],
          ['ctx', '#[component]'],
          ['ctx', 'pub fn PlanScreen(project: ProjectId) -> Element {']
        ]
      },
      {
        old: 164,
        new: 166,
        lines: [
          ['ctx', '    let lanes = use_lanes(project);'],
          ['ctx', ''],
          ['del', '    rsx! {'],
          ['del', '        div { class: "plan-board",'],
          ['del', '            for lane in lanes.iter() {'],
          ['del', '                LaneColumn { lane: lane.clone() }'],
          ['add', '    // Why: the board owns the gap so a lane never double-pads its neighbour.'],
          ['add', '    rsx! {'],
          ['add', '        div {'],
          ['add', '            class: "plan-board",'],
          ['add', '            style: "gap: {LANE_GAP}px; padding: {CARD_PAD}px;",'],
          ['add', '            for lane in lanes.iter() {'],
          ['add', '                LaneColumn {'],
          ['add', '                    lane: lane.clone(),'],
          ['add', '                    radius: CARD_RADIUS,'],
          ['add', '                }'],
          ['ctx', '            }'],
          ['ctx', '        }'],
          ['ctx', '    }'],
          ['ctx', '}']
        ]
      }
    ],
    'docs/hifi/README.md': [
      {
        old: 12,
        new: 12,
        lines: [
          ['ctx', '## 高保真原型'],
          ['ctx', ''],
          ['del', '原型以 Workbench 外壳承载会话屏。'],
          ['add', '原型以 **Orca 同款外壳** 承载会话屏：建树弹窗 / 建树面板 / Explorer·Source Control·Diff。'],
          ['add', ''],
          ['add', '打开：`docs/05-features/native-session-execution/prototype.html`'],
          ['ctx', ''],
          ['ctx', '## 约定']
        ]
      }
    ],
    'docs/05-features/native-session-execution/spec.md': [
      {
        old: 0,
        new: 1,
        lines: [
          ['add', '# Spec · 原生会话执行（一体产品）'],
          ['add', ''],
          ['add', '> 会话屏 = 本机终端 + Orca 同序建树 + Explorer / Source Control / Diff。'],
          ['add', ''],
          ['add', '可点原型：同目录 `prototype.html`（Orca chrome 1:1）。']
        ]
      }
    ],
    'docs/05-features/native-session-execution/notes.md': [
      {
        old: 0,
        new: 1,
        lines: [
          ['add', '# 建树笔记（未跟踪）'],
          ['add', ''],
          ['add', '- provision → refresh_worktrees → create_session → activate/reveal'],
          ['add', '- 停止 = 杀本机 agent/PTY，终端与变更列表保留']
        ]
      }
    ]
  }

  const CREATION_LABELS = [
    'Preparing workspace…',
    'Fetching base branch…',
    'Creating worktree…',
    'Setting up your workspace…'
  ]

  const TERMINAL_IDLE = [
    ['term-dim', '~/projects/loop-buddy  on main'],
    ['term-prompt', '$ '],
    ['cursor', '']
  ]

  const TERMINAL_RUNNING = [
    ['term-dim', '.bw/worktrees/issue-74  on bw/issue-74'],
    ['term-prompt', '$ claude'],
    ['term-line', ''],
    ['term-accent', '✻ Claude Code v2.1.4 · issue #74 校准计划屏高保真'],
    ['term-dim', '  cwd   .bw/worktrees/issue-74'],
    ['term-dim', '  base  main · branch bw/issue-74'],
    ['term-line', ''],
    ['term-line', '> 把计划屏的泳道间距接到设计令牌上，别再写死 12/10。'],
    ['term-line', ''],
    ['term-dim', '⏺ Read(crates/app-shell/src/screens/plan/mod.rs)'],
    ['term-dim', '  ⎿ 412 lines'],
    ['term-dim', '⏺ Grep(SPACE_2|SPACE_3, crates/app-shell/src/theme)'],
    ['term-dim', '  ⎿ 2 matches'],
    ['term-warn', '⏺ Update(crates/app-shell/src/screens/plan/mod.rs)'],
    ['term-ok', '  ⎿ +32 -9'],
    ['term-warn', '⏺ Update(docs/hifi/README.md)'],
    ['term-ok', '  ⎿ +11 -3'],
    ['term-warn', '⏺ Write(docs/05-features/native-session-execution/spec.md)'],
    ['term-ok', '  ⎿ +5'],
    ['term-line', ''],
    ['term-dim', '⏺ Bash(cargo check -p app-shell)'],
    ['term-ok', '  ⎿ Finished dev profile in 4.81s'],
    ['term-line', ''],
    ['term-line', '  泳道间距与卡片内边距已改读 SPACE_3 / SPACE_2，新增 CARD_RADIUS。'],
    ['term-line', '  cargo check 通过。变更见右栏 Source Control。'],
    ['term-line', ''],
    ['term-prompt', '$ '],
    ['cursor', '']
  ]

  // ── State ────────────────────────────────────────────────

  const state = {
    activeWorktreeId: 'main',
    repoCollapsed: false,
    rightTab: 'explorer',
    tabs: defaultTabs(),
    activeTabId: 'terminal',
    files: initialFiles(),
    commits: BRANCH_COMMITS.slice(),
    expanded: new Set([
      'crates',
      'crates/app-shell',
      'crates/app-shell/src',
      'crates/app-shell/src/screens',
      'crates/app-shell/src/screens/plan',
      'docs',
      'docs/05-features',
      'docs/05-features/native-session-execution',
      'docs/hifi'
    ]),
    explorerQuery: '',
    explorerView: 'names',
    scFilterOpen: false,
    scFilter: '',
    scSections: { staged: true, changes: true, untracked: true, committed: false },
    commitMessage: '',
    dialog: null,
    creation: null,
    flashPath: null,
    demoStep: 0
  }

  function activeWorktree() {
    return WORKTREES.find((w) => w.id === state.activeWorktreeId) || WORKTREES[0]
  }

  function isFeatureTree() {
    return state.activeWorktreeId === 'wt-74'
  }

  function explorerRootLabel() {
    const w = activeWorktree()
    if (w.isMain) return REPO.displayName
    // Worktree path basename — Explorer root = that tree's folder
    const parts = w.path.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || w.title
  }

  function visibleFiles(section) {
    if (!isFeatureTree()) return []
    return state.files.filter((f) => f.section === section)
  }

  function fileFor(path) {
    return state.files.find((f) => f.path === path)
  }

  function baseName(p) {
    return p.split('/').pop()
  }

  function dirName(p) {
    const parts = p.split('/')
    parts.pop()
    return parts.join('/')
  }

  function matches(path, query) {
    return baseName(path).toLowerCase().includes(query) || path.toLowerCase().includes(query)
  }

  function glyphFor(name) {
    if (/\.rs$/.test(name)) return 'code'
    if (/\.(md|txt)$/.test(name)) return 'doc'
    return 'file'
  }

  // ── Focus preservation across re-render ──────────────────

  function captureFocus() {
    const el = document.activeElement
    if (!el || !el.dataset || !el.dataset.focusKey) return null
    return { key: el.dataset.focusKey, start: el.selectionStart, end: el.selectionEnd }
  }

  function restoreFocus(snap) {
    if (!snap) return
    const el = document.querySelector('[data-focus-key="' + snap.key + '"]')
    if (!el) return
    el.focus()
    if (snap.start != null && el.setSelectionRange) {
      el.setSelectionRange(snap.start, snap.end)
    }
  }

  // ── Toast ────────────────────────────────────────────────

  function toast(message, iconName) {
    const root = $('#toast-root')
    const el = document.createElement('div')
    el.className = 'toast'
    el.innerHTML =
      '<span style="color:var(--muted-foreground)">' +
      icon(iconName || 'check', 13) +
      '</span><span>' +
      esc(message) +
      '</span>'
    root.appendChild(el)
    setTimeout(() => {
      el.classList.add('is-leaving')
      setTimeout(() => el.remove(), 220)
    }, 2100)
  }

  // ── Left sidebar ─────────────────────────────────────────

  function renderSidebar() {
    const btn = $('#new-workspace-btn')
    if (btn) btn.innerHTML = icon('plus', 14)
    const titleEl = $('#sidebar-header-title')
    if (titleEl) titleEl.textContent = 'Projects'

    const kids = WORKTREES.filter((w) => w.exists && w.repoId === REPO.id)
    // Main checkout first (orderMainWorktreeFirst), then linked.
    kids.sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.title.localeCompare(b.title))

    // Orca SectionHeader: [RepoIcon] [title] …… [Chevron][…][+]  (actions hover-only)
    // pl=10, h=28, gap=6; NO leading chevron; NO count in the title row.
    const header =
      '<div class="repo-header' +
      (state.repoCollapsed ? ' is-collapsed' : '') +
      ' group">' +
      '<span class="repo-header-icon" aria-hidden="true">' +
      icon('folder', 14) +
      '</span>' +
      '<button type="button" class="repo-header-label" data-action="toggle-repo" title="' +
      esc(REPO.path) +
      '">' +
      '<span class="repo-header-name">' +
      esc(REPO.displayName) +
      '</span></button>' +
      '<span class="repo-header-actions">' +
      '<button type="button" class="icon-btn" data-action="toggle-repo" aria-label="Collapse project" title="Collapse">' +
      '<span class="chevron chevron-down' +
      (state.repoCollapsed ? ' is-collapsed' : '') +
      '">' +
      icon('chevronRight', 14) +
      '</span></button>' +
      '<button type="button" class="icon-btn" data-action="noop" aria-label="Project menu" title="More">' +
      icon('more', 12) +
      '</button>' +
      '<button type="button" class="icon-btn" data-action="create-under-repo" aria-label="Create workspace for ' +
      esc(REPO.displayName) +
      '" title="Create workspace for ' +
      esc(REPO.displayName) +
      '">' +
      icon('plus', 12) +
      '</button></span></div>'

    // Cards: status dot only (no git/folder glyph). Title + optional primary badge.
    // Meta = branch short name only (hideRepoBadge under groupBy=repo).
    const rows = state.repoCollapsed
      ? ''
      : kids
          .map((w) => {
            const active = w.id === state.activeWorktreeId
            const changed = w.id === 'wt-74' && isFeatureTree() ? state.files.length : 0
            return (
              '<button type="button" class="worktree-row' +
              (active ? ' is-active' : '') +
              (w.isMain ? ' is-main' : '') +
              '" data-worktree="' +
              w.id +
              '">' +
              '<span class="worktree-status-lane" aria-hidden="true">' +
              '<span class="status-dot ' +
              (w.running ? 'running' : 'idle') +
              '"></span></span>' +
              '<span class="worktree-row-main">' +
              '<span class="worktree-row-title">' +
              '<span class="worktree-title-text">' +
              esc(w.title) +
              '</span>' +
              (w.isMain ? '<span class="primary-badge">primary</span>' : '') +
              (changed ? '<span class="count-chip">' + changed + '</span>' : '') +
              '</span>' +
              '<span class="worktree-row-meta">' +
              esc(w.branch) +
              '</span>' +
              '</span>' +
              '</button>'
            )
          })
          .join('')

    $('#worktree-list').innerHTML = header + rows
    $('#sidebar-footer').innerHTML = ''
  }

  // ── Center: tab strip ────────────────────────────────────

  function renderTabs() {
    $('#tabstrip').innerHTML = state.tabs
      .map((t) => {
        const active = t.id === state.activeTabId
        return (
          '<div class="tab' +
          (active ? ' is-active' : '') +
          '" data-tab="' +
          esc(t.id) +
          '">' +
          icon(tabIcon(t.kind, t.label), 12) +
          '<span class="tab-label">' +
          esc(t.label) +
          '</span>' +
          (t.kind === 'diff'
            ? '<span class="tab-close" data-close-tab="' +
              esc(t.id) +
              '" title="Close">' +
              icon('x', 10) +
              '</span>'
            : '') +
          '</div>'
        )
      })
      .join('')
  }

  function buildOpenDesign() {
    const el = document.createElement('div')
    el.className = 'od-pane'
    el.innerHTML =
      '<div class="od-pane-head">Open Design · 本机网页内嵌（loopback）</div>' +
      '<div class="od-pane-canvas">' +
      '<span class="od-pane-glyph">◐</span>' +
      '<span>原型类活默认停这页；探活拿 loopback 首页</span>' +
      '<span class="od-pane-hint">照旧可嵌本机页，不走配对 URL</span>' +
      '</div>'
    return el
  }

  function buildClaudePane() {
    const el = document.createElement('div')
    el.className = 'claude-pane'
    if (isFeatureTree() && activeWorktree().running) {
      el.appendChild(buildTerminal(TERMINAL_RUNNING, false))
      return el
    }
    const w = activeWorktree()
    el.innerHTML =
      '<div class="claude-idle">' +
      '<div class="claude-idle-title">Claude Code</div>' +
      '<div class="claude-idle-meta">' +
      esc(w.path) +
      ' · ' +
      esc(w.branch) +
      '</div>' +
      '<div class="claude-idle-hint">这棵树还没在跑。从计划屏 ▶开工，或等 agent 起来后这里流式输出。</div>' +
      '</div>'
    return el
  }

  // ── Center: terminal ─────────────────────────────────────

  let terminalNode = null
  let terminalTimers = []

  function buildTerminal(lines, animate) {
    terminalTimers.forEach(clearTimeout)
    terminalTimers = []
    const pre = document.createElement('div')
    pre.className = 'terminal'
    const emit = (idx) => {
      const cls = lines[idx][0]
      const text = lines[idx][1]
      const div = document.createElement('div')
      if (cls === 'cursor') {
        div.innerHTML = '<span class="term-cursor"></span>'
      } else {
        div.className = cls
        div.textContent = text === '' ? '\u00a0' : text
      }
      pre.appendChild(div)
      pre.scrollTop = pre.scrollHeight
    }
    if (!animate) {
      lines.forEach((_, i) => emit(i))
    } else {
      lines.forEach((_, i) => {
        terminalTimers.push(setTimeout(() => emit(i), 60 + i * 80))
      })
    }
    return pre
  }

  function terminalLinesForActive() {
    const w = activeWorktree()
    if (isFeatureTree()) return TERMINAL_RUNNING
    // Idle shell in the selected worktree cwd — Explorer root and terminal stay in sync.
    return [
      ['term-dim', w.path + '  on ' + w.branch],
      ['term-prompt', '$ '],
      ['cursor', '']
    ]
  }

  function resetTerminal(animate) {
    terminalNode = buildTerminal(terminalLinesForActive(), !!animate)
  }

  // ── Center: diff ─────────────────────────────────────────

  function renderDiff(path) {
    const f = fileFor(path)
    const hunks = DIFFS[path] || [{ old: 1, new: 1, lines: [['ctx', '（该文件无差异）']] }]
    let body = ''
    hunks.forEach((h) => {
      let o = h.old
      let n = h.new
      const adds = h.lines.filter((l) => l[0] === 'add').length
      const dels = h.lines.filter((l) => l[0] === 'del').length
      body +=
        '<div class="hunk-header">' +
        '<span class="gutter" style="width:42px"></span>' +
        '<span class="gutter" style="width:42px"></span>' +
        '<span class="marker"></span>' +
        '<span class="code">@@ -' +
        h.old +
        ',' +
        (h.lines.length - adds) +
        ' +' +
        h.new +
        ',' +
        (h.lines.length - dels) +
        ' @@</span></div>'
      h.lines.forEach((line) => {
        const kind = line[0]
        const text = line[1]
        const oldNo = kind === 'add' ? '' : o++
        const newNo = kind === 'del' ? '' : n++
        const cls = kind === 'add' ? ' add' : kind === 'del' ? ' del' : ''
        const marker = kind === 'add' ? '+' : kind === 'del' ? '-' : ' '
        body +=
          '<div class="diff-line' +
          cls +
          '"><span class="gutter">' +
          oldNo +
          '</span><span class="gutter">' +
          newNo +
          '</span><span class="marker">' +
          marker +
          '</span><span class="code">' +
          (text === '' ? '\u00a0' : esc(text)) +
          '</span></div>'
      })
    })

    const el = document.createElement('div')
    el.className = 'diff'
    el.innerHTML =
      '<div class="diff-header">' +
      '<span class="diff-header-path">' +
      esc(path) +
      '</span>' +
      '<span class="diff-header-sep">·</span>' +
      '<span class="diff-header-base">' +
      icon('gitBranch', 11) +
      'vs main</span>' +
      '<span class="diff-header-stat"><span class="lines-add">+' +
      (f ? f.add : 0) +
      '</span> <span class="lines-del">-' +
      (f ? f.del : 0) +
      '</span></span>' +
      '</div>' +
      '<div class="diff-body">' +
      body +
      '</div>'
    return el
  }

  function renderCenterBody() {
    const host = $('#center-body')
    const tab = state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0]
    host.innerHTML = ''
    if (!tab || tab.kind === 'terminal') {
      if (!terminalNode) resetTerminal(false)
      host.appendChild(terminalNode)
      terminalNode.scrollTop = terminalNode.scrollHeight
    } else if (tab.kind === 'claude') {
      host.appendChild(buildClaudePane())
    } else if (tab.kind === 'opendesign') {
      host.appendChild(buildOpenDesign())
    } else {
      host.appendChild(renderDiff(tab.path))
    }
  }

  function openDiff(path, announce) {
    const id = 'diff:' + path
    if (!state.tabs.some((t) => t.id === id)) {
      state.tabs.push({ id, kind: 'diff', label: baseName(path), path })
    }
    state.activeTabId = id
    render()
    if (announce) toast('Opened diff · ' + baseName(path), 'file')
  }

  // ── Right: activity bar ──────────────────────────────────

  const RIGHT_TABS = [
    { id: 'explorer', label: 'Explorer', glyph: 'folder' },
    { id: 'scm', label: 'Source Control', glyph: 'gitBranch' }
  ]

  function renderActivityBar() {
    $('#activity-bar').innerHTML = RIGHT_TABS.map(
      (t) =>
        '<button type="button" class="activity-btn' +
        (state.rightTab === t.id ? ' is-active' : '') +
        '" data-right-tab="' +
        t.id +
        '" title="' +
        t.label +
        '" aria-label="' +
        t.label +
        '">' +
        icon(t.glyph, 16) +
        '</button>'
    ).join('')
  }

  // ── Right: Explorer ──────────────────────────────────────

  function buildTree(paths) {
    const root = { name: '', path: '', dir: true, children: [] }
    paths.forEach((p) => {
      const parts = p.split('/')
      let node = root
      parts.forEach((part, i) => {
        const isFile = i === parts.length - 1
        const full = parts.slice(0, i + 1).join('/')
        let next = node.children.find((c) => c.name === part && c.dir === !isFile)
        if (!next) {
          next = { name: part, path: full, dir: !isFile, children: [] }
          node.children.push(next)
        }
        node = next
      })
    })
    const sort = (n) => {
      n.children.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1))
      n.children.forEach(sort)
    }
    sort(root)
    return root
  }

  function renderTreeRows(node, depth, out, query) {
    node.children.forEach((child) => {
      if (child.dir) {
        const hasMatch =
          !query || TREE_PATHS.some((p) => p.startsWith(child.path + '/') && matches(p, query))
        if (!hasMatch) return
        const expanded = query ? true : state.expanded.has(child.path)
        out.push(
          '<button type="button" class="tree-row" data-folder="' +
            esc(child.path) +
            '" style="padding-left:' +
            (depth * 16 + 8) +
            'px">' +
            '<span class="chevron' +
            (expanded ? ' is-expanded' : '') +
            '">' +
            icon('chevronRight', 12) +
            '</span>' +
            '<span class="glyph">' +
            icon('folder', 13) +
            '</span>' +
            '<span class="name">' +
            esc(child.name) +
            '</span>' +
            '</button>'
        )
        if (expanded) renderTreeRows(child, depth + 1, out, query)
      } else {
        if (query && !matches(child.path, query)) return
        const f = fileFor(child.path)
        const status = isFeatureTree() && f ? f.status : ''
        const isOpen = state.activeTabId === 'diff:' + child.path
        out.push(
          '<button type="button" class="tree-row' +
            (isOpen ? ' is-open' : '') +
            (state.flashPath === child.path ? ' flash' : '') +
            '" data-file="' +
            esc(child.path) +
            '" style="padding-left:' +
            (depth * 16 + 8) +
            'px">' +
            '<span class="chevron-spacer"></span>' +
            '<span class="glyph">' +
            icon(glyphFor(child.name), 13) +
            '</span>' +
            '<span class="name' +
            (status ? ' git-' + status : '') +
            '">' +
            esc(child.name) +
            '</span>' +
            (status ? '<span class="status-letter git-' + status + '">' + status + '</span>' : '') +
            '</button>'
        )
      }
    })
  }

  function renderExplorer() {
    $('#panel-title').textContent = 'Explorer'
    $('#panel-header-actions').innerHTML =
      '<button type="button" class="icon-btn" data-action="explorer-new" title="New file" aria-label="New file">' +
      icon('plus', 13) +
      '</button>'

    const query = state.explorerQuery.trim().toLowerCase()
    const rows = []
    renderTreeRows(buildTree(TREE_PATHS), 0, rows, query)

    $('#panel-body').innerHTML =
      '<div class="explorer-toolbar">' +
      '<span class="explorer-repo" title="' +
      esc(activeWorktree().path) +
      '">' +
      esc(explorerRootLabel()) +
      '</span>' +
      '<button type="button" class="icon-btn" data-action="collapse-all" title="Collapse All" aria-label="Collapse All">' +
      icon('collapse', 13) +
      '</button>' +
      '<button type="button" class="icon-btn" data-action="refresh-explorer" title="Refresh" aria-label="Refresh">' +
      icon('refresh', 13) +
      '</button>' +
      '<button type="button" class="icon-btn" data-action="explorer-more" title="More" aria-label="More">' +
      icon('more', 13) +
      '</button>' +
      '</div>' +
      '<div class="query-strip">' +
      '<div class="field">' +
      icon('search', 12) +
      '<input type="text" data-focus-key="explorer-query" aria-label="Find files" placeholder="Find files" value="' +
      esc(state.explorerQuery) +
      '" />' +
      '</div>' +
      '<div class="view-switch">' +
      '<button type="button" data-explorer-view="names" class="' +
      (state.explorerView === 'names' ? 'is-active' : '') +
      '">Names</button>' +
      '<button type="button" data-explorer-view="contents" class="' +
      (state.explorerView === 'contents' ? 'is-active' : '') +
      '">Contents</button>' +
      '</div>' +
      '</div>' +
      '<div class="tree">' +
      (rows.length ? rows.join('') : '<div class="sc-empty">No matching files</div>') +
      '</div>'
  }

  // ── Right: Source Control ────────────────────────────────

  function sectionHeader(key, label, count, actions) {
    return (
      '<div class="sc-section-header">' +
      '<button type="button" class="sc-section-toggle" data-sc-section="' +
      key +
      '">' +
      '<span class="chevron' +
      (state.scSections[key] ? ' is-expanded' : '') +
      '">' +
      icon('chevronRight', 11) +
      '</span><span>' +
      label +
      '</span><span class="sc-section-count">' +
      count +
      '</span></button>' +
      '<span class="sc-section-actions">' +
      actions +
      '</span></div>'
    )
  }

  function scFileRow(f, section) {
    const isOpen = state.activeTabId === 'diff:' + f.path
    const dir = dirName(f.path)
    let actions =
      section === 'staged'
        ? '<span class="sc-row-action" data-sc-unstage="' +
          esc(f.path) +
          '" title="Unstage">' +
          icon('minus', 12) +
          '</span>'
        : '<span class="sc-row-action" data-sc-reveal="' +
          esc(f.path) +
          '" title="Reveal in Explorer">' +
          icon('folder', 12) +
          '</span>' +
          '<span class="sc-row-action" data-sc-stage="' +
          esc(f.path) +
          '" title="Stage">' +
          icon('plus', 12) +
          '</span>'
    actions +=
      '<span class="sc-row-action danger" data-sc-discard="' +
      esc(f.path) +
      '" title="' +
      (f.status === 'U' ? 'Delete' : 'Discard changes') +
      '">' +
      icon(f.status === 'U' ? 'trash' : 'discard', 12) +
      '</span>'

    return (
      '<div class="sc-row' +
      (isOpen ? ' is-open' : '') +
      '" data-sc-file="' +
      esc(f.path) +
      '">' +
      '<span class="glyph" style="color:var(--muted-foreground)">' +
      icon(glyphFor(f.path), 12) +
      '</span>' +
      '<span class="name">' +
      esc(baseName(f.path)) +
      '</span>' +
      (dir ? '<span class="path-hint">' + esc(dir) + '</span>' : '') +
      '<span class="sc-lines">' +
      (f.add || f.del
        ? '<span class="lines-add">+' + f.add + '</span> <span class="lines-del">-' + f.del + '</span>'
        : '') +
      '</span>' +
      '<span class="sc-row-actions">' +
      actions +
      '</span>' +
      '<span class="status-letter git-' +
      f.status +
      '">' +
      f.status +
      '</span>' +
      '</div>'
    )
  }

  function filtered(list) {
    const q = state.scFilter.trim().toLowerCase()
    return q ? list.filter((f) => matches(f.path, q)) : list
  }

  function renderSourceControl() {
    const wt = activeWorktree()
    $('#panel-title').textContent = 'Source Control'
    $('#panel-header-actions').innerHTML =
      '<button type="button" class="icon-btn" data-action="sc-refresh" title="Refresh" aria-label="Refresh">' +
      icon('refresh', 13) +
      '</button>'

    const staged = filtered(visibleFiles('staged'))
    const changes = filtered(visibleFiles('changes'))
    const untracked = filtered(visibleFiles('untracked'))
    const totalAdd = isFeatureTree() ? state.files.reduce((s, f) => s + f.add, 0) : 0
    const totalDel = isFeatureTree() ? state.files.reduce((s, f) => s + f.del, 0) : 0
    const canCommit = visibleFiles('staged').length > 0 && state.commitMessage.trim().length > 0

    const toolbar =
      '<div class="sc-toolbar">' +
      (state.scFilterOpen
        ? '<span class="sc-filter">' +
          icon('search', 12) +
          '<input type="text" data-focus-key="sc-filter" aria-label="Filter files" placeholder="Filter files…" value="' +
          esc(state.scFilter) +
          '" /></span>' +
          '<button type="button" class="icon-btn" data-action="sc-filter-close" title="Close filter" aria-label="Close filter">' +
          icon('x', 13) +
          '</button>'
        : '<button type="button" class="btn" data-action="create-pr">' +
          icon('gitPr', 12) +
          'Create PR</button>' +
          '<span style="flex:1"></span>' +
          '<button type="button" class="icon-btn" data-action="sc-filter-open" title="Filter files" aria-label="Filter files">' +
          icon('search', 13) +
          '</button>' +
          '<button type="button" class="icon-btn" data-action="sc-more" title="More" aria-label="More">' +
          icon('more', 13) +
          '</button>') +
      '</div>'

    const branchRow =
      '<button type="button" class="sc-branch-row" data-action="swap-base">' +
      icon('gitBranch', 12) +
      '<span class="sc-branch-base">main</span>' +
      '<span style="color:var(--muted-foreground)">↔</span>' +
      '<span class="sc-branch-name">' +
      esc(wt.branch) +
      '</span>' +
      '<span class="sc-lines"><span class="lines-add">+' +
      totalAdd +
      '</span> <span class="lines-del">-' +
      totalDel +
      '</span></span></button>'

    const commitArea =
      '<div class="commit-area">' +
      '<textarea data-focus-key="commit-message" aria-label="Commit message" placeholder="Message">' +
      esc(state.commitMessage) +
      '</textarea>' +
      '<div class="commit-actions">' +
      '<button type="button" class="btn btn-primary" data-action="commit"' +
      (canCommit ? '' : ' disabled') +
      '>' +
      icon('check', 12) +
      'Commit</button>' +
      '<button type="button" class="icon-btn" data-action="generate-message" title="Generate message" aria-label="Generate message">' +
      icon('sparkle', 13) +
      '</button>' +
      '</div></div>'

    let sections = sectionHeader(
      'staged',
      'Staged Changes',
      staged.length,
      '<button type="button" class="link" data-action="unstage-all">Unstage all</button>'
    )
    if (state.scSections.staged) {
      sections += staged.length
        ? staged.map((f) => scFileRow(f, 'staged')).join('')
        : '<div class="sc-empty">Nothing staged</div>'
    }

    sections += sectionHeader(
      'changes',
      'Changes',
      changes.length,
      '<button type="button" class="link" data-action="view-all">View all</button>' +
        '<button type="button" class="link" data-action="stage-all-changes">Stage all</button>' +
        '<button type="button" class="link danger" data-action="discard-all">Discard all</button>'
    )
    if (state.scSections.changes) {
      sections += changes.length
        ? changes.map((f) => scFileRow(f, 'changes')).join('')
        : '<div class="sc-empty">No changes</div>'
    }

    sections += sectionHeader(
      'untracked',
      'Untracked Files',
      untracked.length,
      '<button type="button" class="link" data-action="stage-all-untracked">Stage all</button>' +
        '<button type="button" class="link danger" data-action="delete-untracked">Delete all untracked</button>'
    )
    if (state.scSections.untracked) {
      sections += untracked.length
        ? untracked.map((f) => scFileRow(f, 'untracked')).join('')
        : '<div class="sc-empty">No untracked files</div>'
    }

    const commits = isFeatureTree() ? state.commits : []
    sections += sectionHeader('committed', 'Committed on Branch', commits.length, '')
    if (state.scSections.committed) {
      sections += commits.length
        ? commits
            .map(
              (c) =>
                '<div class="sc-commit-row">' +
                icon('gitCommit', 12) +
                '<span class="sc-commit-sha">' +
                esc(c.sha) +
                '</span><span class="sc-commit-msg">' +
                esc(c.msg) +
                '</span><span class="sc-lines"><span class="lines-add">+' +
                c.add +
                '</span> <span class="lines-del">-' +
                c.del +
                '</span></span></div>' +
                '<div class="sc-commit-detail">' +
                esc(c.when) +
                ' · ' +
                esc(wt.branch) +
                '</div>'
            )
            .join('')
        : '<div class="sc-empty">No commits ahead of main</div>'
    }

    $('#panel-body').innerHTML =
      toolbar + branchRow + commitArea + '<div class="sc-sections">' + sections + '</div>'
  }

  // ── Create worktree dialog ───────────────────────────────

  function renderDialog() {
    const root = $('#modal-root')
    if (!state.dialog) {
      root.innerHTML = ''
      return
    }
    const d = state.dialog
    const advanced = d.advancedOpen
      ? '<div class="advanced-body">' +
        '<div class="field-group">' +
        '<label class="field-label">Branch name</label>' +
        '<div class="control control-mono"><input type="text" data-focus-key="dlg-branch" aria-label="Branch name" value="' +
        esc(d.branch) +
        '" /></div></div>' +
        '<div class="field-group">' +
        '<label class="field-label">Note</label>' +
        '<textarea data-focus-key="dlg-note" aria-label="Note" placeholder="Write a note">' +
        esc(d.note) +
        '</textarea></div>' +
        '<div class="field-group">' +
        '<label class="field-label">Setup</label>' +
        '<div class="setup-row"><span>Setup script</span><span class="badge">local settings</span></div>' +
        '<button type="button" class="switch-row" data-action="toggle-setup">' +
        '<span class="switch' +
        (d.runSetup ? ' is-on' : '') +
        '"></span><span>Run setup command</span></button>' +
        '</div></div>'
      : ''

    root.innerHTML =
      '<div class="dialog-overlay" data-action="close-dialog"></div>' +
      '<div class="dialog" role="dialog" aria-modal="true" aria-label="Create worktree">' +
      '<div><h2 class="dialog-title">Create worktree</h2>' +
      '<p class="dialog-desc">New workspace in ' +
      esc(PROJECT) +
      ' · base <span style="font-family:var(--font-mono)">main</span></p></div>' +
      '<div class="field-group">' +
      '<label class="field-label">Project</label>' +
      '<button type="button" class="control" data-action="noop">' +
      icon('folder', 13) +
      '<span class="control-value">' +
      esc(PROJECT) +
      '</span><span class="control-chevron">' +
      icon('chevronRight', 12) +
      '</span></button></div>' +
      '<div class="field-group">' +
      '<label class="field-label">Name or \u2018Create From\u2019 <span class="optional">[Optional]</span></label>' +
      '<div class="control"><input type="text" data-focus-key="dlg-name" aria-label="Name or Create From" value="' +
      esc(d.name) +
      '" placeholder="Issue, branch, PR URL…" /></div></div>' +
      '<div class="field-group">' +
      '<label class="field-label">Agent</label>' +
      '<div class="field-row">' +
      '<button type="button" class="control" data-action="noop">' +
      icon('sparkle', 13) +
      '<span class="control-value">' +
      esc(d.agent) +
      '</span><span class="control-chevron">' +
      icon('chevronRight', 12) +
      '</span></button>' +
      '<button type="button" class="icon-btn" data-action="noop" title="Agent settings" aria-label="Agent settings">' +
      icon('settings', 14) +
      '</button></div></div>' +
      '<button type="button" class="advanced-toggle" data-action="toggle-advanced">' +
      '<span class="chevron' +
      (d.advancedOpen ? ' is-expanded' : '') +
      '">' +
      icon('chevronRight', 11) +
      '</span>Advanced</button>' +
      advanced +
      '<div class="dialog-footer">' +
      '<button type="button" class="switch-row" data-action="toggle-create-more">' +
      '<span class="switch' +
      (d.createMore ? ' is-on' : '') +
      '"></span><span>Create more</span></button>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn btn-primary btn-h9" data-action="submit-create">' +
      'Create worktree <span class="kbd">⌘↵</span></button>' +
      '</div></div>'
  }

  function openDialog(prefill) {
    state.dialog = {
      name: (prefill && prefill.name) || '#74 校准计划屏高保真',
      agent: (prefill && prefill.agent) || 'Claude Code',
      branch: (prefill && prefill.branch) || 'bw/issue-74',
      note: '',
      advancedOpen: false,
      runSetup: true,
      createMore: false
    }
    render()
    const input = document.querySelector('[data-focus-key="dlg-name"]')
    if (input) {
      input.focus()
      input.select()
    }
  }

  function closeDialog() {
    state.dialog = null
    render()
  }

  // ── Creation panel ───────────────────────────────────────

  let creationTimers = []
  let creationClock = null

  function startCreation(title, branch) {
    creationTimers.forEach(clearTimeout)
    creationTimers = []
    state.creation = { title, branch, labelIdx: 0, startedAt: Date.now() }
    renderCreation()
    CREATION_LABELS.forEach((_, i) => {
      if (i === 0) return
      creationTimers.push(
        setTimeout(() => {
          if (!state.creation) return
          state.creation.labelIdx = i
          renderCreation()
        }, i * 700)
      )
    })
    creationTimers.push(setTimeout(finishCreation, CREATION_LABELS.length * 700 + 400))
    postHostState()
  }

  function cancelCreation() {
    creationTimers.forEach(clearTimeout)
    creationTimers = []
    state.creation = null
    renderCreation()
    toast('Worktree creation cancelled', 'x')
    postHostState()
  }

  function finishCreation() {
    creationTimers.forEach(clearTimeout)
    creationTimers = []
    state.creation = null
    const wt = WORKTREES.find((w) => w.id === 'wt-74')
    wt.exists = true
    wt.running = true
    state.activeWorktreeId = 'wt-74'
    state.tabs = defaultTabs()
    state.activeTabId = 'terminal'
    state.rightTab = 'explorer'
    state.demoStep = 3
    resetTerminal(true)
    renderCreation()
    render()
    toast('Created worktree · bw/issue-74', 'gitBranch')
  }

  function renderCreation() {
    const host = $('#creation-panel')
    if (!state.creation) {
      host.classList.add('hidden')
      host.innerHTML = ''
      if (creationClock) {
        clearInterval(creationClock)
        creationClock = null
      }
      return
    }
    const c = state.creation
    const elapsed = Math.max(0, Math.floor((Date.now() - c.startedAt) / 1000))
    host.classList.remove('hidden')
    host.innerHTML =
      '<div class="creation-tabstrip"><div class="creation-tab">' +
      icon('gitBranch', 13) +
      '<span class="creation-tab-title">' +
      esc(c.title) +
      '</span>' +
      '<button type="button" class="tab-close" data-action="cancel-creation" title="Cancel" aria-label="Cancel worktree creation">' +
      icon('x', 10) +
      '</button></div></div>' +
      '<div class="creation-body"><div class="creation-status">' +
      '<span class="spin">' +
      icon('loader', 14) +
      '</span><span>' +
      esc(CREATION_LABELS[c.labelIdx]) +
      '</span><span class="creation-elapsed">' +
      elapsed +
      's</span></div></div>'
    if (!creationClock) {
      creationClock = setInterval(() => {
        if (state.creation) renderCreation()
      }, 1000)
    }
  }

  // ── Demo rail ────────────────────────────────────────────

  function resetWorld() {
    creationTimers.forEach(clearTimeout)
    creationTimers = []
    state.creation = null
    state.dialog = null
    state.files = initialFiles()
    state.commits = BRANCH_COMMITS.slice()
    state.commitMessage = ''
    state.scFilter = ''
    state.scFilterOpen = false
    state.explorerQuery = ''
    state.flashPath = null
    state.tabs = defaultTabs()
    state.activeTabId = 'terminal'
  }

  function demoIdle() {
    resetWorld()
    WORKTREES.find((w) => w.id === 'wt-74').exists = false
    state.activeWorktreeId = 'main'
    state.rightTab = 'explorer'
    state.demoStep = 0
    resetTerminal(false)
    renderCreation()
    render()
  }

  function demoCreate() {
    demoIdle()
    state.demoStep = 1
    openDialog()
  }

  function demoProvision() {
    // Freeze CreationPanel for inspection (true create from Dialog still auto-finishes).
    resetWorld()
    WORKTREES.find((w) => w.id === 'wt-74').exists = false
    state.activeWorktreeId = 'main'
    state.rightTab = 'explorer'
    state.demoStep = 2
    state.creation = {
      title: '#74 校准计划屏高保真',
      branch: 'bw/issue-74',
      labelIdx: 2, // Creating worktree…
      startedAt: Date.now() - 2100
    }
    resetTerminal(false)
    renderCreation()
    render()
  }

  function demoTerminal() {
    creationTimers.forEach(clearTimeout)
    creationTimers = []
    state.creation = null
    renderCreation()
    resetWorld()
    const wt = WORKTREES.find((w) => w.id === 'wt-74')
    wt.exists = true
    wt.running = true
    state.activeWorktreeId = 'wt-74'
    state.rightTab = 'explorer'
    state.demoStep = 3
    resetTerminal(true)
    renderCreation()
    render()
  }

  function demoReview() {
    demoTerminal()
    state.demoStep = 4
    state.rightTab = 'scm'
    openDiff('crates/app-shell/src/screens/plan/mod.rs')
  }

  const DEMO_STEPS = [
    { label: '空闲', run: demoIdle },
    { label: '创建', run: demoCreate },
    { label: '建树中', run: demoProvision },
    { label: '终端', run: demoTerminal },
    { label: '审变更', run: demoReview }
  ]

  const THEME_KEY = 'orca-proto-theme'

  function isDarkTheme() {
    return document.documentElement.classList.contains('dark')
  }

  function applyTheme(theme) {
    const dark = theme !== 'light'
    const next = dark ? 'dark' : 'light'
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch (_) {}
    try {
      const url = new URL(location.href)
      url.searchParams.set('theme', next)
      history.replaceState(null, '', url.pathname + '?' + url.searchParams.toString() + url.hash)
    } catch (_) {}
    // Bust stale prototype.css (old builds set dark tokens on bare :root)
    const link = document.querySelector('link[rel="stylesheet"][href*="prototype.css"]')
    if (link) {
      const css = new URL(link.href, location.href)
      css.searchParams.set('v', String(Date.now()))
      link.href = css.pathname + '?' + css.searchParams.toString()
    }
  }

  function toggleTheme() {
    applyTheme(isDarkTheme() ? 'light' : 'dark')
    renderDemoRail()
  }

  function renderDemoRail() {
    const themeLabel = isDarkTheme() ? '浅色' : '深色'
    $('#demo-rail').innerHTML =
      DEMO_STEPS.map(
        (s, i) =>
          '<button type="button" class="demo-step' +
          (state.demoStep === i ? ' is-active' : '') +
          '" data-demo="' +
          i +
          '"><span class="idx">' +
          (i + 1) +
          '</span>' +
          esc(s.label) +
          '</button>'
      ).join('') +
      '<button type="button" class="theme-toggle" data-action="toggle-theme" title="切换主题">' +
      themeLabel +
      '</button>' +
      '<span class="demo-tag">Orca 1:1</span>'
  }

  // ── Host bridge（被 prototype-v2.html 的 Workbench 壳内嵌时才活） ──
  //
  // 会话面的行为只有这一份实现；壳不复制，只发指令、收状态。
  //   壳 → 面：openCreate（带 Issue 与分支的建树弹窗）/ activate（接回同一棵树）
  //            / stop（杀 agent，终端与变更留着）/ demo（跳演示步）
  //   面 → 壳：ready / state（分支、路径、运行态、建树中、变更计数）
  const EMBED = (() => {
    try {
      return new URLSearchParams(location.search).get('embed') === '1'
    } catch (_) {
      return false
    }
  })()

  function hostPost(payload) {
    if (!EMBED) return
    // 宿主可能在父窗（旧的 iframe 内嵌），也可能就是本窗（V3 把壳和会话面放同一页，
    // window.parent === window）。协议只有一份，换的只是消息投递到哪个 window。
    const host = window.parent === window ? window : window.parent
    try {
      host.postMessage(Object.assign({ __bw: 'orca' }, payload), '*')
    } catch (_) {}
  }

  function postHostState() {
    const w = activeWorktree()
    hostPost({
      t: 'state',
      worktree: w.id,
      title: w.title,
      branch: w.branch,
      path: w.path,
      running: !!w.running,
      isMain: !!w.isMain,
      creating: !!state.creation,
      counts: {
        staged: visibleFiles('staged').length,
        changes: visibleFiles('changes').length,
        untracked: visibleFiles('untracked').length
      }
    })
  }

  function stopRun() {
    const w = activeWorktree()
    if (!w.running) {
      toast('No agent running here', 'x')
      return
    }
    w.running = false
    render()
    toast('Stopped agent · PTY closed', 'x')
  }

  const HOST_COMMANDS = {
    openCreate: (msg) => {
      demoIdle()
      state.demoStep = 1
      openDialog({ name: msg.name, branch: msg.branch })
    },
    activate: (msg) => {
      const target = WORKTREES.find((w) => w.id === msg.worktree)
      if (!target || !target.exists) {
        // 接回找不到树就说清楚，绝不悄悄 provision 第二棵
        toast('Worktree not found · nothing provisioned', 'x')
        return
      }
      if (state.activeWorktreeId === target.id) {
        state.rightTab = 'explorer'
        render()
        toast('Reattached · ' + target.branch, 'gitBranch')
        return
      }
      selectWorktree(target.id)
    },
    stop: stopRun,
    demo: (msg) => {
      const step = DEMO_STEPS[msg.step]
      if (step) step.run()
    },
    theme: (msg) => applyTheme(msg.theme)
  }

  window.addEventListener('message', (ev) => {
    const msg = ev.data
    if (!msg || msg.__bw !== 'v2') return
    const run = HOST_COMMANDS[msg.t]
    if (run) run(msg)
  })

  // ── Render ───────────────────────────────────────────────

  function render() {
    const snap = captureFocus()
    renderSidebar()
    renderTabs()
    renderCenterBody()
    renderActivityBar()
    if (state.rightTab === 'explorer') renderExplorer()
    else renderSourceControl()
    renderDialog()
    renderDemoRail()
    restoreFocus(snap)
    postHostState()
  }

  // ── Mutations ────────────────────────────────────────────

  function selectWorktree(id) {
    if (state.activeWorktreeId === id) return
    state.activeWorktreeId = id
    state.tabs = defaultTabs()
    state.activeTabId = 'terminal'
    resetTerminal(true)
    render()
    toast('Switched to ' + activeWorktree().branch, 'gitBranch')
  }

  function revealInExplorer(path) {
    state.rightTab = 'explorer'
    const parts = path.split('/')
    for (let i = 1; i < parts.length; i++) {
      state.expanded.add(parts.slice(0, i).join('/'))
    }
    state.flashPath = path
    render()
    const row = document.querySelector('[data-file="' + path + '"]')
    if (row) row.scrollIntoView({ block: 'nearest' })
    toast('Revealed ' + baseName(path) + ' in Explorer', 'folder')
    setTimeout(() => {
      state.flashPath = null
    }, 1400)
  }

  function dropTabsFor(paths) {
    state.tabs = state.tabs.filter((t) => isPinnedTab(t.kind) || paths.indexOf(t.path) === -1)
    if (!state.tabs.some((t) => t.id === state.activeTabId)) state.activeTabId = 'terminal'
  }

  function doCommit() {
    const staged = visibleFiles('staged')
    if (!staged.length || !state.commitMessage.trim()) return
    const add = staged.reduce((s, f) => s + f.add, 0)
    const del = staged.reduce((s, f) => s + f.del, 0)
    const sha = Math.random().toString(16).slice(2, 9)
    state.commits.unshift({
      sha,
      msg: state.commitMessage.trim().split('\n')[0],
      when: 'just now',
      add,
      del
    })
    const paths = staged.map((f) => f.path)
    state.files = state.files.filter((f) => f.section !== 'staged')
    dropTabsFor(paths)
    state.commitMessage = ''
    state.scSections.committed = true
    render()
    toast('Committed ' + paths.length + ' file(s) · ' + sha, 'gitCommit')
  }

  const ACTIONS = {
    'toggle-theme': toggleTheme,
    'toggle-repo': () => {
      state.repoCollapsed = !state.repoCollapsed
      render()
    },
    'create-under-repo': () => {
      openDialog()
    },
    'close-dialog': closeDialog,
    'toggle-advanced': () => {
      state.dialog.advancedOpen = !state.dialog.advancedOpen
      render()
    },
    'toggle-setup': () => {
      state.dialog.runSetup = !state.dialog.runSetup
      render()
    },
    'toggle-create-more': () => {
      state.dialog.createMore = !state.dialog.createMore
      render()
    },
    'submit-create': () => {
      const d = state.dialog
      const name = d.name.trim() || 'new workspace'
      const branch = d.branch
      state.dialog = null
      state.demoStep = 2
      render()
      startCreation(name.replace(/^#(\d+)\s+/, '#$1 · '), branch)
      renderDemoRail()
    },
    'cancel-creation': cancelCreation,
    'collapse-all': () => {
      state.expanded.clear()
      render()
      toast('Collapsed all folders', 'collapse')
    },
    'refresh-explorer': () => toast('Explorer refreshed', 'refresh'),
    'explorer-more': () => toast('More actions', 'more'),
    'explorer-new': () => toast('New file', 'plus'),
    'sc-refresh': () => toast('Source control refreshed', 'refresh'),
    'sc-more': () => toast('More actions', 'more'),
    'create-pr': () => toast('Create PR · bw/issue-74 → main', 'gitPr'),
    'swap-base': () => toast('Compare base: main', 'gitBranch'),
    'generate-message': () => {
      state.commitMessage = 'plan: read lane spacing from design tokens'
      render()
      toast('Generated commit message', 'sparkle')
    },
    'sc-filter-open': () => {
      state.scFilterOpen = true
      render()
      const el = document.querySelector('[data-focus-key="sc-filter"]')
      if (el) el.focus()
    },
    'sc-filter-close': () => {
      state.scFilterOpen = false
      state.scFilter = ''
      render()
    },
    'stage-all-changes': () => {
      const n = visibleFiles('changes').length
      visibleFiles('changes').forEach((f) => {
        f.section = 'staged'
      })
      render()
      toast('Staged ' + n + ' file(s)', 'plus')
    },
    'stage-all-untracked': () => {
      const n = visibleFiles('untracked').length
      visibleFiles('untracked').forEach((f) => {
        f.section = 'staged'
      })
      render()
      toast('Staged ' + n + ' untracked file(s)', 'plus')
    },
    'unstage-all': () => {
      const n = visibleFiles('staged').length
      visibleFiles('staged').forEach((f) => {
        f.section = f.status === 'U' ? 'untracked' : 'changes'
      })
      render()
      toast('Unstaged ' + n + ' file(s)', 'minus')
    },
    'discard-all': () => {
      const paths = visibleFiles('changes').map((f) => f.path)
      state.files = state.files.filter((f) => f.section !== 'changes')
      dropTabsFor(paths)
      render()
      toast('Discarded ' + paths.length + ' file(s)', 'discard')
    },
    'delete-untracked': () => {
      const paths = visibleFiles('untracked').map((f) => f.path)
      state.files = state.files.filter((f) => f.section !== 'untracked')
      dropTabsFor(paths)
      render()
      toast('Deleted ' + paths.length + ' untracked file(s)', 'trash')
    },
    'view-all': () => {
      const list = visibleFiles('changes')
      list.forEach((f) => {
        const id = 'diff:' + f.path
        if (!state.tabs.some((t) => t.id === id)) {
          state.tabs.push({ id, kind: 'diff', label: baseName(f.path), path: f.path })
        }
      })
      if (list.length) state.activeTabId = 'diff:' + list[0].path
      render()
    },
    commit: doCommit,
    noop: () => {}
  }

  // ── Event wiring ─────────────────────────────────────────

  document.addEventListener('click', (ev) => {
    const action = ev.target.closest('[data-action]')
    if (action && ACTIONS[action.dataset.action]) {
      ACTIONS[action.dataset.action]()
      return
    }

    const closeTab = ev.target.closest('[data-close-tab]')
    if (closeTab) {
      ev.stopPropagation()
      const id = closeTab.dataset.closeTab
      state.tabs = state.tabs.filter((x) => x.id !== id)
      if (state.activeTabId === id) state.activeTabId = state.tabs[state.tabs.length - 1].id
      render()
      return
    }

    const tab = ev.target.closest('[data-tab]')
    if (tab) {
      state.activeTabId = tab.dataset.tab
      render()
      return
    }

    const wt = ev.target.closest('[data-worktree]')
    if (wt) {
      selectWorktree(wt.dataset.worktree)
      return
    }

    if (ev.target.closest('#new-workspace-btn')) {
      openDialog()
      return
    }

    const rt = ev.target.closest('[data-right-tab]')
    if (rt) {
      state.rightTab = rt.dataset.rightTab
      render()
      return
    }

    const folder = ev.target.closest('[data-folder]')
    if (folder) {
      const p = folder.dataset.folder
      if (state.expanded.has(p)) state.expanded.delete(p)
      else state.expanded.add(p)
      render()
      return
    }

    const file = ev.target.closest('[data-file]')
    if (file) {
      openDiff(file.dataset.file, true)
      return
    }

    const view = ev.target.closest('[data-explorer-view]')
    if (view) {
      state.explorerView = view.dataset.explorerView
      render()
      return
    }

    const sec = ev.target.closest('[data-sc-section]')
    if (sec) {
      const k = sec.dataset.scSection
      state.scSections[k] = !state.scSections[k]
      render()
      return
    }

    const stage = ev.target.closest('[data-sc-stage]')
    if (stage) {
      ev.stopPropagation()
      const f = fileFor(stage.dataset.scStage)
      if (f) f.section = 'staged'
      render()
      toast('Staged ' + baseName(stage.dataset.scStage), 'plus')
      return
    }

    const unstage = ev.target.closest('[data-sc-unstage]')
    if (unstage) {
      ev.stopPropagation()
      const f = fileFor(unstage.dataset.scUnstage)
      if (f) f.section = f.status === 'U' ? 'untracked' : 'changes'
      render()
      toast('Unstaged ' + baseName(unstage.dataset.scUnstage), 'minus')
      return
    }

    const discard = ev.target.closest('[data-sc-discard]')
    if (discard) {
      ev.stopPropagation()
      const p = discard.dataset.scDiscard
      state.files = state.files.filter((f) => f.path !== p)
      dropTabsFor([p])
      render()
      toast('Discarded ' + baseName(p), 'discard')
      return
    }

    const reveal = ev.target.closest('[data-sc-reveal]')
    if (reveal) {
      ev.stopPropagation()
      revealInExplorer(reveal.dataset.scReveal)
      return
    }

    const scFile = ev.target.closest('[data-sc-file]')
    if (scFile) {
      openDiff(scFile.dataset.scFile, true)
      return
    }

    const demo = ev.target.closest('[data-demo]')
    if (demo) {
      const i = Number(demo.dataset.demo)
      state.demoStep = i
      DEMO_STEPS[i].run()
      renderDemoRail()
    }
  })

  document.addEventListener('input', (ev) => {
    const key = ev.target.dataset && ev.target.dataset.focusKey
    if (!key) return
    if (key === 'explorer-query') {
      state.explorerQuery = ev.target.value
      render()
    } else if (key === 'sc-filter') {
      state.scFilter = ev.target.value
      render()
    } else if (key === 'commit-message') {
      state.commitMessage = ev.target.value
      render()
    } else if (key === 'dlg-name' && state.dialog) {
      state.dialog.name = ev.target.value
    } else if (key === 'dlg-branch' && state.dialog) {
      state.dialog.branch = ev.target.value
    } else if (key === 'dlg-note' && state.dialog) {
      state.dialog.note = ev.target.value
    }
  })

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && state.dialog) {
      closeDialog()
      return
    }
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
      if (state.dialog) {
        ev.preventDefault()
        ACTIONS['submit-create']()
      } else if (visibleFiles('staged').length && state.commitMessage.trim()) {
        ev.preventDefault()
        doCommit()
      }
    }
  })

  // ── Boot ─────────────────────────────────────────────────

  function boot() {
    try {
      try {
        const q = new URLSearchParams(location.search).get('theme')
        const saved = localStorage.getItem(THEME_KEY)
        const theme =
          q === 'light' || q === 'dark'
            ? q
            : window.__ORCA_PROTO_THEME__ === 'light' || window.__ORCA_PROTO_THEME__ === 'dark'
              ? window.__ORCA_PROTO_THEME__
              : saved === 'light' || saved === 'dark'
                ? saved
                : 'dark'
        applyTheme(theme)
      } catch (_) {}
      if (EMBED) {
        // 壳里已经有一条演示条，面自己那条藏掉，别给人两套控制
        const rail = $('#demo-rail')
        if (rail) rail.style.display = 'none'
      }
      demoIdle()
      if (EMBED) {
        hostPost({ t: 'ready' })
        postHostState()
      }
    } catch (err) {
      console.error('[prototype] boot failed', err)
      const rail = $('#demo-rail')
      if (rail) {
        rail.textContent = 'Boot failed: ' + (err && err.message ? err.message : String(err))
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})()
