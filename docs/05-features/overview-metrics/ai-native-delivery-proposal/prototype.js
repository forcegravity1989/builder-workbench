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
  const baseline = [
    {
      id: 'G1',
      title: 'Orca-BW 重构版上线',
      target: '计划、验收、总览、指标及任务验证',
      outcome: '达成',
      reason: '原验收：参见验证报告'
    },
    {
      id: 'G2',
      title: '补齐 PR 与上线流程缺失部分',
      target: '运维全景差距矩阵',
      outcome: '达成',
      reason: '原验收：运维全景勾勾表差距矩阵'
    },
    {
      id: 'G3',
      title: '优化计划特性，建立使用看护指标',
      target: '使用该特性的项目数：原目标 6',
      outcome: '未达成',
      reason: '原验收未填写原因与下一步'
    }
  ]
  const baseGoals = [
    {
      id: 'G1',
      title: '让试点 Builder 交出一个有用户反馈的版本',
      target: '2 个内部项目各完成一轮；留存可用入口与实际用户反馈',
      metric: '有使用反馈的交付'
    },
    {
      id: 'G2',
      title: '找到并修好完整交付中的首个阻塞',
      target: '同组 2 个项目复测主路径通过；失败与恢复记录可核对',
      metric: '无需代操作完成主路径'
    }
  ]
  const init = (scenario = 'baseline') => ({
    scenario,
    view: 'overview',
    versions: {
      overview: scenario === 'baseline' ? 'v0.5' : 'next',
      plan: 'next',
      acceptance: scenario === 'baseline' ? 'v0.5' : 'next'
    },
    goals: baseGoals.map((g) => ({ ...g })),
    decisions: {},
    next: {},
    drafts: {},
    workspace: 'main',
    closedSessions: {},
    expanded: null,
    changed: false,
    confirmed: false,
    deferred: false,
    carried: false
  })
  let state = init(),
    toastTimer,
    returnFocus,
    decisionGoal
  const snapshot = '5202485e0773eef8c2c19da540d59bbd07bd45bc'
  const sourceLink = (path, label) =>
    `<a href="https://github.com/forcegravity1989/builder-workbench/blob/${snapshot}/${path}" target="_blank" rel="noopener">${label}</a>`
  const currentVersion = () => state.versions[state.view] || 'next'
  const historical = () => currentVersion() === 'v0.5'
  const repaired = () => state.scenario === 'repaired'
  const observed = () => state.scenario !== 'baseline' && !state.changed
  const sessionKey = () => (state.view === 'workspace' ? state.workspace : state.view)
  const nextSummary = () =>
    Object.entries(state.next)
      .filter(([id]) => state.decisions[id] === '未达成')
      .map(([id, n]) => `${id}：${n}`)
      .join('；')
  const reading = () => (!observed() ? 'Unknown' : repaired() ? '2 / 2' : '1 / 2')
  const canPass = (id) => observed() && repaired() && state.goals.some((g) => g.id === id)
  const allDecided = () => state.goals.every((g) => state.decisions[g.id] === '达成')
  const pendingNext = () => state.goals.some((g) => state.decisions[g.id] === '未达成')
  const versionSelect = () =>
    `<select class="input" data-control="version" aria-label="查看版本"><option value="v0.5" ${historical() ? 'selected' : ''}>v0.5 · 已有材料</option><option value="next" ${historical() ? '' : 'selected'}>下次迭代 · 提案</option></select>`
  const scopeContext = () =>
    `服务方向：先验证 BW 是否帮助真实交付，而非继续铺开能力。阶段检查点（提案）：10/30 回看，至少 2 个试点连续两周交付有反馈的版本，且整理负担不高于首周基线。周观察窗口（提案）：10/12–10/16；版本号、参与者和负责人尚待落实。`
  const planText = () =>
    `${scopeContext()}\n来源：v0.5 G3 未达，原因与下一步空缺；读数 0 只表示已归档计划活动，不能当零用户。\n${state.goals.map((g) => `${g.id} ${g.title}\n判据：${g.target}`).join('\n\n')}\n范围外：${state.deferred ? '团队绩效排行本轮暂缓' : '团队绩效排行仅为 Agent 候选，尚未纳入'}。`
  function overview() {
    const live = historical()
    const result = live
      ? '已交付，但使用价值仍待验证'
      : !observed()
        ? '下一步已明确，结果仍待观察'
        : repaired()
          ? '首轮复测通过，持续价值仍待观察'
          : '主路径卡住了 1 个试点，先处理阻塞'
    const gaps = live
      ? state.confirmed
        ? '原型中已明确下一轮范围；实际安排仍待落实'
        : state.carried
          ? 'G3 已带入计划提案，范围待人确认'
          : 'G3 未达，尚无原因与后续安排'
      : pendingNext()
        ? nextSummary()
        : allDecided()
          ? '本周目标已核对；下周还要观察能否复用'
          : state.confirmed
            ? '下周先跑完整交付，再决定修什么'
            : '先用 2 个内部项目查清完整交付卡在哪里'
    return `<header class="page-bar"><h1>总览</h1><span class="spacer"></span><span class="caption">${live ? '仓内快照 · 10.08' : `下次迭代提案${state.scenario !== 'baseline' ? ' · 演示数据' : ''}`}</span>${link('来源与边界', 'sources')}</header><div class="page-scroll"><div class="overview">
    <section class="direction-head"><div><div class="card-head"><h2>Builders’ Workbench</h2>${tag('v0.5 已内部发布', 'outline')}</div><p>让 Builder 每周交出有人使用的版本，并据反馈决定下一步。</p><span class="caption">待验证的价值主张 · 北极星尚未定义</span></div>${link('项目与阶段目标', 'milestone')}</section>
    <section class="milestone-line" aria-label="阶段与本周的关系"><div><span class="caption">已有起点</span><strong>v0.5 交给内部用户</strong><small>发布背景由用户提供</small></div><span class="rail-arrow">→</span><button data-action="plan-context"><span class="caption">10.16 周检 · 提案</span><strong>跑通第一轮真实交付</strong><small>找首个阻塞，收敛下次改动</small></button><span class="rail-arrow">→</span><button data-action="milestone"><span class="caption">10.30 阶段回看 · 提案</span><strong>能否连续两周复用</strong><small>有反馈的交付 + 人的负担</small></button></section>
    <div class="section-head"><h2>${live ? '当前进展' : '本次观察'}</h2>${versionSelect()}<span class="spacer"></span>${tag(live ? '采用待核对' : observed() && !repaired() ? '发现阻塞' : '价值待验证', live || (observed() && !repaired()) ? 'warning' : 'outline')}</div>
    <h3 class="progress-sentence">${result}</h3>
    <section class="signal-grid">
    <button data-action="${live ? 'baseline-details' : 'evidence'}" data-id="G1"><span>交付</span><strong>${live ? '已内部发布' : reading('G1')}</strong><small>${live ? 'G1、G2 原验收已确认' : '有用户反馈的可用版本 · 项目'}</small></button>
    <button data-action="${live ? 'activity' : 'evidence'}" data-id="G2"><span>${live ? '采用线索' : '主路径'}</span><strong>${live ? '0' : reading('G2')}<em>${live ? ' 个项目' : ''}</em></strong><small>${live ? '已归档计划活动 · 非用户数' : '无需代操作完成 · 项目'}</small></button>
    <button data-action="value-evidence"><span>持续价值</span><strong>Unknown</strong><small>${live ? '尚无“更好交付”的观察' : '第二周复用、负担与方向尚待观察'}</small></button></section>
    <div class="week-change"><span class="caption">${live ? '本周可确认' : '相对首次观察'}</span><p>${live ? 'G1 / G2 已确认；G3 未达。缺少可比的上周使用记录。' : !observed() ? '尚未开始观察，不预填增长曲线。' : repaired() ? '示例：1 / 2 → 2 / 2；同组复测，不能推定持续受益。' : '示例：A 已交付并获得反馈，B 在会话续接处受阻。'}</p>${link(live ? '原验收' : '观察明细', live ? 'baseline-details' : 'weekly-evidence')}</div>
    <section class="decision-callout"><div class="decision-copy"><span class="caption">${live ? '现在需要决定' : '本周需要决定'}</span><h3>${escape(gaps)}</h3><p>${live ? '先查清真实使用中的断点，再判断是修 BUG、减步骤还是补能力。' : state.confirmed ? '范围已在原型中确认；尚未生成真实任务或发出请求。' : '日期、对象、负责人和判据仍需人确认；不自动变成项目承诺。'}</p></div>${btn(live ? (state.carried || state.confirmed ? '查看后续提案' : '把缺口带入计划') : pendingNext() ? '带回计划讨论' : state.confirmed ? '查看本周范围' : '审阅本周范围', live ? (state.carried || state.confirmed ? 'plan-context' : 'carry-gap') : pendingNext() ? 'carry-result' : 'plan-context', 'primary')}</section>
    <div class="section-head"><h2>每周看这三件事</h2><span class="caption">证据不足就是未知；没有总体“无风险”灯</span><span class="spacer"></span>${link('查看观察约定', 'weekly-evidence')}</div>
    <div class="watch-row"><div><span class="watch-dot warning"></span><strong>方向</strong><span>用户问题是否得到改善</span><em>待验证</em></div><div><span class="watch-dot ${observed() && !repaired() ? 'warning' : ''}"></span><strong>交付</strong><span>${observed() && !repaired() ? '1 个试点受阻' : '可用结果是否真的交到用户'}</span><em>${live ? '待观察' : observed() ? (repaired() ? '复测通过' : '需处理') : '待观察'}</em></div><div><span class="watch-dot"></span><strong>负担</strong><span>阻断、等待与人工整理时间</span><em>缺基线</em></div></div>
    <details class="task-disclosure"><summary><strong>版本记录与指标</strong><span class="caption">保留原始目标、读数口径与来源</span></summary><div class="summary-links">${link('计划纪要', 'minutes', 'data-kind="plan"')}${link('验收纪要', 'minutes', 'data-kind="acceptance"')}${link('已有采用指标', 'activity')}${link('在原生会话中配置指标', 'configure-metrics')}</div><p class="caption">项目研发活动图仍属现有总览；本稿未重新采集，不用提交和 PR 数推导价值。</p></details>
    </div></div>`
  }
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
  function nativePane() {
    const plan = state.view === 'plan',
      acceptance = state.view === 'acceptance',
      metrics = state.workspace === 'bw/metrics-refresh'
    const branch = plan ? 'bw/week-plan' : acceptance ? 'bw/week-acceptance' : state.workspace
    const title = plan
      ? '从 v0.5 复盘到下一次交付'
      : acceptance
        ? '核对承诺与真实使用'
        : metrics
          ? '配置项目指标'
          : '项目会话'
    const prompt = plan
      ? 'v0.5 已发给内部用户。先搞清楚 BW 是否帮助完整交付，不要继续铺功能。'
      : acceptance
        ? '按原承诺核对：哪些是已交付，哪些只是做完代码，哪些仍缺使用证据？'
        : metrics
          ? '已有计划活动指标不等于价值。先核对来源和口径，再决定补哪些观察。'
          : '围绕当前目标开展任务，新增建议先留候选。'
    const reply = plan
      ? 'G3 未达，原记录没有下一步。右侧先草拟一次小范围自用观察；参加项目、负责人和完成判据请你确认。'
      : acceptance
        ? 'v0.5 的 G1、G2 原确认保持不动。G3 的 0 只反映已归档计划活动，不能解释成没有用户。'
        : metrics
          ? '北极星尚未定义，不能用归档量代替用户受益。手工试点观察先作为验收材料，不伪装成可回溯脚本指标。'
          : '当前优先理解真实使用断点。代码、任务与运行能力继续由 Orca 承接。'
    return `<section class="native-workspace" aria-label="Orca 原生会话界面示意"><div class="native-top">${btn(`${icon('plus')} 新建会话`, 'native-new', 'ghost')}<span class="native-model">Claude Code</span>${btn(icon('columns'), 'native-info', 'ghost btn-icon', 'data-name="原生分屏" aria-label="原生分屏"')}</div><div class="native-tabs"><span>${icon('terminal')} ${title}</span><span class="spacer"></span>${btn(icon('folder'), 'native-files', 'ghost btn-icon', 'aria-label="原生资源管理器"')}</div><div class="terminal-body"><div class="terminal-brand">${icon('sparkles')}<div><strong>Claude Code</strong><small>builder-workbench · ${branch}</small></div></div>${state.closedSessions[sessionKey()] ? '<div class="empty-area">等待会话开始</div>' : `<div class="terminal-record"><p class="terminal-user">❯ ${prompt}</p><div class="terminal-check">${icon('file')} <strong>Read</strong> v0.5 计划、验收与指标定义</div><div class="terminal-reply"><p>${reply}</p><p class="muted">${state.confirmed ? '已在原型中确认范围，实际执行仍未开始。' : '方向和范围由人决定，建议尚未生效。'}</p></div></div>`}<div class="terminal-path">会话内容为设计示意 · 非真实执行结果</div></div><div class="composer"><textarea id="native-draft" aria-label="原生会话未发送草稿" placeholder="继续这条会话…（原型不发送）">${escape(state.drafts[sessionKey()] || '')}</textarea><div class="composer-meta"><span>未发送草稿 · 示例</span>${btn(icon('close'), 'clear-draft', 'ghost btn-icon', 'aria-label="清空草稿"')}</div></div><div class="native-status">${icon('branch')} ${branch}<span class="spacer"></span><span>Orca 原生工作区 · 示意</span></div></section>`
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
    return `<nav class="journey" aria-label="版本流程">${items.map(([id, label, shape], i) => `<button data-action="scroll" data-target="${id}" class="${i === 1 ? 'current' : ''}"><span>${icon(shape)}</span>${label}</button>`).join('')}</nav>`
  }
  function planGoals() {
    return `<div class="goal-list">${state.goals.map((g) => `<article class="goal-row"><span class="goal-id">${g.id}</span><div class="goal-copy"><h3>${escape(g.title)}</h3><p>${escape(g.target)}</p></div>${btn(icon('edit'), 'edit-goal', 'ghost btn-icon', `data-id="${g.id}" aria-label="编辑${g.id}目标"`)}${state.expanded === g.id ? `<form class="goal-detail" data-goal-form="${g.id}"><label for="goal-title">本周想得到的结果</label><input class="input" id="goal-title" maxlength="90" required value="${escape(g.title)}"/><label for="goal-target">怎么核对</label><div class="edit-line"><input class="input" id="goal-target" maxlength="150" required value="${escape(g.target)}"/>${btn('保存', 'save-goal', 'secondary', `data-id="${g.id}"`)}${btn('取消', 'cancel-goal', 'ghost')}</div></form>` : ''}</article>`).join('')}</div>`
  }
  function acceptanceGoals() {
    return `<div class="goal-list">${state.goals.map((g) => `<article class="goal-row"><span class="goal-id">${g.id}</span><div class="goal-copy"><h3>${escape(g.title)}</h3><p>${escape(g.target)}</p><div class="row-actions"><strong class="outcome-reading">${reading(g.id)}</strong><span class="caption">${g.metric}</span>${link('证据', 'evidence', `data-id="${g.id}"`)}<span class="spacer"></span>${btn(state.decisions[g.id] ? '修改结论' : '核对', 'decide', 'secondary', `data-id="${g.id}"`)}</div>${state.decisions[g.id] === '未达成' ? `<p class="summary-note">下一步：${escape(state.next[g.id] || '')}</p>` : ''}</div><span class="result-label">${state.decisions[g.id] || '待核对'}</span></article>`).join('')}</div>`
  }
  function baselinePanel() {
    return `<div class="section-head"><h2>v0.5 · 原目标与人的判断</h2>${tag('仓内快照', 'outline')}</div><p class="caption">摘要保留原义；原文和口径点开查看。10.08 快照，不代表实时状态。</p><div class="goal-list">${baseline.map((g) => `<article class="goal-row"><span class="goal-id">${g.id}</span><div class="goal-copy"><h3>${g.title}</h3><p>${g.target}</p><div class="row-actions"><span>${g.reason}</span>${link('原始材料', 'baseline-details', `data-id="${g.id}"`)}</div></div><span class="result-label ${g.outcome === '未达成' ? 'failed' : ''}">${g.outcome}</span></article>`).join('')}</div><section class="handoff-row"><div><strong>${state.carried || state.confirmed ? 'G3 已接到下一轮提案（仅原型）' : 'G3 的下一步仍是空白'}</strong><p>原验收记录保持不动；后续提案需要人确认和实际落实。</p></div>${btn('把缺口带入计划', 'carry-gap', 'primary')}</section>`
  }
  function taskTable() {
    return `<div class="candidate-tasks"><p class="caption">以下是拆解候选，未创建 Issue。</p><table class="table"><thead><tr><th>候选工作</th><th>服务目标</th><th>安排</th></tr></thead><tbody><tr><td>邀请 2 个真实项目跑完整一轮</td><td>G1</td><td>负责人待定</td></tr><tr><td>定位首个断点，决定最小修复</td><td>G2</td><td>见到证据后</td></tr><tr><td>记录人工协助、耗时与使用反馈</td><td>G1 / G2</td><td>与试用同步</td></tr></tbody></table></div>`
  }
  function workflow() {
    const plan = state.view === 'plan'
    return `<div class="workflow">${nativePane()}<div class="splitter" role="separator" tabindex="0" aria-label="调整会话与业务板宽度" aria-orientation="vertical" aria-valuemin="25" aria-valuemax="60" aria-valuenow="38"></div><section class="material-pane" aria-label="${plan ? '计划' : '验收'}业务板"><header class="page-bar"><h1>版本${plan ? '计划' : '验收'}</h1>${versionSelect()}<span class="branch-label">bw/week-${plan ? 'plan' : 'acceptance'}</span>${btn(icon('clock'), 'native-info', 'ghost btn-icon', 'data-name="原生自动化" aria-label="配置自动化"')}</header><div class="material-scroll">${
      historical()
        ? baselinePanel()
        : `${journey()}<section class="collaborate" id="prepare"><p>${state.confirmed ? '范围已在原型中确认' : '从 v0.5 G3 的未达与空白下一步开始'}</p>${btn(`${icon('message')} ${plan ? '新建计划' : '新建验收'}`, 'start-workflow', 'secondary')}</section><div class="context-strip"><span>阶段方向 · 提案</span><strong>从“发出去”走到“持续帮助真实交付”</strong>${link('10.30 怎样判断', 'milestone')}</div><div class="line-meta"><span>周观察 10.12–10.16 · 提案</span><span class="spacer"></span>${link('上版缺口', 'baseline-details')}</div><div class="section-head" id="goals"><h2>${plan ? '本次先做什么' : '对照原承诺'}</h2>${tag(plan ? (state.confirmed ? '原型内已确认' : '待人确认') : state.scenario === 'baseline' ? '尚无实测' : '演示观察', 'outline')}<span class="spacer"></span>${link('预览纪要', 'minutes', `data-kind="${state.view}"`)}</div>${plan ? planGoals() : acceptanceGoals()}
    ${plan ? `<div class="outside-scope">${icon('clock')}<span>Agent 建议：团队绩效排行</span><span class="spacer"></span>${state.deferred ? tag('本轮暂缓', 'outline') : link('本轮不做', 'defer')}</div><div class="plan-confirm"><span class="caption">参与项目、负责人待落实；仅确认这个原型的范围。</span>${btn(state.confirmed ? '查看已确认范围' : '确认本轮范围', 'confirm-scope', state.confirmed ? 'secondary' : 'primary')}</div>` : `<p class="summary-note">${state.changed ? '目标已改，旧观察不能验证新范围。' : !observed() ? 'Unknown · 尚未开展下一轮观察。' : repaired() ? '复测 2/2 仍只是一轮；持续复用与整理负担尚待观察。' : '1 个项目在续接处卡住，不能用代码完成替代交付。'}</p><div class="plan-confirm"><span class="caption">结果与下一步会回到同一总览。</span>${btn('回总览看需要决定什么', 'next-overview', 'secondary')}</div>`}
    <details class="task-disclosure" id="tasks"><summary><strong>任务拆解候选</strong><span class="caption">确认范围后再安排</span></summary>${taskTable()}</details><section class="archive-row" id="archive"><div><strong>归档${plan ? '计划' : '验收'}</strong><span class="caption">在原生会话中准备 PR；原型只填入未发送草稿。</span></div>${btn(`${icon('git')} 归档`, 'archive', 'secondary')}</section>`
    }</div></section></div>`
  }
  function render() {
    $('#navigation').innerHTML = nav
      .map(
        ([id, label, shape]) =>
          `<button class="sidebar-item" data-action="${id}" ${state.view === id ? 'aria-current="page"' : ''}>${icon(shape)}<span>${label}</span></button>`
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
            ? `<header class="page-bar"><h1>任务</h1><span class="caption">Orca 原生入口 · 示意</span></header><div class="page-scroll">${taskTable()}${link('回计划明确范围', 'plan-context')}</div>`
            : `<div class="workflow">${nativePane()}</div>`
    if (state.view === 'workspace') {
      $('.native-workspace').style.flexBasis = '100%'
    }
    hydrateIcons()
    setupResize()
  }
  function sources() {
    showModal(
      '事实、提案与演示分别看',
      `<dl class="detail-facts"><dt>用户背景</dt><dd>v0.5 已交给内部用户使用；不由仓库标签反推。</dd><dt>仓内快照</dt><dd>main 5202485e0，材料更新至 10.08。${sourceLink('.bw/planning/v0.5/data.json', '原计划')} · ${sourceLink('.bw/planning/v0.5/acceptance.json', '原验收')} · ${sourceLink('.bw/metrics.toml', '指标定义')}</dd><dt>已知事实</dt><dd>G1 / G2 人确认达成；G3 人确认未达，原因和下一步为空。已有读数 0 只衡量特定窗口内的已合入计划活动。</dd><dt>未知</dt><dd>活跃用户、真实交付收益、阻断频率、整理负担、北极星。本原型未采集这些事实。</dd><dt>设计提案</dt><dd>10.16 周检、10.30 阶段检查点、2 个试点及候选目标都是讨论建议，尚未成为真实项目承诺。</dd><dt>演示数据</dt><dd>底部可切换“受阻/复测”假设，项目 A / B 和所有试点结果均虚构。刷新清空原型内决定。</dd></dl>`
    )
  }
  function baselineDetails() {
    showModal(
      'v0.5 · 交付和价值是两个问题',
      `<div class="fact-summary"><strong>已有交付：G1 / G2 原确认达成</strong><p>保留原验收判断，不因这次价值质询改写历史。</p><strong>待处理：G3 未达，原因与下一步空缺</strong><p>原目标是优化计划特性并观察使用。需要先问清实际使用路径与取数覆盖，再决定修什么。</p></div><dl class="detail-facts"><dt>G3 原目标</dt><dd>使用该特性的项目数 6（原计划指标修订）。</dd><dt>G3 实测</dt><dd>0；10.05 00:00–10.08 11:03，Asia/Shanghai；是不完整周的已合入计划活动，非用户人数或点击量。</dd><dt>口径提醒</dt><dd>计划与验收引用的指标 definitionHash 不同，需核对可比性；本稿不计算 0/6 达成率。未达是已保存的人的判断。</dd><dt>为什么要跟进</dt><dd>未知的采用情况不能被“已上线”遮住。原因尚未查清，不预设一定缺功能。</dd></dl><div class="summary-links">${sourceLink('.bw/planning/v0.5/data.json', '查看原计划')}${sourceLink('.bw/planning/v0.5/acceptance.json', '查看原验收')}</div>`,
      `${btn('关闭', 'close', 'ghost')}${btn('把缺口带入计划', 'carry-gap', 'primary')}`
    )
  }
  function milestone() {
    showModal(
      '阶段目标 · 先提出可被推翻的假设',
      `<h3>BW 是否让少人团队更稳定地交付有用版本？</h3><p>建议 10.30 回看：至少 2 个内部试点连续两周交付带真实使用反馈的版本，人工整理负担不高于各自首周基线。</p><p class="caption">人数、日期、窗口、负责人均待确认；不是现行里程碑制度，也不保证商业价值。</p><table class="table"><thead><tr><th>看到什么</th><th>应该讨论什么</th></tr></thead><tbody><tr><td>有交付、有反馈，能持续复用</td><td>继续小范围试点，核对代价</td></tr><tr><td>代码完成，但用户没用上</td><td>找分发或使用断点，别继续扩功能</td></tr><tr><td>流程变多、人工整理更重</td><td>减步骤；必要时删减 BW 能力</td></tr><tr><td>仍缺观察或可比基线</td><td>保持未知，先补证据</td></tr></tbody></table><p>每周只检查当前版本离这个问题更近了没有。观察窗口附在版本上下文，不另建一套周计划或里程碑数据库。</p>`,
      `${btn('关闭', 'close', 'ghost')}${btn('看本周如何验证', 'plan-context', 'primary')}`
    )
  }
  function activity() {
    showModal(
      '采用线索：0 不等于零用户',
      `<div class="large-number">0 <small>个项目</small></div><p>窗口：2026.10.05–10.08 · 不完整周</p><p>指标“使用周一屏的被管理项目数”统计白名单项目已合入计划的实质变更。未归档草稿、页面点击和没有入白名单的使用不在这个数内。</p><p class="caption">不能据此断言无人使用 BW，也不能推导交付收益。当前没有可比历史序列，不补曲线。</p><details><summary>定义与修订</summary><p>v0.5 验收保留的定义哈希为 72c3950b…，原计划为 1055d880…；它们与最新目录是不同证据。需要核对定义差异及覆盖。</p>${sourceLink('.bw/planning/v0.5/acceptance.json', '验收保留读数')} · ${sourceLink('.bw/metrics.toml', '当前基线目录')}</details>`,
      `${btn('关闭', 'close', 'ghost')}${btn('核对采集口径', 'configure-metrics', 'secondary')}`
    )
  }
  function weeklyEvidence() {
    showModal(
      '每周观察：结果、阻断与人的负担',
      `<table class="table"><thead><tr><th>观察</th><th>保留的材料</th><th>何时干预</th></tr></thead><tbody><tr><td>有用的交付</td><td>版本入口、实际用户任务与反馈</td><td>代码已好，仍无人用或问题未改善</td></tr><tr><td>交付阻断</td><td>首个失败环节、等待时间、负责人</td><td>卡住的工作威胁本周约定；马上处理，不等周五</td></tr><tr><td>人的负担</td><td>协助/补录分钟、重复搬运、首次基线</td><td>比基线更重，优先减步骤</td></tr></tbody></table><p>按同一窗口和同一项目看变化，失败与放弃也保留。两项目只是探索，不做收益率或行业因果结论。</p><p class="caption">建议尽量读取已有文件、Issue、发布记录与反馈。最初的人工观察属于验收材料；未有历史脚本前，不注册为可采集指标。整理本身的成本也要记录。</p><div class="summary-links">${link('看本次试点证据', 'evidence', 'data-id="G1"')}${link('看上版原始缺口', 'baseline-details')}</div>`
    )
  }
  function evidence(id) {
    const g = state.goals.find((g) => g.id === id)
    const valid = observed()
    showModal(
      `${id} · ${escape(g.title)}`,
      `<div class="large-number">${reading(id)}</div><p class="caption">${valid ? '下次迭代的假设演示 · 10.12–10.16' : 'Unknown · 没有与当前目标匹配的观察'}</p>${valid ? `<table class="table"><thead><tr><th>试点</th><th>可用成果 / 反馈</th><th>BW 主路径</th></tr></thead><tbody><tr><td>项目 A（虚构）</td><td>版本交到使用方；反馈：可完成约定任务</td><td>独立完成</td></tr><tr><td>项目 B（虚构）</td><td>${repaired() ? '复测版本交到使用方；反馈：阻塞已解除' : '尚未交到用户'}</td><td>${repaired() ? '复测独立完成' : '会话续接中断，需协助'}</td></tr></tbody></table><p class="caption">演示只说明当前一轮结果；演示记录仅表示已有入口与用户反馈，整理分钟、首周基线及第二周复用仍未观测。</p>${repaired() ? '<details><summary>保留首次失败：1 / 2</summary><p>首次项目 B 会话续接受阻；同组复测有熟悉效应，不能抹去等待和协助。</p></details>' : ''}` : `<p>${state.changed ? '目标实质改变，旧演示观察不再用于新判据。' : '还没有下一次试点记录。可以在原生会话里安排观察，但不能自动判定达成。'}</p>`}<details><summary>与原始问题的关系</summary><p>源自 v0.5 G3 未达且没有下一步。这里只提出新的候选范围，没有把原 G3 目标 6 改成 2。</p></details>`
    )
  }
  function minutes(kind) {
    const plan = kind === 'plan'
    const text = historical()
      ? baseline
          .map((g) => `${g.id} ${g.title}\n${g.target}\n原判断：${g.outcome}；${g.reason}`)
          .join('\n\n')
      : plan
        ? planText()
        : `${scopeContext()}\n${state.goals.map((g) => `${g.id} ${g.title}\n${g.target}\n实测 ${reading(g.id)}；${state.decisions[g.id] || '待人核对'}`).join('\n\n')}\n下一步：${nextSummary() || '待讨论'}\n持续价值：Unknown；下一周复用和整理负担还需观察。`
    showModal(
      `${historical() ? 'v0.5' : '下次迭代提案'} · ${plan ? '计划' : '验收'}纪要`,
      `<p class="caption">${historical() ? '原材料摘要 · 只读' : '原型状态派生 · 未写入真实项目'}</p><pre>${escape(text)}</pre>`
    )
  }
  function decide(id) {
    decisionGoal = id
    const g = state.goals.find((g) => g.id === id)
    showModal(
      `核对 ${id}`,
      `<p><strong>${escape(g.title)}</strong></p><p class="muted">判据：${escape(g.target)} · 实测：${reading(id)}</p><form id="decision-form"><label for="decision">你的结论（仅原型）</label><select class="input" id="decision"><option>待核对</option><option ${canPass(id) ? '' : 'disabled'}>达成</option><option>未达成</option></select><div id="next-field" hidden><label for="next-step">缺口与下一步</label><textarea class="input" id="next-step" rows="3" maxlength="240">${escape(state.next[id] || '定位项目 B 的续接阻塞，再请同组 Builder 复测；本轮先不新增能力。')}</textarea></div><p id="decision-error" class="form-error"></p></form>`,
      `${btn('取消', 'close', 'ghost')}${btn('记录原型结论', 'save-decision', 'primary')}`
    )
    $('#decision').value = state.decisions[id] || '待核对'
    $('#next-field').hidden = $('#decision').value !== '未达成'
  }
  function prepareDraft(text) {
    if ($('#modal').open) {
      closeModal()
    }
    state.closedSessions[sessionKey()] = false
    const previous = state.drafts[sessionKey()] || ''
    state.drafts[sessionKey()] =
      previous && !previous.includes(text)
        ? `${previous}\n\n——本次补充（仍未发送）——\n${text}`
        : previous || text
    render()
    $('#native-draft').focus()
    toast(previous ? '已保留原草稿并补充上下文，未发送。' : '已带入原生会话示意，未发送。')
  }
  function toPlan(carry = false) {
    if ($('#modal').open) {
      closeModal()
    }
    state.versions.plan = 'next'
    state.carried = state.carried || carry
    state.view = 'plan'
    if (!carry) {
      render()
      return
    }
    prepareDraft(
      `${planText()}${nextSummary() ? `\n本次已有观察的下一步：${nextSummary()}` : ''}\n请先与人确定对象、负责人和边界，不自动新增功能、创建任务或宣布完成。`
    )
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
  document.addEventListener('input', (e) => {
    if (e.target.id === 'native-draft') {
      state.drafts[sessionKey()] = e.target.value
    }
  })
  document.addEventListener('change', (e) => {
    if (e.target.id === 'scenario') {
      state = init(e.target.value)
      render()
    }
    if (e.target.dataset.control === 'version') {
      state.versions[state.view] = e.target.value
      render()
    }
    if (e.target.id === 'decision') {
      $('#next-field').hidden = e.target.value !== '未达成'
    }
  })
  document.addEventListener('submit', (e) => e.preventDefault())
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
      document.documentElement.dataset.theme =
        document.documentElement.dataset.theme === 'claude' ? 'apple' : 'claude'
      return
    }
    if (action === 'sources') {
      return sources()
    }
    if (action === 'baseline-details') {
      return baselineDetails()
    }
    if (action === 'milestone') {
      return milestone()
    }
    if (action === 'activity') {
      return activity()
    }
    if (action === 'weekly-evidence') {
      return weeklyEvidence()
    }
    if (action === 'value-evidence') {
      return showModal(
        '持续价值仍是 Unknown',
        '<p>v0.5 内部发布是交付事实；复测跑通是一轮观察。要判断是否值得继续投入，还缺连续复用、真实问题改善与人工整理负担的证据。</p><p>不把通过验收、关闭 Issue、代码数量或一次演示换算为“项目无风险”。</p>',
        `${btn('关闭', 'close', 'ghost')}${btn('查看阶段判据', 'milestone', 'secondary')}`
      )
    }
    if (action === 'evidence') {
      return evidence(el.dataset.id)
    }
    if (action === 'minutes') {
      return minutes(el.dataset.kind)
    }
    if (action === 'carry-gap' || action === 'carry-result') {
      return toPlan(true)
    }
    if (action === 'plan-context') {
      return toPlan()
    }
    if (action === 'next-overview') {
      state.versions.overview = 'next'
      return navigate('overview')
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
        $('#decision-error').textContent = '请留下具体缺口与下一步。'
        return
      }
      state.decisions[decisionGoal] = value
      if (value === '未达成') {
        state.next[decisionGoal] = $('#next-step').value.trim()
      } else {
        delete state.next[decisionGoal]
      }
      closeModal()
      render()
      toast('记录仅存在于原型；没有归档或发布。')
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
      if (!$('[data-goal-form]').reportValidity()) {
        return
      }
      const title = $('#goal-title').value.trim(),
        target = $('#goal-target').value.trim(),
        g = state.goals.find((g) => g.id === el.dataset.id)
      if (!title || !target) {
        return toast('请填写目标和判据。')
      }
      if (title !== g.title || target !== g.target) {
        g.title = title
        g.target = target
        state.changed = true
        state.confirmed = false
        state.decisions = {}
        state.next = {}
      }
      state.expanded = null
      render()
      return
    }
    if (action === 'defer') {
      state.deferred = true
      prepareDraft(
        `${planText()}\n人的取舍：本轮不做团队绩效排行，因为它不能回答当前试点交付断在哪里。请保留为候选，不加入本轮任务。`
      )
      return
    }
    if (action === 'confirm-scope') {
      return showModal(
        '确认的是范围，不是完成',
        `<pre>${escape(planText())}</pre><p class="caption">这里只确认原型中的候选范围。实际参与项目、负责人、版本号及排期仍需落实；不会创建或完成任何真实工作。</p>`,
        `${btn('继续修改', 'close', 'ghost')}${btn('在原型中确认范围', 'save-scope', 'primary')}`
      )
    }
    if (action === 'save-scope') {
      state.confirmed = true
      closeModal()
      prepareDraft(
        `${planText()}\n本次原型范围已由人确认。实际执行前先落实参与者与负责人，再用现有 Issue 安排；未实现的能力不许宣布已完成。`
      )
      return
    }
    if (action === 'archive') {
      return prepareDraft(
        `${state.view === 'plan' ? planText() : state.goals.map((g) => `${g.id} ${g.title}：${state.decisions[g.id] || '待核对'}；实测 ${reading(g.id)}`).join('\n')}\n下一步：${nextSummary() || '仍待讨论'}\n请准备归档 PR 供人审阅；不要自动合入、发布或完成 Issue。`
      )
    }
    if (action === 'start-workflow') {
      return prepareDraft(
        `${state.view === 'plan' ? planText() : '请按原承诺准备本次交付和使用观察，区分功能完成、用户实际使用与持续价值。'}\n${scopeContext()}`
      )
    }
    if (action === 'configure-metrics') {
      if ($('#modal').open) {
        closeModal()
      }
      state.view = 'workspace'
      state.workspace = 'bw/metrics-refresh'
      return prepareDraft(
        '请先核对 v0.5 G3 原计划、验收指标修订与采集覆盖。0 不等于零用户。再讨论真实交付、持续使用和人工整理负担如何观察；没有历史脚本能力的材料不要冒充可采集指标，也不要代填北极星。'
      )
    }
    if (action === 'workspace') {
      state.workspace = el.dataset.workspace
      return navigate('workspace')
    }
    if (action === 'native-new') {
      state.closedSessions[sessionKey()] = true
      state.drafts[sessionKey()] = ''
      render()
      return toast('示意新会话，未启动 Agent。')
    }
    if (action === 'clear-draft') {
      state.drafts[sessionKey()] = ''
      $('#native-draft').value = ''
      return
    }
    if (action === 'scroll') {
      return document
        .getElementById(el.dataset.target)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
    if (action === 'native-files') {
      return showModal(
        '原生资源管理器 · 示意',
        '<pre>builder-workbench/\n├─ .bw/planning/v0.5/\n│  ├─ data.json\n│  └─ acceptance.json\n├─ .bw/metrics.toml\n└─ src/renderer/src/workbench/</pre><p>这里只展示资料关系，未连接真实文件编辑器。</p>'
      )
    }
    if (action === 'projects') {
      return showModal(
        'Builders’ Workbench',
        '<p>使用 BW 自身作为项目，v0.5 已交给内部用户。Orca 项目与工作树入口保持原位。</p>',
        `${btn('关闭', 'close', 'ghost')}${btn('查看项目与阶段方向', 'milestone', 'secondary')}`
      )
    }
    if (action === 'design') {
      return showModal(
        '这一版与现有页面的实质差异',
        `<table class="table"><thead><tr><th>现有能力</th><th>这次待评审的连接</th></tr></thead><tbody><tr><td>总览呈现项目、指标和纪要</td><td>把已交付、未知与一个待决定事项放在一起</td></tr><tr><td>计划形成版本目标</td><td>从上版具体缺口起草下一轮范围，并解释服务什么阶段判断</td></tr><tr><td>验收记录达成与下一步</td><td>结果和待处理安排回到总览，继续影响后续投入</td></tr></tbody></table><p>外壳、执行、任务和事实源沿用现有设计；周与阶段日期是上下文提案，不增加里程碑系统。页面只让假设和差距更可见，不能保证“成为 super builder”或“没有风险”。</p>`,
        `${btn('关闭', 'close', 'ghost')}${btn('事实与演示的边界', 'sources', 'secondary')}`
      )
    }
    if (action === 'native-info' || ['automations', 'knowledge'].includes(action)) {
      return showModal(
        el.dataset.name || el.textContent,
        '<p>保留现有 Orca-BW 入口。本次不新增执行器、自动化或知识库能力，也不启动真实任务。</p>'
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
