(() => {
  const steps = [
    {
      title: '找到运营看板', subtitle: '从项目墙进入一个真实工作的项目', location: '项目墙 / 项目卡片',
      source: '项目墙', target: '项目总览', duration: 3600, cue: { at: 850, click: 1900, target: 'open-overview' },
      render: (t) => shell('wall', 'wall', '项目墙 / 运营看板', wallView(t))
    },
    {
      title: '确认运营方向', subtitle: '在项目总览里看见目标与看板', location: '项目总览 / 运营看板',
      source: '项目墙 · 打开总览', target: '方向编辑', duration: 3800, cue: { at: 750, click: 1900, target: 'edit-direction' },
      render: (t) => shell('overview', 'overview', '项目总览 / 运营看板', overviewView(t))
    },
    {
      title: '写下共同目标', subtitle: '沿着总览打开方向编辑', location: '项目设置 / 项目信息',
      source: '项目总览 · 编辑方向', target: '保存方向', duration: 4000, cue: { at: 650, click: 2350, target: 'save-direction' },
      render: (t) => shell('settings', 'settings', '项目设置 / 项目信息', settingsView(t).main, settingsView(t).side)
    },
    {
      title: '安排阶段成果', subtitle: '把方向落成可以检查的阶段节点', location: '项目总览 / 阶段安排',
      source: '项目方向 · 提交评审', target: '阶段安排', duration: 4200, cue: { at: 700, click: 2500, target: 'submit-milestones' },
      render: (t) => shell('overview', 'milestones', '项目总览 / 阶段安排', milestonesView(t))
    }
  ]

  function shell(activeRail, sidebarActive, route, main, side = '') {
    const rail = [['wall', '▦', '项目墙'], ['overview', '□', '项目总览'], ['automation', '↗', '自动化'], ['knowledge', '⌁', '知识库']]
      .map(([key, icon, label]) => `<span class="wb-rail-button ${activeRail === key ? 'is-active' : ''}" title="${label}">${icon}</span>`).join('')
    return `<div class="window-titlebar"><span class="window-context">Workbench</span><span class="window-name">项目墙 / 运营看板</span><span class="window-command">⌘ K</span></div>
      <div class="window-body"><nav class="wb-rail"><span class="wb-mark">BW</span>${rail}<span class="wb-rail-spacer"></span><span class="wb-rail-button">?</span><span class="wb-rail-button">⚙</span></nav>
      <aside class="wb-sidebar"><div class="wb-sidebar-header"><span class="wb-project-avatar">运</span><span class="wb-project-name"><strong>运营看板</strong><small>当前项目</small></span></div><div class="wb-sidebar-section"><h3>工作区</h3>${sideRow('wall', '项目墙', sidebarActive)}${sideRow('overview', '项目总览', sidebarActive)}</div><div class="wb-sidebar-section"><h3>项目导航</h3>${sideRow('milestones', '阶段安排', sidebarActive)}${sideRow('settings', '项目信息', sidebarActive)}</div></aside>
      <main class="wb-main wb-wall">${main}</main></div><div class="window-route"><strong>来源</strong><span>${route}</span></div>${side}`
  }
  function sideRow(key, label, active) { return `<div class="wb-sidebar-row ${active === key ? 'is-active' : ''}"><span class="dot"></span>${label}</div>` }
  function head(eyebrow, title, suffix = '') { return `<div class="page-head wb-page-head"><div><span class="window-eyebrow">${eyebrow}</span><h1>${title} <small>${suffix}</small></h1></div><div class="wb-page-actions"><span class="wb-icon">⋯</span></div></div>` }
  function card(title, copy, state = '进行中') { return `<article class="wb-project-card"><header><strong>${title}</strong><span class="wb-card-menu">⋯</span></header><p>${copy}</p><div class="wb-card-meta"><span class="wb-status"><i></i>${state}</span><span>刚刚更新</span></div></article>` }
  function wallView(t) {
    const focus = t >= 650
    return `${head('项目墙', '项目墙', '4 个项目')}<div class="content wb-content"><div class="wb-wallbar"><div class="wb-search">⌕　搜索项目</div><span class="wb-filter">我的项目⌄</span><span class="wb-filter">最近更新⌄</span></div><div class="wb-group-title">正在推进 <small>· 2 个项目</small></div><div class="wb-project-grid"><article class="wb-project-card ${focus ? 'is-target' : ''}"><header><strong>运营看板</strong><span class="wb-card-menu">⋯</span></header><p>把日常运营、内容排期和复盘动作放在同一条工作路径里。</p><div class="wb-card-meta"><span class="wb-status"><i></i>进行中</span><span>刚刚更新</span></div><button class="wb-card-button" data-anchor="open-overview" type="button">打开总览　→</button></article>${card('社区内容计划', '整理本月主题、渠道和需要协作的内容。')}</div><div class="wb-group-title" style="margin-top:16px">最近查看 <small>· 2 个项目</small></div><div class="wb-project-grid">${card('活动复盘', '记录活动结果，沉淀下一次行动。', '已归档')}${card('团队知识库', '把常用资料和决策放在团队能找到的地方。')}</div></div>`
  }
  function overviewView(t) {
    const focus = t >= 550
    return `${head('当前项目', '运营看板', '项目总览')}<div class="content wb-content"><div class="wb-overview-grid"><section class="wb-panel"><button class="panel-action ${focus ? 'is-target' : ''}" data-anchor="edit-direction" type="button">编辑方向</button><h4>让团队每周都能看见下一步</h4><p>把运营工作拆成可推进、可复盘的阶段成果，减少信息散落在不同工具里。</p><div class="wb-summary-row"><div class="wb-summary"><small>当前阶段</small><strong>Build</strong></div><div class="wb-summary"><small>进行中</small><strong>6</strong></div><div class="wb-summary"><small>本周更新</small><strong>12</strong></div></div><div class="wb-board"><div class="wb-board-column"><h5>待处理 · 3</h5><div class="wb-board-task">补齐内容排期</div><div class="wb-board-task">确认渠道负责人</div></div><div class="wb-board-column"><h5>进行中 · 2</h5><div class="wb-board-task">准备本周主题</div><div class="wb-board-task">同步活动数据</div></div><div class="wb-board-column"><h5>待复盘 · 1</h5><div class="wb-board-task">整理用户反馈</div></div><div class="wb-board-column"><h5>已完成 · 4</h5><div class="wb-board-task">建立日报模板</div></div></div></section><section class="wb-panel"><h4>共同目标</h4><p>让每个参与运营的人都知道本周要推动什么、怎样判断完成。</p><div class="wb-review"><strong>下一次检查</strong><p>周五复盘本周内容进度，并决定下周优先级。</p></div></section></div></div>`
  }
  function settingsView(t) {
    const typed = t >= 1350, reviewed = t >= 3000
    return { main: `${head('运营看板', '项目设置', '项目信息')}<div class="content wb-content"><section class="wb-panel"><h4>项目概览</h4><p>方向更新后会回到项目总览，成为后续阶段安排的共同依据。</p><div class="wb-summary-row"><div class="wb-summary"><small>状态</small><strong>${reviewed ? '待评审' : '编辑中'}</strong></div><div class="wb-summary"><small>成员</small><strong>8</strong></div><div class="wb-summary"><small>本周任务</small><strong>6</strong></div></div></section></div>`, side: `<aside class="wb-settings-rail"><span class="window-eyebrow">项目方向</span><h4>把运营工作变成同一条路径</h4><div class="field"><label>项目名称</label><input value="运营看板" readonly /></div><div class="field"><label>共同目标</label><textarea readonly>${typed ? '让团队每周都能看见下一步，并知道怎样判断完成。' : '让团队每周都能看见下一步，并知道怎样判断完成'}</textarea></div><div class="field"><label>可观察结果</label><textarea readonly>每周有明确的运营重点，任务和复盘结果能被团队找到。</textarea></div><div class="wb-settings-actions"><button type="button">取消</button><button class="is-primary ${typed ? 'is-target' : ''}" data-anchor="save-direction" type="button">${reviewed ? '已提交评审' : '提交评审'}</button></div></aside>` }
  }
  function milestonesView(t) {
    const focus = t >= 600, submitted = t >= 3000
    return `${head('运营看板', '阶段安排', '本轮成果')}<div class="content wb-content"><section class="wb-panel"><h4>把共同目标拆成阶段成果</h4><p>每个节点都对应看板上的实际动作，完成后由人确认并进入下一阶段。</p><div class="wb-milestones"><div class="wb-milestone ${focus ? 'is-target' : ''}" data-anchor="submit-milestones"><span>Build</span><strong>完成本周运营排期</strong><span>11 月 27 日</span></div><div class="wb-milestone"><span>Test</span><strong>首批内容完成复盘</strong><span>12 月 04 日</span></div><div class="wb-milestone"><span>Maintain</span><strong>决定下一轮重点</strong><span>12 月 11 日</span></div></div><div class="wb-review"><strong>${submitted ? '阶段安排已提交评审' : '准备好提交这轮阶段安排了吗？'}</strong><p>${submitted ? '后续由团队成员确认结果，再进入下一轮运营。' : '提交后会回到项目总览，作为团队共同检查的依据。'}</p><button type="button">${submitted ? '已提交评审' : '提交阶段安排'}</button></div></section></div>`
  }

  const path = document.querySelector('#path-strip'), surface = document.querySelector('#workbench-window'), play = document.querySelector('#play'), restart = document.querySelector('#restart')
  const stepTitle = document.querySelector('#step-title'), stepKicker = document.querySelector('#step-kicker'), source = document.querySelector('#route-source'), target = document.querySelector('#route-target'), location = document.querySelector('#location'), progress = document.querySelector('#progress')
  const pointer = document.createElement('span'), ring = document.createElement('span'); pointer.className = 'window-pointer'; ring.className = 'window-ring'
  let index = 0, time = 0, playing = false, last = 0, timer = 0
  function nav() { path.innerHTML = steps.map((s, i) => `<button class="path-step" data-step="${i}" data-index="${i + 1}" aria-current="${i === index ? 'step' : 'false'}"><strong>${s.title}</strong><small>${s.subtitle}</small></button>`).join(''); path.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => select(Number(b.dataset.step), false))) }
  function render() { const s = steps[index]; surface.innerHTML = s.render(time); surface.append(pointer, ring); stepKicker.textContent = `第 ${index + 1} 步 · ${s.source}`; stepTitle.textContent = s.title; source.textContent = s.source; target.textContent = s.target; location.textContent = s.location; progress.textContent = `${Math.floor(time / 1000)} / ${Math.ceil(s.duration / 1000)} 秒`; play.textContent = playing ? '暂停' : time > 0 && time < s.duration ? '继续' : '播放本段'; nav(); requestAnimationFrame(position) }
  function position() { const c = steps[index].cue, el = surface.querySelector(`[data-anchor="${c.target}"]`); if (!el) return pointer.classList.remove('is-visible'), ring.classList.remove('is-visible'); const a = surface.getBoundingClientRect(), b = el.getBoundingClientRect(), x = b.left - a.left + Math.min(b.width / 2, 42), y = b.top - a.top + b.height / 2; pointer.style.left = `${x}px`; pointer.style.top = `${y}px`; ring.style.left = `${x}px`; ring.style.top = `${y}px`; pointer.classList.toggle('is-visible', time >= c.at); ring.classList.toggle('is-visible', time >= c.click && time < c.click + 620) }
  function select(next, shouldPlay) { stop(); index = next; time = 0; playing = shouldPlay; render(); if (playing) start() }
  function start() { if (timer) return; playing = true; last = performance.now(); timer = window.setInterval(() => { const now = performance.now(); time = Math.min(steps[index].duration, time + now - last); last = now; if (time >= steps[index].duration) { if (index + 1 < steps.length) index++, time = 0; else stop(), time = steps[index].duration } render() }, 45) }
  function stop() { if (timer) window.clearInterval(timer); timer = 0; playing = false }
  play.addEventListener('click', () => { if (time >= steps[index].duration) time = 0; playing ? stop() : start(); render() }); restart.addEventListener('click', () => select(0, true)); document.querySelector('#theme-toggle').addEventListener('click', () => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }); render()
})()
