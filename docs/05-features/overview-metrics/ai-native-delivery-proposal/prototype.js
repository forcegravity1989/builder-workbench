;(() => {
  const $ = (s) => document.querySelector(s)
  const escape = (value) =>
    String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  const paths = {
    dashboard:
      '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h3M8 18h7"/>',
    check: '<path d="m9 11 3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    tasks: '<path d="m3 6 1 1 2-2M9 6h12M3 12h3M9 12h12M3 18h3M9 18h12"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    book: '<path d="M3 3h6a4 4 0 0 1 4 4v14a4 4 0 0 0-4-4H3zM13 7a4 4 0 0 1 4-4h4v14h-4a4 4 0 0 0-4 4"/>',
    branch:
      '<circle cx="6" cy="4" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="20" r="2"/><path d="M6 6v12M18 8a10 10 0 0 1-10 10H6"/>',
    folder:
      '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 4h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    settings:
      '<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="9" cy="5" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="19" r="2"/>',
    columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    chevrons: '<path d="m8 9 4-4 4 4m-8 6 4 4 4-4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M18 18a8 8 0 0 1-14-6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    terminal: '<path d="m4 5 6 6-6 6M12 19h8"/>',
    message: '<path d="M21 11a8 8 0 0 1-8 8H6l-4 3 1-7a9 9 0 1 1 18-4Z"/>',
    sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    edit: '<path d="m16 3 5 5L8 21H3v-5ZM14 5l5 5"/>',
    flag: '<path d="M4 22V3m0 1c6-4 10 4 16 0v11c-6 4-10-4-16 0"/>',
    review: '<path d="M3 4h18v14H9l-5 4v-4H3zM7 9h10M7 13h6"/>',
    git: '<circle cx="7" cy="5" r="2"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/><path d="M7 7v10m7-13 3 3-3 3m3-3v10"/>',
    package: '<path d="m3 7 9-5 9 5v10l-9 5-9-5ZM3 7l9 5 9-5M12 12v10M8 4l9 5"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h6"/>'
  }
  const icon = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`
  const hydrateIcons = () =>
    document.querySelectorAll('[data-icon]').forEach((el) => {
      el.innerHTML = icon(el.dataset.icon)
    })
  const btn = (label, action, style = 'secondary', attrs = '') =>
    `<button class="btn btn-${style}" data-action="${action}" ${attrs}>${label}</button>`
  const link = (label, action, attrs = '') =>
    `<button class="text-link" data-action="${action}" ${attrs}>${label}</button>`
  const tag = (label, tone = 'neutral') => `<span class="tag tag-${tone}">${label}</span>`
  const nav = [
    ['overview', '总览', 'dashboard'],
    ['plan', '计划', 'calendar'],
    ['acceptance', '验收', 'check'],
    ['tasks', '任务', 'tasks'],
    ['automations', '自动化', 'clock'],
    ['knowledge', '知识库', 'book']
  ]
  const baseGoals = [
    {
      id: 'G1',
      title: '运营无需协助，独立导入客户资料',
      target: '3 位试用者全部完成',
      metric: '独立完成试用'
    },
    {
      id: 'G2',
      title: '遇到数据错误，能自行修正并重试',
      target: '2 类错误均可自行处理',
      metric: '错误处理场景'
    }
  ]
  const init = (scenario = 'blocked') => ({
    scenario,
    view: 'overview',
    versions: { overview: 'v0.3', plan: 'v0.3', acceptance: 'v0.3' },
    grain: 'week',
    feature: 'main',
    goals: baseGoals.map((g) => ({ ...g })),
    decisions: {},
    next: {},
    deferred: false,
    changed: false,
    expanded: null,
    drafts: {},
    workspace: 'main',
    closedSessions: {},
    edited: false
  })
  let state = init()
  let toastTimer
  let returnFocus
  let decisionGoal
  const empty = () => state.scenario === 'empty'
  const repaired = () => state.scenario === 'repaired'
  const currentVersion = () => state.versions[state.view] || 'v0.3'
  const historical = () => currentVersion() === 'v0.2'
  const nextSummary = () =>
    Object.entries(state.next)
      .filter(([id]) => state.decisions[id] === '未达成')
      .map(([id, text]) => `${id}：${text}`)
      .join('；')
  const matched = () => !state.changed && !empty()
  const allDecided = () => state.goals.every((g) => state.decisions[g.id] === '达成')
  const reading = (id) =>
    !matched() ? 'Unknown' : id === 'G1' ? (repaired() ? '3 / 3' : '2 / 3') : '2 / 2'
  const sessionKey = () => (state.view === 'workspace' ? state.workspace : state.view)
  const canPass = (id) => matched() && (id === 'G2' || repaired())
  function toast(text) {
    clearTimeout(toastTimer)
    $('#toast').textContent = text
    $('#toast').hidden = false
    toastTimer = setTimeout(() => {
      $('#toast').hidden = true
    }, 3200)
  }
  function showModal(title, content, actions = btn('关闭', 'close')) {
    returnFocus = document.activeElement
    $('#modal-content').innerHTML =
      `<header class="modal-head"><h2 id="modal-title">${title}</h2>${btn(icon('close'), 'close', 'ghost btn-icon', 'aria-label="关闭对话框"')}</header><div class="modal-body">${content}</div><footer class="modal-footer">${actions}</footer>`
    $('#modal').showModal()
    $('#modal').querySelector('input,textarea,select,button').focus()
  }
  function closeModal() {
    $('#modal').close()
    if (returnFocus?.isConnected) {
      returnFocus.focus()
    }
  }
  function navigate(view) {
    state.view = view
    state.expanded = null
    render()
  }
  function spark(values) {
    if (empty()) {
      return '<span class="caption">尚无读数</span>'
    }
    const max = Math.max(...values) * 1.15
    const points = values.map((v, i) => `${i * 34 + 2},${60 - (v / max) * 52}`).join(' ')
    return `<svg class="spark" viewBox="0 0 176 64" aria-hidden="true"><polyline points="${points}"/></svg>`
  }
  function chart(
    values,
    { secondary = false, compact = false, currentOnly = false, unit = '' } = {}
  ) {
    if (empty()) {
      return '<div class="unknown-chart">Unknown · 尚无采集结果</div>'
    }
    const labels =
      state.grain === 'week'
        ? ['09.04', '09.11', '09.18', '09.25', '10.02', '10.09']
        : ['10.04', '10.05', '10.06', '10.07', '10.08', '10.09']
    const width = 440,
      height = compact ? 72 : 130,
      x0 = compact ? 8 : 28,
      floor = height - 22,
      max = Math.max(...values) * 1.18
    const points = values.map((v, i) => [
      x0 + (i * (width - x0 - 10)) / (values.length - 1),
      floor - (v / max) * (floor - 10)
    ])
    return `<svg class="trend ${secondary ? 'secondary' : ''}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${currentOnly ? '仅有当前开放 Issue 快照，不补历史曲线' : labels.map((l, i) => `${l} ${values[i]}${unit}`).join('，')}">
      ${!compact ? [0, 0.5, 1].map((n) => `<path class="grid-line" d="M${x0} ${10 + n * (floor - 10)}H${width}"/><text x="0" y="${14 + n * (floor - 10)}">${Math.round(max * (1 - n))}</text>`).join('') : `<path class="grid-line" d="M${x0} ${floor}H${width}"/>`}
      ${!currentOnly ? `<polyline class="series" points="${points.map((p) => p.join(',')).join(' ')}"/>` : ''}
      ${points
        .filter((_, i) => !currentOnly || i === points.length - 1)
        .map(
          (p, i) =>
            `<circle class="point" cx="${p[0]}" cy="${p[1]}" r="${compact ? 2 : 3}"><title>${currentOnly ? '当前 4' : values[i]}${unit}</title></circle>`
        )
        .join('')}
      ${labels.map((l, i) => `<text x="${points[i][0]}" y="${height - 3}" text-anchor="${i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}">${l}</text>`).join('')}
    </svg>`
  }
  function overview() {
    const week = state.grain === 'week'
    const chartData =
      state.feature === 'main'
        ? week
          ? [
              [12, 17, 21, 22, 28, 36],
              [52, 60, 57, 65, 72, 78]
            ]
          : [
              [3, 7, 5, 6, 8, 7],
              [60, 70, 75, 72, 80, 78]
            ]
        : week
          ? [
              [52, 60, 57, 65, 72, 78],
              [43, 38, 36, 29, 22, 18]
            ]
          : [
              [60, 70, 75, 72, 80, 78],
              [30, 28, 20, 24, 20, 18]
            ]
    const chartNames =
      state.feature === 'main'
        ? ['成功导入次数', '首次导入成功率']
        : ['首次导入成功率', '需要协助的任务占比']
    const planCopy = historical() ? '客户表可以上传、预览并导入' : state.goals[0].title
    const status = historical()
      ? tag('已归档')
      : allDecided()
        ? tag('人已核对', 'success')
        : empty() || state.changed
          ? tag('待补证据')
          : repaired()
            ? tag('待核对', 'accent')
            : tag('1 项需处理', 'warning')
    return `<header class="page-bar"><h1>总览</h1><span class="spacer"></span><span class="caption">${empty() ? '尚未采集' : '示例快照 · 10.09 16:20'}</span>${btn(icon('refresh'), 'refresh', 'ghost btn-icon', 'aria-label="刷新示例读数"')}</header>
      <div class="page-scroll"><div class="overview">
      <div class="project-top">
        <section class="card project-card"><div class="card-head"><h2>客户资料导入</h2>${tag('内测', 'outline')}</div><p>让运营自己把客户资料导入 CRM。</p><div class="line-meta"><span class="avatar avatar-sm">林</span><span>林舟 · 陈南</span><span>／</span><span>内部运营工具</span><span class="spacer"></span>${link('项目名片', 'project-detail')}</div></section>
        <section class="card north-card"><div class="north-label"><span>每周独立完成导入的运营人数</span>${link(icon('info'), 'metric', 'data-metric="north" aria-label="北极星指标口径"')}</div><div class="north-reading"><div><div class="large-number">${empty() ? '—' : '12'}<small>人</small></div><span class="caption">${empty() ? 'Unknown' : '10.03–10.09'} · 10 月方向 20 人</span></div>${spark([4, 5, 5, 8, 10, 12])}</div></section>
      </div>
      <div class="section-head"><h2>版本进展</h2>${versionSelect()}<span class="spacer"></span>${status}</div>
      <section class="version-summary"><article><div class="summary-top"><span>计划</span>${link('查看纪要', 'minutes', 'data-kind="plan"')}</div><h3>${empty() ? '本次目标尚待明确' : escape(planCopy)}</h3><div class="summary-foot"><span>${empty() ? '尚无计划' : historical() ? '09.25 已归档' : '2 个目标 · 10.05–10.09'}</span><span class="spacer"></span>${link(historical() ? '进入当前计划 →' : '打开计划 →', 'plan')}</div></article>
      <article><div class="summary-top"><span>验收</span>${link('查看纪要', 'minutes', 'data-kind="acceptance"')}</div><h3>${historical() ? '基础导入已交给运营试用' : empty() || state.changed ? '还没有对应的使用证据' : allDecided() ? '本次目标已由林舟核对达成' : repaired() ? '3 位试用者完成导入，等待核对' : '2 / 3 独立完成，字段映射仍卡住 1 人'}</h3><div class="summary-foot"><span>${historical() ? '09.26 已归档' : state.decisions.G1 === '未达成' ? '已记录下一步' : '本次试用 · 小样本'}</span><span class="spacer"></span>${link(historical() ? '进入当前验收 →' : '查看验收 →', 'acceptance')}</div></article></section>
      <section><div class="section-head"><h2>业务指标</h2><div class="tabs" role="tablist" aria-label="业务指标范围">${[
        ['main', '主要'],
        ['import', '导入体验']
      ]
        .map(
          ([key, label]) =>
            `<button class="tab" role="tab" aria-selected="${state.feature === key}" data-action="feature" data-feature="${key}">${label}</button>`
        )
        .join(
          ''
        )}</div><span class="spacer"></span>${grainControl()}${btn('配置指标', 'configure-metrics', 'secondary')}</div>
      <div class="business-grid">${chartNames.map((name, i) => `<article class="chart-panel"><div class="chart-title">${link(name, 'metric', `data-metric="${i === 0 && state.feature === 'main' ? 'imports' : i === 1 && state.feature === 'import' ? 'assistance' : 'success'}"`)}<strong>${empty() ? '—' : chartData[i].at(-1)}<small>${i === 0 && state.feature === 'main' ? '次' : '%'}</small></strong></div>${chart(chartData[i], { secondary: i === 1, unit: i === 0 && state.feature === 'main' ? '次' : '%' })}</article>`).join('')}</div></section>
      <section><div class="section-head"><h2>项目指标</h2><span class="caption">${week ? '本周' : '今日'} · 研发活动</span><span class="spacer"></span><span class="caption">不代表用户价值</span></div><div class="repo-stats">${[
        ['提交', week ? [16, 21, 13, 24, 26, 18] : [3, 4, 2, 4, 2, 3]],
        ['合入 PR', week ? [3, 5, 4, 7, 9, 6] : [1, 2, 0, 1, 1, 1]],
        ['开放 Issue', [0, 0, 0, 0, 0, 4]]
      ]
        .map(
          ([name, values], i) =>
            `<article><div class="chart-title"><span class="muted">${name}</span><strong>${empty() ? '—' : values.at(-1)}</strong></div>${chart(values, { compact: true, currentOnly: i === 2 })}</article>`
        )
        .join('')}</div></section>
      </div></div>`
  }
  function versionSelect() {
    return `<select class="input" data-control="version" aria-label="查看版本"><option value="v0.3" ${historical() ? '' : 'selected'}>v0.3</option><option value="v0.2" ${historical() ? 'selected' : ''}>v0.2 · 已归档</option></select>`
  }
  function grainControl() {
    return `<div class="seg" aria-label="指标粒度">${[
      ['week', '周'],
      ['day', '日']
    ]
      .map(
        ([key, label]) =>
          `<label class="seg-opt"><input type="radio" name="metric-grain" value="${key}" ${state.grain === key ? 'checked' : ''}/>${label}</label>`
      )
      .join('')}</div>`
  }
  function nativePane() {
    const plan = state.view === 'plan',
      acceptance = state.view === 'acceptance'
    const branch = plan ? 'bw/week-plan' : acceptance ? 'bw/week-acceptance' : state.workspace
    const metricsWorkspace = branch === 'bw/metrics-refresh'
    const mainWorkspace = branch === 'main'
    const title = plan
      ? '制定 v0.3 计划'
      : acceptance
        ? '核对 v0.3 交付'
        : metricsWorkspace
          ? '配置项目指标'
          : mainWorkspace
            ? '项目会话'
            : '修复字段映射提示'
    const prompt = plan
      ? '这版先让运营能独立导入。自动标签要不要一起做？'
      : acceptance
        ? '按计划核对这次试用，重点看有没有真正独立完成。'
        : metricsWorkspace
          ? '核对项目指标的定义与历史采集。'
          : mainWorkspace
            ? '先了解这个项目和当前版本。'
            : '检查字段映射里的手机号提示。'
    const reply = plan
      ? '建议这版只解决导入和修错。自动标签不影响这次试用，可以先留在范围外。'
      : acceptance
        ? repaired()
          ? 'rc.2 复测中，3 位运营均独立完成了任务。首次失败记录仍保留，右侧等你核对。'
          : '导入和修错检查通过。首次试用中，运营 C 卡在手机号映射，需要 Builder 协助；G1 还未达到原目标。'
        : metricsWorkspace
          ? '先明确去重口径、统计窗口和项目数据源。现有读数可回溯时，再补充或调整采集脚本。'
          : mainWorkspace
            ? '这是客户资料导入工具。当前版本聚焦运营独立导入与自行修错。'
            : '已定位到映射别名提示。准备补充「手机号码」与「手机号」的对应说明。'
    const key = sessionKey()
    return `<section class="native-workspace" aria-label="Orca 原生会话界面示意"><div class="native-top">${btn(`${icon('plus')} 新建会话`, 'native-new', 'ghost')}<span class="native-model">Claude Code</span>${btn(icon('columns'), 'native-info', 'ghost btn-icon', 'data-name="分屏与标签" aria-label="原生分屏"')}</div><div class="native-tabs"><span>${icon('terminal')} ${title}</span><span class="spacer"></span>${btn(icon('folder'), 'native-files', 'ghost btn-icon', 'aria-label="原生资源管理器示意"')}</div>
    <div class="terminal-body"><div class="terminal-brand">${icon('sparkles')}<div><strong>Claude Code</strong><small>customer-import · ${branch}</small></div></div>${empty() || state.closedSessions[sessionKey()] ? '<div class="empty-area"><p>等待会话开始</p><span class="caption">示意区域 · 未连接 Agent</span></div>' : `<div class="terminal-record"><p class="terminal-user">❯ ${prompt}</p><div class="terminal-check">${icon('file')} <strong>Read</strong> 项目计划与验收材料</div><div class="terminal-check">${icon('tasks')} <strong>Read</strong> 本次试用与关联任务</div><div class="terminal-reply"><p>${reply}</p><p class="muted">${plan ? '两个目标已整理到右侧，先确定范围，再拆到现有任务。' : acceptance ? '证据已关联到对应目标。达成与下一步由你决定。' : '这条会话继续负责代码、检查与评审。'}</p></div></div>`}<div class="terminal-path">会话历史示例 · 非实时执行结果</div></div>
    <div class="composer"><textarea id="native-draft" aria-label="原生会话未发送草稿" placeholder="继续这条会话…（原型不发送）">${escape(state.drafts[key] || '')}</textarea><div class="composer-meta"><span>未发送草稿 · 示例</span>${btn(icon('close'), 'clear-draft', 'ghost btn-icon', 'aria-label="清空草稿"')}</div></div><div class="native-status">${icon('branch')} ${branch}<span class="spacer"></span><span>Orca 原生工作区 · 示意</span></div></section>`
  }
  function journey() {
    const items =
      state.view === 'plan'
        ? [
            ['prepare', '准备', 'file'],
            ['goals', '目标', 'flag'],
            ['goals', '评审', 'review'],
            ['tasks', '拆解', 'tasks'],
            ['archive', '归档', 'git']
          ]
        : [
            ['prepare', '准备交付', 'package'],
            ['goals', '展示验收', 'check'],
            ['archive', '归档', 'git']
          ]
    return `<nav class="journey" aria-label="${state.view === 'plan' ? '计划' : '验收'}流程">${items.map(([id, name, shape], i) => `<button data-action="scroll" data-target="${id}" class="${i === 1 ? 'current' : ''}"><span>${icon(shape)}</span>${name}</button>`).join('')}</nav>`
  }
  function planGoals() {
    return `<div class="goal-list">${state.goals.map((g) => `<article class="goal-row"><span class="goal-id">${g.id}</span><div class="goal-copy"><h3>${escape(g.title)}</h3><p>${escape(g.target)}</p></div>${btn(icon('edit'), 'edit-goal', 'ghost btn-icon', `data-id="${g.id}" aria-label="编辑${g.id}目标"`)}${state.expanded === g.id ? `<form class="goal-detail" data-goal-form="${g.id}"><label class="caption" for="goal-title">目标</label><input class="input" id="goal-title" maxlength="80" value="${escape(g.title)}" required/><label class="caption" for="goal-target">怎样算完成</label><div class="edit-line"><input class="input" id="goal-target" maxlength="80" value="${escape(g.target)}" required/>${btn('保存', 'save-goal', 'secondary', `data-id="${g.id}"`)}${btn('取消', 'cancel-goal', 'ghost')}</div></form>` : ''}</article>`).join('')}</div>`
  }
  function acceptanceGoals() {
    return `<div class="goal-list">${state.goals
      .map((g) => {
        const d = state.decisions[g.id]
        return `<article class="goal-row"><span class="goal-id">${g.id}</span><div class="goal-copy"><h3>${escape(g.title)}</h3><p>${escape(g.target)}</p><div class="row-actions"><span class="outcome-reading">${reading(g.id)}</span><span class="caption">${g.metric}</span>${link('证据', 'evidence', `data-id="${g.id}"`)}<span class="spacer"></span>${btn(d ? '修改结论' : '核对', 'decide', 'secondary', `data-id="${g.id}"`)}</div>${d === '未达成' ? `<p class="summary-note">下一步：${escape(state.next[g.id] || '')}</p>` : ''}</div><span class="result-label ${d === '达成' ? 'complete' : d === '未达成' ? 'failed' : ''}">${d || '待核对'}</span></article>`
      })
      .join('')}</div>`
  }
  function taskTable() {
    const rows = [
      ['42', '补清手机号映射提示', repaired() ? '待评审' : '进行中', 'G1'],
      ['38', '上传与预览客户表', '已完成', 'G1'],
      ['39', '错误行定位与重试', '已完成', 'G2']
    ]
    return `<table class="table"><thead><tr><th>任务</th><th>状态</th><th>目标</th></tr></thead><tbody>${rows.map(([id, title, status, goal]) => `<tr><td>${link(`#${id} ${title}`, 'task-detail', `data-id="${id}"`)}</td><td>${status}</td><td class="mono">${goal}</td></tr>`).join('')}</tbody></table>`
  }
  function archive() {
    return `<section class="archive-row" id="archive"><div><strong>归档${state.view === 'plan' ? '计划' : '验收'}</strong><span class="caption">${state.view === 'plan' ? '核对目标与任务后，在会话中准备 PR。' : '保存本次判断与下一步，在会话中准备 PR。'}</span></div>${btn(`${icon('git')} 归档`, 'archive', 'secondary')}</section>`
  }
  function workflow() {
    const plan = state.view === 'plan'
    return `<div class="workflow">${nativePane()}<div class="splitter" role="separator" tabindex="0" aria-label="调整会话与业务板宽度" aria-orientation="vertical" aria-valuemin="25" aria-valuemax="60" aria-valuenow="38"></div><section class="material-pane" aria-label="${plan ? '计划' : '验收'}业务板"><header class="page-bar"><h1>版本${plan ? '计划' : '验收'}</h1>${versionSelect()}<span class="caption">${historical() ? '已归档' : state.edited ? '示例已保存' : '草稿'}</span><span class="branch-label">bw/week-${plan ? 'plan' : 'acceptance'}</span>${btn(icon('clock'), 'native-info', 'ghost btn-icon', `data-name="${plan ? '计划' : '验收'}自动化" aria-label="配置自动化"`)}</header><div class="material-scroll">
    ${
      historical()
        ? `<div class="section-head"><h2>v0.2 · ${plan ? '计划' : '验收'}纪要</h2>${tag('只读', 'outline')}</div><h3>把客户表导入 CRM</h3><p class="muted">上传、预览和基础导入已交付；下一版解决复杂表格的映射与修错。</p><dl class="detail-facts"><dt>周期</dt><dd>09.21–09.25</dd><dt>判断</dt><dd>林舟确认基础导入目标达成</dd><dt>归档</dt><dd>09.26 · 示例 PR #31</dd></dl>${btn('返回 v0.3', 'current-version', 'secondary')}`
        : `${journey()}<section class="collaborate" id="prepare"><p>与 Agent 一起${plan ? '制定版本计划' : '核对版本交付'}</p>${btn(`${icon('message')} 新建${plan ? '计划' : '验收'}`, 'start-workflow', 'secondary')}</section>
    ${plan ? `<section class="brief-row"><div><label>进展</label><p>${empty() ? '等待读取上版验收' : '基础导入已上线，运营开始试用。'}</p>${link('上版验收', 'previous')}</div><div><label>本次要解决</label><p>手机号映射不明确，运营仍需找开发。</p></div></section>` : `<div class="line-meta"><span>${empty() ? '候选待确认' : `候选 ${repaired() ? 'rc.2' : 'rc.1'}`}</span><span>·</span><span>${state.changed ? '计划已变，需重新核对' : empty() ? '尚无材料' : repaired() ? '复测结果已更新' : '首次试用结果'}</span><span class="spacer"></span>${link('查看材料', 'evidence', 'data-id="G1"')}</div>`}
    <div class="section-head" id="goals"><h2>${plan ? '本版目标' : '逐目标核对'}</h2><span class="caption">${empty() ? '尚未明确' : '2 项'}</span><span class="spacer"></span>${link('预览纪要', 'minutes', `data-kind="${state.view}"`)}</div>
    ${empty() ? `<div class="empty-area"><h3>${plan ? '先和 Agent 明确本次目标' : '还没有可核对的版本材料'}</h3><p>${plan ? '沿用现有版本，或在会话中决定新建。' : '在左侧准备交付，右侧再核对实际结果。'}</p><span class="caption">Unknown · 原型不创建真实计划或证据</span></div>` : plan ? planGoals() : acceptanceGoals()}
    ${plan && !empty() ? `<div class="outside-scope">${icon('clock')} <span>范围外：自动标签</span><span class="spacer"></span>${state.deferred ? tag('已决定延期', 'outline') : link('留到以后', 'defer')}</div>` : !plan && !empty() ? `<p class="summary-note">${state.changed ? '旧读数保留在证据里，不用于验证新目标。' : repaired() ? '同一组人复测；首次 2 / 3 记录仍保留。' : '检查通过 ≠ 用户独立完成。差异在对应目标里核对。'}</p>` : ''}
    <details class="task-disclosure" id="tasks"><summary><strong>版本任务</strong><span class="caption">${empty() ? '尚未关联' : '3 项 · 2 项已完成'}</span></summary>${empty() ? '<p class="caption">没有任务记录。</p>' : taskTable()}</details>${archive()}`
    }
    </div></section></div>`
  }
  function render() {
    $('#navigation').innerHTML = nav
      .map(
        ([id, title, shape]) =>
          `<button class="sidebar-item" data-action="${id}" ${state.view === id ? 'aria-current="page"' : ''}>${icon(shape)}<span>${title}</span></button>`
      )
      .join('')
    document.querySelectorAll('.worktree').forEach((el) => {
      const active =
        (el.dataset.action === state.view && ['plan', 'acceptance'].includes(state.view)) ||
        (state.view === 'workspace' && el.dataset.workspace === state.workspace)
      if (active) {
        el.setAttribute('aria-current', 'page')
      } else {
        el.removeAttribute('aria-current')
      }
    })
    $('#main').innerHTML =
      state.view === 'overview'
        ? overview()
        : ['plan', 'acceptance'].includes(state.view)
          ? workflow()
          : state.view === 'tasks'
            ? `<header class="page-bar"><h1>任务</h1><span class="caption">customer-import</span><span class="spacer"></span>${tag('Orca 原生入口', 'outline')}</header><div class="page-scroll"><div class="section-head"><h2>v0.3</h2><span class="caption">${empty() ? '尚无任务' : '3 项关联任务'}</span></div>${empty() ? '<p class="muted">尚未关联任务。</p>' : taskTable()}</div>`
            : `<div class="workflow">${nativePane()}</div>`
    if (state.view === 'workspace') {
      $('.native-workspace').style.flexBasis = '100%'
    }
    hydrateIcons()
    setupResize()
  }
  function metricDetails(kind) {
    const definitions = {
      north: [
        '每周独立完成导入的运营人数',
        '12 人',
        '按所示 7 天窗口去重，完成至少一次导入且该次无 Builder 帮助。',
        '10.03–10.09'
      ],
      imports: [
        '成功导入次数',
        state.grain === 'week' ? '36 次' : '7 次',
        '导入批次最终成功计一次，重复重试不重复计数。',
        state.grain === 'week' ? '10.03–10.09' : '10.09'
      ],
      success: [
        '首次导入成功率',
        '78%',
        '首次提交即完成导入的批次 / 首次提交批次；与版本三人试用分开。',
        state.grain === 'week' ? '10.03–10.09' : '10.09'
      ],
      assistance: [
        '需要协助的任务占比',
        '18%',
        '有 Builder 帮助记录的导入任务 / 所有导入任务。',
        state.grain === 'week' ? '10.03–10.09' : '10.09'
      ]
    }
    const [name, value, definition, window] = definitions[kind]
    showModal(
      name,
      `<div class="large-number">${empty() ? 'Unknown' : value}</div><p class="muted">${window} · 项目使用读数（虚构示例）</p><p>${definition}</p><details><summary>数据来源与复算</summary><dl class="detail-facts"><dt>来源</dt><dd>示例导入事件 + 协助记录</dd><dt>配置</dt><dd>.bw/metrics.toml · 示例修订 a31f09d</dd><dt>采集</dt><dd>按日 / 周回溯脚本（未实际执行）</dd><dt>边界</dt><dd>这些趋势是预置示例，不能与三人试用拼为因果收益。</dd></dl></details>`,
      `${btn('关闭', 'close', 'ghost')}${btn('在会话中配置', 'configure-metrics', 'secondary')}`
    )
  }
  function evidence(id) {
    const g = state.goals.find((goal) => goal.id === id)
    const value = reading(id)
    const body = empty()
      ? '<p>Unknown · 尚无对应版本的采集结果。</p>'
      : `<div class="large-number">${value}</div><p class="muted">${escape(g.metric)} · ${repaired() ? 'rc.2 / 16:00–16:20' : 'rc.1 / 15:10–15:40'}</p>${state.changed ? '<p>当前目标已变。下列是原计划的历史记录，不能用于确认新目标。</p>' : ''}<table class="table"><thead><tr><th>${id === 'G1' ? '试用者' : '场景'}</th><th>观察结果</th></tr></thead><tbody>${id === 'G1' ? `<tr><td>运营 A</td><td>独立完成</td></tr><tr><td>运营 B</td><td>独立完成</td></tr><tr><td>运营 C</td><td>${repaired() ? '独立完成' : '映射处中断，需要帮助'}</td></tr>` : '<tr><td>重复客户</td><td>找到并修正错误</td></tr><tr><td>缺失必填项</td><td>补齐后重试成功</td></tr>'}</tbody></table><details><summary>来源、运行与分发记录</summary><dl class="detail-facts"><dt>来源</dt><dd>试用观察表 task-import-009（示例）</dd><dt>运行</dt><dd>12 条路径检查通过</dd><dt>分发</dt><dd>3 位运营收到同一候选入口</dd><dt>边界</dt><dd>同一小样本的观察，不证明持续使用或商业价值。</dd></dl></details>${repaired() ? '<details><summary>首次试用 · rc.1 · 2 / 3</summary><p>15:10–15:40，运营 C 在手机号映射处中断。复测不能覆盖这次失败；同组人再次使用存在熟悉效应。</p></details>' : ''}`
    showModal(`${id} · ${escape(g.title)}`, body)
  }
  function minutes(kind) {
    const plan = kind === 'plan'
    const text = historical()
      ? 'v0.2：上传、预览、基础导入。09.26 林舟确认达成并归档。'
      : empty()
        ? '尚无版本材料。'
        : state.goals
            .map(
              (g) =>
                `${g.id} ${g.title}\n${plan ? g.target : `${g.target}；实测 ${reading(g.id)}；${state.decisions[g.id] || '待人核对'}`}`
            )
            .join('\n\n') + (!plan && nextSummary() ? `\n\n下一步：${nextSummary()}` : '')
    showModal(
      `${currentVersion()} · ${plan ? '计划' : '验收'}纪要`,
      `<p class="caption">从当前示例材料派生 · 只读</p><pre>${escape(text)}</pre>`
    )
  }
  function decide(id) {
    decisionGoal = id
    const goal = state.goals.find((g) => g.id === id)
    showModal(
      `核对 ${id}`,
      `<p><strong>${escape(goal.title)}</strong></p><p class="muted">约定：${escape(goal.target)} · 实测：${reading(id)}</p><form id="decision-form"><div class="field"><label for="decision">你的结论</label><select id="decision" class="input"><option value="待核对">待核对</option><option value="达成" ${canPass(id) ? '' : 'disabled'}>达成</option><option value="未达成">未达成</option></select></div><div class="field" id="next-field" hidden><label for="next-step">缺口与下一步</label><textarea id="next-step" class="input" rows="3" maxlength="220">${escape(state.next[id] || (id === 'G1' ? '补清手机号映射提示，再请这 3 位运营复测。' : '复核两类错误的操作路径，补齐观察记录。'))}</textarea></div><div class="form-error" id="decision-error"></div></form>`,
      `${btn('取消', 'close', 'ghost')}${btn('记录结论', 'save-decision', 'primary')}`
    )
    $('#decision').value = state.decisions[id] || '待核对'
    $('#next-field').hidden = $('#decision').value !== '未达成'
  }
  function prepareDraft(text) {
    if ($('#modal').open) {
      closeModal()
    }
    if (!['plan', 'acceptance', 'workspace'].includes(state.view)) {
      state.view = 'workspace'
      state.workspace = 'bw/metrics-refresh'
    }
    state.closedSessions[sessionKey()] = false
    state.drafts[sessionKey()] = text
    render()
    $('#native-draft').focus()
    toast('已放入示例会话输入区，未发送。')
  }
  function setupResize() {
    const splitter = $('.splitter')
    if (!splitter) {
      return
    }
    const set = (value) => {
      const n = Math.min(60, Math.max(25, value))
      document.documentElement.style.setProperty('--native-pane-width', `${n}%`)
      splitter.setAttribute('aria-valuenow', Math.round(n))
    }
    splitter.addEventListener('keydown', (event) => {
      if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault()
        const current =
          ($('.native-workspace').getBoundingClientRect().width /
            $('.workflow').getBoundingClientRect().width) *
          100
        set(current + (event.key === 'ArrowRight' ? 5 : -5))
      }
    })
    splitter.addEventListener('pointerdown', (event) => {
      splitter.setPointerCapture(event.pointerId)
      event.preventDefault()
    })
    splitter.addEventListener('pointermove', (event) => {
      if (splitter.hasPointerCapture(event.pointerId)) {
        const box = $('.workflow').getBoundingClientRect()
        set(((event.clientX - box.left) / box.width) * 100)
      }
    })
    splitter.addEventListener('pointerup', (event) => {
      if (splitter.hasPointerCapture(event.pointerId)) {
        splitter.releasePointerCapture(event.pointerId)
      }
    })
    splitter.addEventListener('dblclick', () => set(38))
  }
  document.addEventListener('input', (event) => {
    if (event.target.id === 'native-draft') {
      state.drafts[sessionKey()] = event.target.value
    }
  })
  document.addEventListener('change', (event) => {
    if (event.target.id === 'scenario') {
      state = init(event.target.value)
      render()
    }
    if (event.target.dataset.control === 'version') {
      state.versions[state.view] = event.target.value
      render()
    }
    if (event.target.name === 'metric-grain') {
      state.grain = event.target.value
      render()
    }
    if (event.target.id === 'decision') {
      $('#next-field').hidden = event.target.value !== '未达成'
    }
  })
  document.addEventListener('submit', (event) => event.preventDefault())
  document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-action]')
    if (!el || el.disabled) {
      return
    }
    const action = el.dataset.action
    if (['overview', 'plan', 'acceptance', 'tasks'].includes(action)) {
      return navigate(action)
    }
    if (action === 'close') {
      return closeModal()
    }
    if (action === 'reset') {
      state = init($('#scenario').value)
      render()
      return
    }
    if (action === 'theme') {
      const html = document.documentElement
      html.dataset.theme = html.dataset.theme === 'claude' ? 'apple' : 'claude'
      return
    }
    if (action === 'feature') {
      state.feature = el.dataset.feature
      render()
      return
    }
    if (action === 'refresh') {
      return toast('示例读数未联网更新。真实采集沿用现有总览。')
    }
    if (action === 'metric') {
      return metricDetails(el.dataset.metric)
    }
    if (action === 'evidence') {
      return evidence(el.dataset.id)
    }
    if (action === 'minutes') {
      return minutes(el.dataset.kind)
    }
    if (action === 'decide') {
      return decide(el.dataset.id)
    }
    if (action === 'save-decision') {
      const value = $('#decision').value
      if (value === '达成' && !canPass(decisionGoal)) {
        return
      }
      if (value === '未达成' && !$('#next-step').value.trim()) {
        $('#decision-error').textContent = '请留下缺口与下一步。'
        return
      }
      state.decisions[decisionGoal] = value
      if (value === '未达成') {
        state.next[decisionGoal] = $('#next-step').value.trim()
      } else {
        delete state.next[decisionGoal]
      }
      state.edited = true
      closeModal()
      render()
      toast('已记录你的示例结论，未归档或发布。')
      return
    }
    if (action === 'edit-goal') {
      state.expanded = el.dataset.id
      render()
      $('#goal-title').focus()
      return
    }
    if (action === 'cancel-goal') {
      state.expanded = null
      render()
      return
    }
    if (action === 'save-goal') {
      const form = document.querySelector('[data-goal-form]')
      if (!form.reportValidity()) {
        return
      }
      const goal = state.goals.find((g) => g.id === el.dataset.id)
      const title = $('#goal-title').value.trim(),
        target = $('#goal-target').value.trim()
      if (!title || !target) {
        return toast('请填写目标与完成判据。')
      }
      if (title !== goal.title || target !== goal.target) {
        goal.title = title
        goal.target = target
        state.changed = true
        state.decisions = {}
        state.next = {}
        state.edited = true
      }
      state.expanded = null
      render()
      return
    }
    if (action === 'defer') {
      state.deferred = true
      render()
      return
    }
    if (action === 'scroll') {
      document
        .getElementById(el.dataset.target)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      return
    }
    if (action === 'archive') {
      return prepareDraft(
        `请核对 ${currentVersion()} 的${state.view === 'plan' ? '计划目标与关联任务' : '验收结论与下一步'}，准备归档 PR 供人评审。不要自动合入或发布。${nextSummary() ? `\n下一步：${nextSummary()}` : ''}`
      )
    }
    if (action === 'start-workflow') {
      return prepareDraft(
        `请协助${state.view === 'plan' ? '制定' : '核对'} ${currentVersion()} ${state.view === 'plan' ? '版本计划' : '版本交付'}，先读取现有材料，再一起确认范围。`
      )
    }
    if (action === 'configure-metrics') {
      state.view = 'workspace'
      state.workspace = 'bw/metrics-refresh'
      return prepareDraft(
        '请核对独立导入人数、导入成功率的定义和历史采集脚本。沿用项目现有数据源，试采后准备 PR。'
      )
    }
    if (action === 'workspace') {
      state.workspace = el.dataset.workspace
      return navigate('workspace')
    }
    if (action === 'current-version') {
      state.versions[state.view] = 'v0.3'
      render()
      return
    }
    if (action === 'native-new') {
      state.closedSessions[sessionKey()] = true
      state.drafts[sessionKey()] = ''
      render()
      toast('示意新会话，未启动真实 Agent。')
      return
    }
    if (action === 'clear-draft') {
      state.drafts[sessionKey()] = ''
      $('#native-draft').value = ''
      return
    }
    if (action === 'previous') {
      return showModal(
        'v0.2 · 上版验收',
        '<p>基础导入已交付给运营试用。</p><p class="muted">接下来需要解决复杂表格的映射和出错后的重试。</p><dl class="detail-facts"><dt>确认者</dt><dd>林舟 · 09.26（示例）</dd><dt>来源</dt><dd>v0.2 固定验收记录 · PR #31（示例）</dd></dl>'
      )
    }
    if (action === 'project-detail') {
      return showModal(
        '项目名片',
        '<dl class="detail-facts"><dt>项目</dt><dd>客户资料导入</dd><dt>想做什么</dt><dd>让运营自己把客户资料导入 CRM。</dd><dt>目标方向</dt><dd>让更多运营不依赖开发完成导入。</dd><dt>10 月方向</dt><dd>每周独立完成导入的运营人数达到 20 人。</dd><dt>仓库</dt><dd>customer-import · CodeHub（示例）</dd><dt>负责人</dt><dd>林舟、陈南</dd></dl>'
      )
    }
    if (action === 'task-detail') {
      return showModal(
        `任务 #${el.dataset.id}`,
        `<p>${el.dataset.id === '42' ? '补清手机号映射提示' : el.dataset.id === '38' ? '上传与预览客户表' : '错误行定位与重试'}</p><p class="muted">此处保留 Orca 原生任务详情入口。原型仅展示关联关系，不创建或修改远端 Issue。</p>`,
        `${btn('关闭', 'close', 'ghost')}${btn('查看工作树', 'task-workspace', 'secondary')}`
      )
    }
    if (action === 'task-workspace') {
      closeModal()
      state.workspace = 'fix/mapping-hint'
      return navigate('workspace')
    }
    if (action === 'native-files') {
      return showModal(
        '资源管理器 · 原生界面示意',
        '<pre>customer-import/\n├─ src/\n│  └─ import/\n├─ tests/\n└─ .bw/\n   ├─ metrics.toml\n   └─ planning/v0.3/</pre><p class="caption">资源管理器、文件编辑、分屏与历史由 Orca 提供，本次不重做。</p>'
      )
    }
    if (action === 'projects') {
      return showModal(
        '项目与工作树',
        '<p>客户资料导入</p><p class="muted">当前项目与原生工作树列表保持在左侧。原型只演示这个项目，不接入或切换真实仓库。</p>'
      )
    }
    if (action === 'native-info' || ['automations', 'knowledge'].includes(action)) {
      return showModal(
        el.dataset.name || (action === 'automations' ? '自动化' : '知识库'),
        '<p>保留当前 Orca-BW 入口。</p><p class="muted">这部分不在本次视觉调整范围内。原型没有连接宿主，不改设置、不启动任务。</p>'
      )
    }
    if (action === 'design') {
      return showModal(
        '这版只调整已有页面',
        '<p>保留 Orca-BW 的导航、项目工作树和原生会话。计划与验收仍在右业务板，指标仍在总览。</p><p>总览先看项目、用户结果和版本进展；纪要默认摘要，点开看全文。计划与验收默认只呈现目标、结果及操作，口径、材料和任务按需展开。</p><details><summary>来源与边界</summary><p>样式直接打包 docs/04-design-system/styles.css，复用 btn、tag、sidebar、tabs、table 等组件。壳结构对照 WorkbenchSidebarNav、sidebar/index、AppWorkspaceShell 与 CycleWorkspaceShell。</p><p>所有项目、读数、会话与材料均为虚构示例；没有联网、持久化、真实 Agent、Git 或远端写入。底部场景切换和配色仅用于评审。摘要呈现为待确认提案，不替换现行规格。</p></details>'
      )
    }
  })
  $('#modal').addEventListener('cancel', (event) => {
    event.preventDefault()
    closeModal()
  })
  $('#modal').addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') {
      return
    }
    const items = [
      ...$('#modal').querySelectorAll('button:not(:disabled),input,textarea,select,summary')
    ].filter((el) => el.getClientRects().length)
    const first = items[0],
      last = items.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  })
  render()
})()
