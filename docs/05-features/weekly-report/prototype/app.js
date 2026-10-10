;(() => {
  const data = window.weeklyFixture
  const $ = (id) => document.getElementById(id)
  const esc = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
    )
  const sectionNames = {
    goals: '目标',
    progress: '关键进展',
    risks: '关键风险',
    milestones: '里程碑',
    requirements: '需求详细进展',
    problems: '问题单进展',
    members: '项目成员'
  }
  const steps = ['读取项目目标', '读取 Issue 与 MR', '核对期间变化', '组织内容与证据', '渲染周报']
  const state = {
    scenario: 'complete',
    reportScenario: 'complete',
    generated: false,
    busy: false,
    failed: false,
    reviewed: false,
    manual: false,
    notes: {},
    corrections: {},
    checkedAt: {},
    resolved: false,
    revision: 0
  }
  let noticeTimer
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const inWindow = (date) =>
    date && date >= data.start.slice(0, 10) && date < data.endExclusive.slice(0, 10)
  const evidenceButton = (key, label) =>
    `<button class="evidence-button" data-evidence="${esc(key)}">${esc(label)}</button>`
  const table = (headers, rows) =>
    `<div class="table-scroll"><table><thead><tr>${headers.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  const annotation = (key) =>
    state.notes[key]
      ? `<div class="annotation"><small>人工补充 · ${esc(data.owner)}</small><p>${esc(state.notes[key])}</p></div>`
      : ''
  const section = (key, title, body) =>
    `<section data-section="${key}"><h3>${esc(title)}</h3>${state.corrections[key] && state.notes[key] ? `${annotation(key)}<details><summary>自动依据（本节结论已由人工修正）</summary>${body}</details>` : body + annotation(key)}</section>`
  const pending = () => state.reportScenario === 'missing' && !state.resolved && !state.manual
  const uncheckedNotes = () =>
    state.manual
      ? []
      : Object.keys(state.notes).filter((key) => state.checkedAt[key] !== state.revision)
  const goalTable = () =>
    table(
      ['目标', '交付与验收标准', '计划时间', '目标结论'],
      data.goals.map((g) => [
        esc(`${g.id} ${g.title}`),
        `${esc(g.deliverable)}<br /><span class="muted">${esc(g.criterion)}</span>`,
        esc(g.date),
        `<span class="badge">${esc(g.acceptance)}</span>`
      ])
    )

  function notify(message) {
    $('notice').textContent = message
    $('notice').hidden = false
    clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => {
      $('notice').hidden = true
    }, 4500)
  }

  function stats(issues) {
    return {
      added: issues.filter((x) => inWindow(x.created)).length,
      closed: issues.filter((x) => inWindow(x.closed)).length,
      open: issues.filter(
        (x) =>
          x.created < data.endExclusive.slice(0, 10) &&
          (!x.closed || x.closed >= data.endExclusive.slice(0, 10))
      ).length
    }
  }

  function header() {
    return `<h2 class="report-title">${esc(data.project)}开发周报</h2><div class="report-meta"><span>2026.10.05 — 10.09</span><span>${esc(data.version)}</span><span>维护人：${esc(data.owner)}</span><span>${state.manual ? '手动草稿，自动取数未完成' : '自动生成，人工审阅'}</span></div>`
  }

  function renderReport() {
    if (state.manual) {
      return `${header()}<p class="source-note">版本目标已读取；CodeHub 尚未读回，本周工作数量未知。以下保留目标资料与人工提供的草稿内容。</p>${Object.keys(
        sectionNames
      )
        .map((key) =>
          section(
            key,
            sectionNames[key],
            key === 'goals'
              ? goalTable()
              : state.notes[key]
                ? ''
                : '<p class="muted">待补充，尚无可用记录。</p>'
          )
        )
        .join('')}`
    }
    const issues = data.issues
    const counts = stats(issues)
    const problemCounts = stats(issues.filter((x) => x.type === '问题'))
    const scenario = data.scenarios[state.reportScenario]
    const progress = pending()
      ? `<li><strong>降低在线推理延迟：</strong>批处理优化已合入 ${evidenceButton('101', 'MR !53 / Issue #101')}；压测记录缺失，性能结果待核实。</li>`
      : `<li><strong>降低在线推理延迟：</strong>批处理优化已合入 ${evidenceButton('101', 'MR !53 / Issue #101')}。${!scenario.verificationLoaded ? '验证信息见下方人工补充，目标仍待人验收。' : `${evidenceButton('metrics', '压测 P95 118ms')}；高并发试运行尚未完成，目标待人验收。`}</li>`
    let html = header()
    html += section(
      'goals',
      '一、目标',
      `${goalTable()}<p class="source-note">依据：${evidenceButton('plan', 'v0.8 版本计划')}。目标结论独立于 Issue 状态。</p>`
    )
    html += section(
      'progress',
      '二、关键进展',
      `<ul>${progress}<li><strong>保证服务稳定运行：</strong>${evidenceButton('102', '重复请求问题 #102')}已验证修复并关闭；${evidenceButton('105', '排障说明 #105')}已更新。新发现的告警上下文问题已定位。</li><li><strong>下一步：</strong>协调试运行环境，完成上下文修复与目标验收。</li></ul><p class="source-note">全部工作：本周新增 ${counts.added} 项、关闭 ${counts.closed} 项，期末未关闭 ${counts.open} 项。按本次完整示例记录计算。</p>`
    )
    html += section(
      'risks',
      '三、关键风险',
      scenario.risksLoaded
        ? table(
            ['风险及影响', '关联工作', '应对与时间', '责任人 / 状态'],
            data.risks.map((r) => [
              `<span class="badge warning">${esc(r.level)}风险</span><br />${esc(r.impact)}`,
              evidenceButton(String(r.issue), `#${r.issue} / ${r.goal}`),
              esc(r.action),
              `${esc(data.owner)}<br />${esc(r.status)}`
            ])
          )
        : '<p><span class="badge warning">风险信息未知</span> 尚未取得完整风险记录，不能判断“无风险”。Issue #104 的环境阻碍见工作明细。</p>'
    )
    if (scenario.milestonesDefined || state.notes.milestones) {
      html += section(
        'milestones',
        '四、里程碑',
        scenario.milestonesDefined
          ? table(
              ['节点', '计划日期', '达成条件', '当前情况'],
              data.milestones.map((m) => [
                esc(m.title),
                esc(m.date),
                esc(m.condition),
                esc(m.status)
              ])
            )
          : '<p class="muted">项目材料未定义独立里程碑，以下来自人工补充。</p>'
      )
    }
    const offset = scenario.milestonesDefined || state.notes.milestones ? 5 : 4
    html += section(
      'requirements',
      `${offset === 5 ? '五' : '四'}、子目标／需求详细进展`,
      table(
        ['目标 / 工作', '计划 / 责任人', '状态', '本周进展', '下一步'],
        issues
          .filter((x) => x.type !== '问题')
          .map((x) => [
            `${esc(x.goal)}<br />${evidenceButton(String(x.id), `#${x.id} ${x.title}`)}`,
            `${esc(x.due)}<br />${esc(data.owner)}`,
            esc(x.status),
            esc(
              x.id === 101 && state.corrections.progress
                ? '批处理优化已合入；原验证记录见依据，性能结论以关键进展中的人工修正为准。'
                : x.id === 101 && !scenario.verificationLoaded
                  ? '批处理优化已合入；验证信息以人工补充为准，未补齐时为未知。'
                  : x.progress
            ),
            esc(x.next)
          ])
      )
    )
    html += section(
      'problems',
      `${offset === 5 ? '六' : '五'}、问题单进展`,
      `<p>本周新增 ${problemCounts.added} 单、关闭 ${problemCounts.closed} 单、期末未关闭 ${problemCounts.open} 单。</p>${table(
        ['问题', '目标 / 状态', '本周处理进展', '下一步'],
        issues
          .filter((x) => x.type === '问题')
          .map((x) => [
            evidenceButton(String(x.id), `#${x.id} ${x.title}`),
            `${esc(x.goal)}<br />${esc(x.status)}`,
            esc(x.progress),
            esc(x.next)
          ])
      )}`
    )
    html += section(
      'members',
      `${offset === 5 ? '七' : '六'}、项目成员`,
      table(
        ['成员', '角色与负责范围', '本周期责任'],
        [[esc(data.owner), '项目维护与开发', 'G1、G2；开发、验证与交付协调']]
      )
    )
    html +=
      '<p class="source-note">本项目没有客户／局点支撑记录，本次不展开该栏目。此报告使用示例数据，不能作为实际交付证明。</p>'
    return html
  }

  function render() {
    $('empty').hidden = state.generated || state.failed || state.busy
    $('failure').hidden = !state.failed
    $('workspace').hidden = !state.generated
    $('generate').disabled = state.busy
    $('scenario').disabled = state.busy
    $('generate').textContent = state.busy ? '正在生成…' : state.generated ? '重新生成' : '生成周报'
    if (!state.generated) {
      return
    }
    $('report').innerHTML = renderReport()
    const needsReview = uncheckedNotes()
    const label = state.reviewed
      ? '已确认报告'
      : state.manual
        ? '手动草稿'
        : pending() || needsReview.length
          ? '待补充与核对'
          : '待审阅'
    $('report-state').textContent = label
    $('report-state').className =
      `badge ${state.reviewed ? 'success' : pending() || needsReview.length || state.manual ? 'warning' : ''}`
    $('generation-note').textContent =
      `第 ${state.revision} 次生成 · ${state.manual ? 'CodeHub 未读取' : `取数 ${data.collected}`} · ${state.failed ? (state.manual ? '自动取数失败，人工草稿' : '本次读取失败，保留上次报告') : 'Asia/Shanghai'}`
    $('confirm').disabled = state.reviewed || pending() || needsReview.length > 0 || state.busy
    $('supplement').disabled = state.busy
    $('export').disabled = state.busy
    $('attention').hidden = !pending() && !state.manual && needsReview.length === 0
    $('attention').innerHTML = state.manual
      ? '<strong>自动数据尚未取得</strong><p>当前为人工草稿，Issue 与问题单数量未知。重试成功后，人工说明将保留供核对。</p>'
      : pending()
        ? '<strong>有 1 项信息待补充</strong><p>Issue #101 已合入，但缺少压测记录。性能结果保持未知，目标仍待人验收。</p><button class="button" data-supplement="progress">补充验证信息</button>'
        : `<strong>人工补充已保留，有 ${needsReview.length} 节待核对</strong><p>请核对补充与当前自动资料；有差异时修正该节结论，核对前保持草稿。</p><button class="button" data-supplement="${esc(needsReview[0] || 'progress')}">核对人工补充</button>`
    const source = state.manual
      ? '读取失败，数量未知'
      : `${data.issues.length} 项，范围完整（示例）`
    $('source-summary').innerHTML =
      `<div class="source-row"><span>Issue / MR</span><span>${esc(source)}</span></div><div class="source-row"><span>版本目标</span><span>2 个</span></div><div class="source-row"><span>验证材料</span><span>${state.manual || !data.scenarios[state.reportScenario].verificationLoaded ? '未取得' : '1 份'}</span></div><p class="muted">真实会话需读完统计范围内的记录；分页未读完时标为不完整，不宣称全量。</p>`
    $('manual-notes').innerHTML = `<h3>人工补充</h3>${
      Object.entries(state.notes).length
        ? Object.entries(state.notes)
            .map(
              ([key, value]) =>
                `<div class="annotation"><small>${esc(sectionNames[key])}</small><p>${esc(value)}</p></div>`
            )
            .join('')
        : '<p class="muted">暂无补充。重新生成会保留已保存的说明。</p>'
    }`
  }

  async function generate(retry = false) {
    if (state.busy) {
      return
    }
    state.busy = true
    state.failed = false
    $('activity').hidden = false
    render()
    for (let index = 0; index < steps.length; index += 1) {
      $('activity').innerHTML =
        `<h3>生成会话 <span class="muted">模拟执行</span></h3><ol>${steps.map((text, i) => `<li class="${i < index ? 'done' : i === index ? 'current' : ''}">${i < index ? '✓ ' : ''}${esc(text)}</li>`).join('')}</ol>`
      await wait(220)
      if (state.scenario === 'failed' && !retry && index === 1) {
        state.busy = false
        state.failed = true
        render()
        $('activity').innerHTML += '<p class="source-note">读取中断；本次未得到统计结果。</p>'
        return
      }
    }
    state.busy = false
    state.generated = true
    state.manual = false
    state.reportScenario = state.scenario
    state.reviewed = false
    state.revision += 1
    $('activity').innerHTML =
      `<h3>生成会话已完成 <span class="muted">模拟执行</span></h3><ol>${steps.map((text) => `<li class="done">✓ ${esc(text)}</li>`).join('')}</ol>`
    render()
    if (retry) {
      notify('示例读取已恢复，报告已生成；人工补充仍保留供核对。')
    } else if (Object.keys(state.notes).length) {
      notify('报告已重新生成，人工补充已保留。')
    }
  }

  function openEditor(key = 'progress') {
    $('note-section').value = key
    $('note-content').value = state.notes[key] || ''
    $('resolve').checked = state.resolved
    $('resolve-label').hidden =
      state.reportScenario !== 'missing' || key !== 'progress' || state.manual
    $('note-mode').value = state.corrections[key] ? 'correct' : 'append'
    $('note-checked').checked = state.checkedAt[key] === state.revision
    $('checked-label').hidden = state.manual
    $('editor-title').textContent = state.manual ? '手动整理草稿' : '补充报告信息'
    $('editor').showModal()
  }

  function showEvidence(key) {
    const issue = data.issues.find((x) => String(x.id) === key)
    const item = issue
      ? {
          title: `Issue #${issue.id} ${issue.title}`,
          source: 'CodeHub Issue / MR（示例）',
          text:
            issue.id === 101 && !data.scenarios[state.reportScenario].verificationLoaded
              ? '10 月 7 日：MR !53 已合入。未读取到压测记录；性能目标是否达到未知。'
              : issue.events.length
                ? issue.events.map((event) => `${event.at}：${event.text}`).join('\n')
                : '本周没有新增处理记录。当前状态为待办。'
        }
      : data.evidence[key]
    if (!item) {
      return
    }
    $('evidence-title').textContent = item.title
    $('evidence-content').innerHTML =
      `<span class="badge">${esc(item.source)}</span><p class="manual-copy">${esc(item.text)}</p><p class="muted">原型使用本地示例依据。正式报告应链接到可访问的原始记录。</p>`
    $('evidence').showModal()
  }

  function exportReport() {
    const copy = $('report').cloneNode(true)
    copy.querySelectorAll('[data-evidence]').forEach((button) => {
      const span = document.createElement('span')
      span.textContent = `${button.textContent}（示例依据）`
      button.replaceWith(span)
    })
    const sourceSummary = $('source-summary').textContent
    const evidenceItems = state.manual
      ? []
      : data.issues.map((x) => ({
          title: `Issue #${x.id} ${x.title}`,
          text:
            x.id === 101 && !data.scenarios[state.reportScenario].verificationLoaded
              ? 'MR !53 已合入，压测材料未取得。'
              : x.events.map((event) => `${event.at}：${event.text}`).join('；') ||
                '本周无新增记录。'
        }))
    evidenceItems.unshift(data.evidence.plan)
    if (!state.manual && data.scenarios[state.reportScenario].verificationLoaded) {
      evidenceItems.push(data.evidence.metrics)
    }
    const sources = `<section><h3>统计范围与依据</h3><p>统计窗口：${esc(data.start)} 至 ${esc(data.endExclusive)}（结束时间不计入），时区 Asia/Shanghai。示例日期事件按整日统计，取数时间：${state.manual ? 'CodeHub 未读取' : esc(data.collected)}。</p>${state.failed ? '<p>本次读取失败。已有自动报告沿用上次成功取数，人工草稿保持未取数标识。</p>' : ''}<p>${esc(sourceSummary)}</p><p>${esc($('attention').hidden ? '' : $('attention').textContent)}</p>${evidenceItems.map((item) => `<h4>${esc(item.title)}</h4><p>${esc(item.source || 'CodeHub Issue / MR（示例）')}</p><p>${esc(item.text)}</p>`).join('')}</section>`
    const css =
      "body{max-width:1100px;margin:40px auto;padding:0 24px;font:14px/1.65 'Microsoft YaHei',sans-serif;color:#292929}h2{font-size:26px}h3{margin-top:28px}table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:10px;border:1px solid #ddd;text-align:left;vertical-align:top}th{background:#f5f5f5}.report-meta{color:#666;display:flex;flex-wrap:wrap;gap:16px}.source-note,.muted,small{color:#666;font-size:12px}.annotation{border-left:3px solid #777;padding-left:12px;margin-top:14px}.annotation p{white-space:pre-wrap}.table-scroll{overflow:auto}.badge{font-size:12px}"
    const content = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(data.project)}周报</title><style>${css}</style></head><body><p>交互原型示例报告 · ${state.reviewed ? '报告内容已确认' : '草稿，待审阅'} · ${state.manual ? '自动取数未完成' : '使用示例数据'}</p>${copy.innerHTML}${sources}</body></html>`
    const url = URL.createObjectURL(new Blob([content], { type: 'text/html;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `推理服务优化-周报-20261005-1009-${state.reviewed ? '已确认' : '草稿'}.html`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify('已导出独立 HTML 示例报告。人工补充包含在报告中。')
  }

  $('generate').addEventListener('click', () => generate())
  $('retry').addEventListener('click', () => generate(true))
  $('manual').addEventListener('click', () => {
    if (!state.generated) {
      state.manual = true
      state.revision += 1
    }
    state.generated = true
    state.reviewed = false
    render()
    openEditor()
  })
  $('scenario').addEventListener('change', (event) => {
    state.scenario = event.target.value
    $('activity').hidden = true
    render()
  })
  $('supplement').addEventListener('click', () => openEditor())
  $('note-section').addEventListener('change', (event) => {
    const key = event.target.value
    $('note-content').value = state.notes[key] || ''
    $('resolve-label').hidden =
      state.reportScenario !== 'missing' || key !== 'progress' || state.manual
    $('note-mode').value = state.corrections[key] ? 'correct' : 'append'
    $('note-checked').checked = state.checkedAt[key] === state.revision
  })
  $('edit-form').addEventListener('submit', (event) => {
    event.preventDefault()
    const content = $('note-content').value.trim()
    if (!content) {
      $('note-content').setCustomValidity('请输入补充内容。')
      $('note-content').reportValidity()
      return
    }
    const key = $('note-section').value
    state.notes[key] = content
    state.corrections[key] = $('note-mode').value === 'correct'
    state.checkedAt[key] = $('note-checked').checked ? state.revision : -1
    if (key === 'progress' && state.reportScenario === 'missing' && !state.manual) {
      state.resolved = $('resolve').checked
    }
    state.reviewed = false
    $('editor').close()
    render()
    notify('补充已保存并标记来源；重新生成时会保留。')
  })
  $('note-content').addEventListener('input', () => $('note-content').setCustomValidity(''))
  $('confirm').addEventListener('click', () => {
    if (pending() || uncheckedNotes().length || state.busy) {
      return
    }
    state.reviewed = true
    render()
    notify('报告内容已确认。Issue 状态与目标验收结论保持原样。')
  })
  $('export').addEventListener('click', exportReport)
  document.addEventListener('click', (event) => {
    const evidence = event.target.closest('[data-evidence]')
    if (evidence) {
      showEvidence(evidence.dataset.evidence)
    }
    const supplement = event.target.closest('[data-supplement]')
    if (supplement) {
      openEditor(supplement.dataset.supplement)
    }
    const close = event.target.closest('[data-close]')
    if (close) {
      $(close.dataset.close).close()
    }
  })
  render()
})()
