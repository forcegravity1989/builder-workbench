;(() => {
  const clone = (value) => JSON.parse(JSON.stringify(value))
  const fixture = clone(window.weeklyFixture)
  let data = fixture
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
  const initialState = () => ({
    scenario: 'complete',
    reportScenario: 'complete',
    generated: true,
    busy: false,
    failed: false,
    reviewed: false,
    manual: false,
    notes: {},
    corrections: {},
    checkedAt: {},
    resolved: false,
    revision: 1
  })
  let workingState = initialState()
  let workingData = clone(fixture)
  let state = workingState
  const session = { busy: false, failed: false, scenario: 'complete', open: false, produced: false }
  const storageKey = 'bw-weekly-report-archive-demo-v2'
  let archives = []
  let selectedId = null
  let pinnedSelection = false
  let storageProblem = ''
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
    return `<h2 class="report-title">${esc(data.project)}开发周报</h2><div class="report-meta"><span>${esc(data.periodLabel)}</span><span>${esc(data.version)}</span><span>维护人：${esc(data.owner)}</span><span>${state.manual ? '手动草稿，自动取数未完成' : '自动生成，人工审阅'}</span></div>`
  }

  function reportBrief() {
    const scenario = data.scenarios[state.reportScenario]
    const issue = data.issues.find((item) => item.id === 101)
    const closed = data.issues.filter((item) => inWindow(item.closed))
    const automaticProgress = state.manual
      ? '自动工作记录未取得，本周交付未知。'
      : `本周关闭 ${closed.length} 项：${closed.map((item) => item.title).join('、')}。${issue?.events.at(0)?.text || '批处理交付记录待核对'}；${scenario.verificationLoaded ? `${data.metricLabel}，目标仍待人验收。` : '压测材料缺失，性能结论未知。'}`
    const automaticRisk =
      state.manual || !scenario.risksLoaded
        ? '未取得完整风险材料，不能判断无风险。'
        : data.risks.map((item) => item.impact).join('；') || '未发现风险记录，仍需人核对。'
    const decision = `目标验收：${data.goals.map((goal) => `${goal.title}（${goal.acceptance}）`).join('、')}。`
    const text = (key, automatic) =>
      state.notes[key]
        ? state.corrections[key]
          ? `人工修正：${state.notes[key]}`
          : `${automatic} 人工补充：${state.notes[key]}`
        : automatic
    return `<section class="report-conclusion"><h3>本周结论</h3><p><strong>核心交付：</strong>${esc(text('progress', automaticProgress))}</p><p><strong>未决风险：</strong>${esc(text('risks', automaticRisk))}</p><p><strong>待人决定：</strong>${esc(text('goals', decision))}</p><p class="source-note">结论从本份报告的示例事实与人工修订收敛；归档和审阅不替代目标验收。详细依据见下方完整报告。</p></section>`
  }

  function renderReport() {
    if (state.manual) {
      return `${header()}${reportBrief()}<p class="source-note">版本目标已读取；CodeHub 尚未读回，本周工作数量未知。以下保留目标资料与人工提供的草稿内容。</p><details class="report-details"><summary>展开目标、工作明细与责任</summary>${Object.keys(
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
        .join('')}</details>`
    }
    const issues = data.issues
    const counts = stats(issues)
    const problemCounts = stats(issues.filter((x) => x.type === '问题'))
    const scenario = data.scenarios[state.reportScenario]
    const progress = pending()
      ? `<li><strong>降低在线推理延迟：</strong>批处理优化已合入 ${evidenceButton('101', 'MR !53 / Issue #101')}；压测记录缺失，性能结果待核实。</li>`
      : `<li><strong>降低在线推理延迟：</strong>批处理优化已合入 ${evidenceButton('101', 'MR !53 / Issue #101')}。${!scenario.verificationLoaded ? '验证信息见下方人工补充，目标仍待人验收。' : `${evidenceButton('metrics', data.metricLabel)}；高并发试运行尚未完成，目标待人验收。`}</li>`
    let html = `${header()}${reportBrief()}<details class="report-details"><summary>展开目标、需求、问题与责任明细</summary>`
    html += section(
      'goals',
      '一、目标',
      `${goalTable()}<p class="source-note">依据：${evidenceButton('plan', data.evidence.plan.title)}。目标结论独立于 Issue 状态。</p>`
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
        [[esc(data.owner), esc(data.memberRole), esc(data.memberResponsibilities)]]
      )
    )
    html +=
      '<p class="source-note">本项目没有客户／局点支撑记录，本次不展开该栏目。此报告使用示例数据，不能作为实际交付证明。</p>'
    return `${html}</details>`
  }

  function currentArchive() {
    return archives.find((item) => item.id === selectedId)
  }

  function latestArchive() {
    return archives.at(-1)
  }

  function validFacts(facts) {
    return Boolean(
      facts &&
      typeof facts.project === 'string' &&
      typeof facts.owner === 'string' &&
      typeof facts.reportId === 'string' &&
      typeof facts.periodLabel === 'string' &&
      typeof facts.start === 'string' &&
      typeof facts.endExclusive === 'string' &&
      Array.isArray(facts.goals) &&
      facts.goals.every((item) => item && typeof item.title === 'string') &&
      Array.isArray(facts.issues) &&
      facts.issues.every(
        (item) =>
          item &&
          typeof item.title === 'string' &&
          typeof item.created === 'string' &&
          Array.isArray(item.events) &&
          item.events.every((event) => event && typeof event.text === 'string')
      ) &&
      Array.isArray(facts.risks) &&
      facts.risks.every((item) => item && typeof item.impact === 'string') &&
      Array.isArray(facts.milestones) &&
      facts.milestones.every((item) => item && typeof item.title === 'string') &&
      facts.scenarios &&
      ['complete', 'missing', 'failed'].every(
        (key) =>
          facts.scenarios[key] && typeof facts.scenarios[key].verificationLoaded === 'boolean'
      ) &&
      facts.evidence &&
      facts.evidence.plan &&
      facts.evidence.metrics
    )
  }

  function validReport(report) {
    return (
      report &&
      typeof report.generated === 'boolean' &&
      typeof report.revision === 'number' &&
      report.notes &&
      report.corrections &&
      report.checkedAt &&
      ['complete', 'missing', 'failed'].includes(report.reportScenario)
    )
  }

  function persist() {
    const previousPersistence = archives.map((item) => item.persistence)
    archives.forEach((item) => {
      item.persistence = 'browser'
    })
    try {
      if ($('storage-failure-demo').checked) {
        throw new Error('模拟归档保存失败')
      }
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          schema: 2,
          archives,
          workingState,
          workingData,
          selectedId,
          pinnedSelection
        })
      )
      storageProblem = ''
      return true
    } catch {
      archives.forEach((item, index) => {
        item.persistence = previousPersistence[index] || 'page'
      })
      storageProblem = '浏览器未能保存本机原型档案；当前内容仅在本次页面中保留，请导出备份。'
      return false
    }
  }

  function storeRevision(reason) {
    const version = archives.reduce((maximum, item) => Math.max(maximum, item.version), 0) + 1
    const savedAt = new Date().toISOString()
    const record = {
      id: `weekly-demo-${version}-${Date.now()}`,
      version,
      savedAt,
      reason,
      reportId: workingData.reportId,
      facts: clone(workingData),
      report: clone(workingState),
      source: '本机浏览器交互原型，模拟项目材料与 CodeHub 记录',
      persistence: 'page'
    }
    archives.push(record)
    if (!pinnedSelection) {
      selectedId = record.id
    }
    persist()
    return record
  }

  function beginEdit() {
    const record = currentArchive()
    if (record) {
      workingState = clone(record.report)
      workingData = clone(record.facts)
      selectedId = null
      pinnedSelection = false
    }
    state = workingState
    data = workingData
    return !session.busy
  }

  function reportLabel(report) {
    if (report.reviewed) {
      return '已审阅'
    }
    if (report.manual) {
      return '人工草稿'
    }
    const unchecked = Object.keys(report.notes).some(
      (key) => report.checkedAt[key] !== report.revision
    )
    return (report.reportScenario === 'missing' && !report.resolved) || unchecked
      ? '待补充与核对'
      : '待审阅'
  }

  function renderArchiveList() {
    $('archive-count').textContent = String(archives.length)
    $('archive-list').innerHTML =
      archives
        .toReversed()
        .map(
          (item) =>
            `<button class="archive-item ${selectedId === item.id ? 'active' : ''}" data-archive="${esc(item.id)}" aria-pressed="${selectedId === item.id}"><strong>${esc(item.facts.periodLabel)} · ${esc(item.facts.version)}</strong><span>修订 ${item.version} · ${esc(reportLabel(item.report))}${item.persistence === 'page' ? ' · 仅本页，未保存' : ''}</span><small>${esc(new Date(item.savedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }))} · ${esc(item.reason)}</small></button>`
        )
        .join('') || '<p class="muted">尚无归档结果。生成或手动整理后保存。</p>'
  }

  function render() {
    const record = currentArchive()
    state = record ? record.report : workingState
    data = record ? record.facts : workingData
    $('process-panel').hidden = !session.open
    $('scenario').value = session.scenario
    $('empty').hidden = state.generated || archives.length > 0 || session.busy
    $('failure').hidden = !session.failed
    $('workspace').hidden = !state.generated
    $('generate').disabled = session.busy
    $('scenario').disabled = session.busy
    $('reset-example').disabled = session.busy
    $('storage-failure-demo').disabled = session.busy
    $('retry').disabled = session.busy
    $('manual').disabled = session.busy
    $('save-report').disabled = session.busy || Boolean(record) || !state.generated
    $('generate').textContent = session.busy ? '正在生成…' : '生成并归档周报'
    renderArchiveList()
    if (!state.generated) {
      return
    }
    $('report').innerHTML = renderReport()
    const needsReview = uncheckedNotes()
    $('report-state').textContent = reportLabel(state)
    $('report-state').className =
      `badge ${state.reviewed ? 'success' : pending() || needsReview.length || state.manual ? 'warning' : ''}`
    $('generation-note').textContent = record
      ? `${record.persistence === 'page' ? '本页结果，未保存' : '归档'} ${record.reportId} · 修订 ${record.version} · ${new Date(record.savedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（上海时间）`
      : `当前工作稿 · 第 ${state.revision} 次生成 · ${state.manual ? 'CodeHub 未读取' : `取数 ${data.collected}`} · Asia/Shanghai`
    $('confirm').disabled = state.reviewed || pending() || needsReview.length > 0 || session.busy
    $('supplement').disabled = session.busy
    $('export').disabled = false
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
      `<div class="source-row"><span>Issue / MR</span><span>${esc(source)}</span></div><div class="source-row"><span>版本目标</span><span>${data.goals.length} 个</span></div><div class="source-row"><span>验证材料</span><span>${state.manual || !data.scenarios[state.reportScenario].verificationLoaded ? '未取得' : '1 份'}</span></div><p class="muted">统计范围：${esc(data.start)} 至 ${esc(data.endExclusive)}（结束时间不计入），Asia/Shanghai。${state.manual ? 'CodeHub 未读取' : `取数 ${esc(data.collected)}`}。</p><p class="muted">档案冻结本次示例来源，查看旧修订不会重新取数。本机浏览器原型存储，不代表生产保存或真实分页读取。</p>${storageProblem ? `<p class="muted">${esc(storageProblem)}</p>` : ''}`
    $('manual-notes').innerHTML = `<h3>人工补充</h3>${
      Object.entries(state.notes).length
        ? Object.entries(state.notes)
            .map(
              ([key, value]) =>
                `<div class="annotation"><small>${esc(sectionNames[key] || key)} · ${esc(data.owner)}</small><p>${esc(value)}</p></div>`
            )
            .join('')
        : '<p class="muted">暂无补充。重新生成会保留已保存的说明。</p>'
    }`
  }

  async function generate(retry = false) {
    if (session.busy) {
      return
    }
    session.busy = true
    session.failed = false
    session.open = true
    const scenario = session.scenario
    const previousWork = clone(workingState)
    $('activity').hidden = false
    render()
    for (let index = 0; index < steps.length; index += 1) {
      $('activity').innerHTML =
        `<h3>周五工作会话 <span class="muted">模拟执行 · 过程件</span></h3><ol>${steps.map((text, i) => `<li class="${i < index ? 'done' : i === index ? 'current' : ''}">${i < index ? '✓ ' : ''}${esc(text)}</li>`).join('')}</ol>`
      await wait(220)
      if (scenario === 'failed' && !retry && index === 1) {
        session.busy = false
        session.failed = true
        render()
        $('activity').innerHTML +=
          '<p class="source-note">读取中断；未生成新结果，既有归档与人工修订保留。</p>'
        return
      }
    }
    workingState = previousWork
    workingState.generated = true
    workingState.manual = false
    workingState.reportScenario = scenario
    workingState.reviewed = false
    workingState.revision += 1
    workingData = clone(fixture)
    session.produced = true
    session.busy = false
    const generatedRecord = storeRevision('会话自动生成')
    $('activity').innerHTML =
      `<h3>${generatedRecord.persistence === 'page' ? '周报已生成，未保存' : '周报结果已归档'} <span class="muted">模拟执行</span></h3><p>${generatedRecord.persistence === 'page' ? '浏览器未能保存，本次结果仅在本页保留，请导出备份。' : '会话可以收起；报告及来源已独立保存为新修订。'}${pinnedSelection ? '当前仍查看所选旧修订，请在档案列表选择新结果。' : '人工补充已保留，重新生成后需要核对。'}</p>`
    render()
    notify(storageProblem || '已生成新修订并归档；旧修订和人工补充保留。')
  }

  function openEditor(key = 'progress') {
    if (session.busy) {
      return
    }
    beginEdit()
    render()
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
    copy.querySelectorAll('.report-details').forEach((detail) => {
      detail.open = true
    })
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
    const sources = `<section><h3>统计范围与依据</h3><p>统计窗口：${esc(data.start)} 至 ${esc(data.endExclusive)}（结束时间不计入），时区 Asia/Shanghai。示例日期事件按整日统计，取数时间：${state.manual ? 'CodeHub 未读取' : esc(data.collected)}。</p>${state.manual ? '<p>自动取数失败，当前为人工草稿；来源中的工作数量保持未知。</p>' : ''}<p>${esc(sourceSummary)}</p><p>${esc($('attention').hidden ? '' : $('attention').textContent)}</p>${evidenceItems.map((item) => `<h4>${esc(item.title)}</h4><p>${esc(item.source || 'CodeHub Issue / MR（示例）')}</p><p>${esc(item.text)}</p>`).join('')}</section>`
    const css =
      "body{max-width:1100px;margin:40px auto;padding:0 24px;font:14px/1.65 'Microsoft YaHei',sans-serif;color:#292929}h2{font-size:26px}h3{margin-top:28px}table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:10px;border:1px solid #ddd;text-align:left;vertical-align:top}th{background:#f5f5f5}.report-meta{color:#666;display:flex;flex-wrap:wrap;gap:16px}.source-note,.muted,small{color:#666;font-size:12px}.annotation{border-left:3px solid #777;padding-left:12px;margin-top:14px}.annotation p{white-space:pre-wrap}.table-scroll{overflow:auto}.badge{font-size:12px}"
    const archiveIdentity = currentArchive()
    const archiveMeta = archiveIdentity
      ? `${archiveIdentity.persistence === 'page' ? '本页结果，未保存' : '档案'} ${archiveIdentity.reportId} · 档案条目 ${archiveIdentity.id} · 修订 ${archiveIdentity.version} · 保存 ${archiveIdentity.savedAt}`
      : `当前工作稿 · 尚未归档此修订 · 导出 ${new Date().toISOString()}`
    const content = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(data.project)}周报</title><style>${css}</style></head><body><p>交互原型示例报告 · ${state.reviewed ? '报告内容已审阅' : '草稿，待审阅'} · ${state.manual ? '自动取数未完成' : '使用示例数据'}</p><p>${esc(archiveMeta)}</p><p>本机浏览器原型档案；生产保存未建。保存、审阅和导出不表示 MR 合入或目标完成。</p>${copy.innerHTML}${sources}</body></html>`
    const url = URL.createObjectURL(new Blob([content], { type: 'text/html;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${data.project}-周报-${data.start.slice(0, 10)}-修订${archiveIdentity?.version || '工作稿'}-${state.reviewed ? '已审阅' : '草稿'}.html`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify('已导出独立 HTML 示例报告。人工补充包含在报告中。')
  }

  $('reset-example').addEventListener('click', () => {
    if (session.busy) {
      return
    }
    $('storage-failure-demo').checked = false
    try {
      localStorage.removeItem(storageKey)
    } catch {
      storageProblem = '浏览器无法清除本原型存储；当前示例将仅在页面中重置。'
    }
    archives = []
    workingState = initialState()
    workingData = clone(fixture)
    selectedId = null
    pinnedSelection = false
    session.open = false
    session.failed = false
    session.scenario = 'complete'
    session.produced = false
    $('activity').hidden = true
    $('activity').innerHTML = ''
    $('editor').close()
    $('evidence').close()
    storeRevision('完整示例报告')
    render()
    notify(storageProblem || '仅本原型档案已重置，恢复完整示例报告。')
  })
  $('open-process').addEventListener('click', () => {
    if (!session.busy) {
      const latest = latestArchive()
      if (latest && selectedId !== null) {
        workingState = clone(latest.report)
        workingData = clone(latest.facts)
      }
      if (!pinnedSelection) {
        selectedId = null
      }
    }
    session.open = true
    render()
  })
  $('close-process').addEventListener('click', () => {
    session.open = false
    render()
  })
  $('generate').addEventListener('click', () => generate())
  $('retry').addEventListener('click', () => generate(true))
  $('manual').addEventListener('click', () => {
    if (session.busy) {
      return
    }
    if (!session.produced) {
      workingData = clone(fixture)
      workingState.manual = true
      workingState.generated = true
      workingState.revision += 1
    }
    selectedId = null
    pinnedSelection = false
    render()
    openEditor()
  })
  $('scenario').addEventListener('change', (event) => {
    session.scenario = event.target.value
    $('activity').hidden = true
    render()
  })
  $('save-report').addEventListener('click', () => {
    if (session.busy || selectedId !== null || !workingState.generated) {
      return
    }
    storeRevision('人工保存修订')
    render()
    notify(storageProblem || '工作稿已保存为新修订，旧版仍在档案中。')
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
    if (session.busy) {
      return
    }
    const content = $('note-content').value.trim()
    if (!content) {
      $('note-content').setCustomValidity('请输入补充内容。')
      $('note-content').reportValidity()
      return
    }
    const key = $('note-section').value
    workingState.notes[key] = content
    workingState.corrections[key] = $('note-mode').value === 'correct'
    workingState.checkedAt[key] = $('note-checked').checked ? workingState.revision : -1
    if (key === 'progress' && workingState.reportScenario === 'missing' && !workingState.manual) {
      workingState.resolved = $('resolve').checked
    }
    workingState.reviewed = false
    $('editor').close()
    storeRevision('人工补充或修正')
    render()
    notify(storageProblem || '人工修订已归档为新版，旧版内容保留。')
  })
  $('note-content').addEventListener('input', () => $('note-content').setCustomValidity(''))
  $('confirm').addEventListener('click', () => {
    if (pending() || uncheckedNotes().length || session.busy) {
      return
    }
    beginEdit()
    workingState.reviewed = true
    storeRevision('标记已审阅')
    render()
    notify(storageProblem || '本份内容已标记审阅并保存新修订；Issue 与目标验收不变。')
  })
  $('export').addEventListener('click', exportReport)
  document.addEventListener('click', (event) => {
    const archive = event.target.closest('[data-archive]')
    if (archive) {
      selectedId = archive.dataset.archive
      pinnedSelection = true
      persist()
      render()
    }
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

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
    if (saved) {
      if (
        saved.schema !== 2 ||
        !Array.isArray(saved.archives) ||
        !saved.archives.every(
          (item) =>
            typeof item.id === 'string' &&
            typeof item.version === 'number' &&
            typeof item.savedAt === 'string' &&
            validFacts(item.facts) &&
            validReport(item.report)
        ) ||
        !validFacts(saved.workingData) ||
        !validReport(saved.workingState)
      ) {
        throw new Error('invalid archive')
      }
      archives = saved.archives
      workingState = saved.workingState
      workingData = saved.workingData
      selectedId = archives.some((item) => item.id === saved.selectedId) ? saved.selectedId : null
      pinnedSelection = Boolean(saved.pinnedSelection && selectedId)
    } else {
      storeRevision('完整示例报告')
    }
  } catch {
    storageProblem = '无法读取本机原型档案；已保留浏览器原数据，请导出当前示例并检查浏览器存储。'
    const version = 1
    archives = [
      {
        id: `weekly-demo-recovery-${Date.now()}`,
        version,
        savedAt: new Date().toISOString(),
        reason: '恢复展示示例',
        reportId: fixture.reportId,
        facts: clone(fixture),
        report: clone(workingState),
        source: '本机浏览器原型示例',
        persistence: 'page'
      }
    ]
    selectedId = archives[0].id
  }
  render()
})()
