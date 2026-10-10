;(() => {
  const $ = (id) => document.getElementById(id)
  const clone = (value) => JSON.parse(JSON.stringify(value))
  const periods = clone(window.weeklyReports)
  const template = window.weeklyTemplate
  const storageKey = 'bw-weekly-report-fixed-template-v1'
  const esc = (value) =>
    String(value ?? '—').replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
    )
  let reports = []
  let selectedId = null
  let busy = false
  let editorBaseId = null
  let noticeTimer
  const current = () => reports.find((item) => item.id === selectedId)
  const latest = (period) => reports.findLast((item) => item.facts.period === period)
  const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const inWindow = (facts, date) =>
    date && date >= facts.start.slice(0, 10) && date < facts.endExclusive.slice(0, 10)
  const status = (value) =>
    `<span class="${value === '已关闭' ? 'status-done' : value === '阻塞' ? 'status-risk' : value === '未知' || value === '待补充' ? 'status-unknown' : ''}">${esc(value)}</span>`

  function notify(message, permanent = false) {
    clearTimeout(noticeTimer)
    $('notice').textContent = message
    $('notice').hidden = !message
    if (!permanent && message) {
      noticeTimer = setTimeout(() => {
        $('notice').hidden = true
      }, 5500)
    }
  }

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ schema: 1, reports, selectedId }))
      return true
    } catch {
      return false
    }
  }

  function addRecord(facts, notes = {}, generation = 1) {
    const record = {
      id: newId(),
      number: (latest(facts.period)?.number || 0) + 1,
      savedAt: new Date().toISOString(),
      generation,
      facts: clone(facts),
      notes: clone(notes)
    }
    reports.push(record)
    selectedId = record.id
    return { record, saved: persist() }
  }

  function rowsFor(record, key) {
    const facts = record.facts
    const goalName = (id) => facts.goals.find((goal) => goal.id === id)?.title || '待归属'
    switch (key) {
      case 'goals':
        return facts.goals.map((goal) => [
          esc(goal.title),
          esc(goal.deliverable),
          esc(goal.due),
          status(goal.status)
        ])
      case 'progress':
        return facts.progress.map((item) => [esc(item.title), esc(item.current), esc(item.next)])
      case 'risks':
        return !facts.risksKnown
          ? [[status('未知'), '待补充', '—', '—', '—', '—']]
          : facts.risks.map((item) => [
              `<span class="status-risk">${esc(item.level)}</span>`,
              esc(item.description),
              esc(item.action),
              esc(item.owner),
              esc(item.due),
              status(item.status)
            ])
      case 'milestones':
        return facts.milestones.map((item) => [
          esc(item.title),
          esc(item.due),
          esc(item.condition),
          esc(item.status)
        ])
      case 'requirements':
        return facts.issues
          .filter((item) => item.type !== '问题')
          .map((item) => [
            esc(goalName(item.goal)),
            esc(item.title),
            esc(item.due),
            esc(item.owner),
            status(item.status),
            esc(
              item.id === 101 && record.notes.progress?.mode === 'correct'
                ? '性能结论见关键进展。'
                : item.progress
            )
          ])
      case 'problems':
        return facts.issues
          .filter((item) => item.type === '问题')
          .map((item) => [
            esc(item.title),
            status(item.status),
            esc(item.owner),
            esc(item.progress),
            esc(item.next)
          ])
      case 'members':
        return facts.members.map((member) => [
          esc(member.name),
          esc(member.role),
          esc(member.scope)
        ])
      default:
        return []
    }
  }

  function problemSummary(facts) {
    if (!facts.issuesComplete) {
      return '新增：未知　关闭：未知　未关闭：未知'
    }
    const issues = [
      ...new Map(
        facts.issues.filter((item) => item.type === '问题').map((item) => [item.id, item])
      ).values()
    ]
    const added = issues.filter((item) => inWindow(facts, item.created)).length
    const closed = issues.filter((item) => inWindow(facts, item.closed)).length
    const open = issues.filter(
      (item) =>
        item.created < facts.endExclusive.slice(0, 10) &&
        (!item.closed || item.closed >= facts.endExclusive.slice(0, 10))
    ).length
    return `本周新增 ${added} 单　关闭 ${closed} 单　期末未关闭 ${open} 单`
  }

  function renderSection(record, definition) {
    const rows = rowsFor(record, definition.key)
    const note = record.notes[definition.key]
    const columns = definition.columns.length
    const noteRow = note
      ? `<tr class="note-row"><td colspan="${columns}" class="manual-text"><div>${esc(note.text)}</div></td></tr>`
      : ''
    const body =
      note?.mode === 'correct'
        ? noteRow
        : (rows.length
            ? rows
                .map((row) => `<tr>${row.map((value) => `<td>${value}</td>`).join('')}</tr>`)
                .join('')
            : `<tr>${definition.columns.map(() => '<td>—</td>').join('')}</tr>`) + noteRow
    const summary =
      definition.key === 'problems' && note?.mode !== 'correct'
        ? `<p class="section-summary">${esc(problemSummary(record.facts))}</p>`
        : ''
    return `<section><h2>${esc(definition.title)}</h2>${summary}<table><colgroup>${definition.widths.map((width) => `<col style="width:${width}%">`).join('')}</colgroup><thead><tr>${definition.columns.map((column) => `<th scope="col">${esc(column)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></section>`
  }

  function render() {
    const record = current()
    const samePeriod = reports.filter((item) => item.facts.period === record.facts.period)
    const newest = samePeriod.at(-1)
    $('period').value = record.facts.period
    $('version').innerHTML = samePeriod
      .toReversed()
      .map(
        (item) =>
          `<option value="${esc(item.id)}">${item.id === newest.id ? '当前' : `第${item.number}版`}</option>`
      )
      .join('')
    $('version').value = record.id
    $('period').disabled = busy
    $('version').disabled = busy
    $('update').disabled = busy
    $('supplement').disabled = busy
    $('update').textContent = busy ? '更新中…' : '更新周报'
    const facts = record.facts
    $('report').innerHTML =
      `<h1>${esc(facts.project)}项目周报</h1><div class="report-meta"><span>${esc(facts.label)}</span><span>${esc(facts.projectVersion)}</span><span>维护人：${esc(facts.owner)}</span></div>${template.sections.map((definition) => renderSection(record, definition)).join('')}`
  }

  async function updateReport() {
    if (busy) {
      return
    }
    const period = current().facts.period
    const previous = latest(period)
    busy = true
    notify('')
    render()
    try {
      await new Promise((resolve) => setTimeout(resolve, 700))
      const facts = periods.find((item) => item.period === period)
      if (!facts) {
        throw new Error('missing report facts')
      }
      const notes = clone(previous.notes)
      Object.values(notes).forEach((note) => {
        note.checked = false
      })
      const result = addRecord(facts, notes, previous.generation + 1)
      busy = false
      render()
      if (!result.saved) {
        notify('未能保存，可导出当前周报。', true)
      } else {
        notify(Object.keys(notes).length ? '已更新，人工修订待核对。' : '周报已更新。')
      }
    } catch {
      busy = false
      render()
      notify('更新失败，原周报已保留。', true)
    }
  }

  function fillEditor(key) {
    const note = reports.find((item) => item.id === editorBaseId).notes[key]
    $('note-mode').value = note?.mode || 'append'
    $('note-content').value = note?.text || ''
    $('note-checked').checked = Boolean(note?.checked)
  }

  $('update').addEventListener('click', updateReport)
  $('period').addEventListener('change', (event) => {
    if (busy) {
      return
    }
    selectedId = latest(event.target.value).id
    const saved = persist()
    notify(saved ? '' : '未能保存，可导出当前周报。', !saved)
    render()
  })
  $('version').addEventListener('change', (event) => {
    if (busy || !reports.some((item) => item.id === event.target.value)) {
      return
    }
    selectedId = event.target.value
    const saved = persist()
    notify(saved ? '' : '未能保存，可导出当前周报。', !saved)
    render()
  })
  $('supplement').addEventListener('click', () => {
    if (busy) {
      return
    }
    editorBaseId = current().id
    $('note-section').value = 'progress'
    fillEditor('progress')
    $('editor').showModal()
  })
  $('note-section').addEventListener('change', (event) => fillEditor(event.target.value))
  $('note-content').addEventListener('input', () => $('note-content').setCustomValidity(''))
  $('edit-form').addEventListener('submit', (event) => {
    event.preventDefault()
    if (busy) {
      return
    }
    const text = $('note-content').value.trim()
    if (!text) {
      $('note-content').setCustomValidity('请输入内容。')
      $('note-content').reportValidity()
      return
    }
    const base = reports.find((item) => item.id === editorBaseId)
    const notes = clone(base.notes)
    notes[$('note-section').value] = {
      text,
      mode: $('note-mode').value,
      author: base.facts.owner,
      savedAt: new Date().toISOString(),
      checked: $('note-checked').checked
    }
    const result = addRecord(base.facts, notes, base.generation)
    $('editor').close()
    render()
    notify(result.saved ? '已保存。' : '未能保存，可导出当前周报。', !result.saved)
  })
  document.addEventListener('click', (event) => {
    const close = event.target.closest('[data-close]')
    if (close) {
      $(close.dataset.close).close()
    }
  })
  $('export').addEventListener('click', () => {
    const record = clone(current())
    const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(record.facts.project)}项目周报</title><style>body{margin:24px auto;max-width:1440px;padding:0 16px}${$('report-theme').textContent}</style></head><body><article class="weekly-report">${$('report').innerHTML}</article></body></html>`
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${record.facts.project}-周报-${record.facts.period}-第${record.number}版.html`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify('已导出。')
  })

  function validFacts(facts) {
    return Boolean(
      facts &&
      typeof facts.period === 'string' &&
      typeof facts.project === 'string' &&
      typeof facts.start === 'string' &&
      typeof facts.endExclusive === 'string' &&
      Array.isArray(facts.goals) &&
      facts.goals.every((item) => item && typeof item.title === 'string') &&
      Array.isArray(facts.progress) &&
      facts.progress.every((item) => item && typeof item.title === 'string') &&
      Array.isArray(facts.risks) &&
      facts.risks.every((item) => item && typeof item.description === 'string') &&
      Array.isArray(facts.milestones) &&
      facts.milestones.every((item) => item && typeof item.title === 'string') &&
      Array.isArray(facts.issues) &&
      facts.issues.every(
        (item) => item && typeof item.title === 'string' && typeof item.created === 'string'
      ) &&
      Array.isArray(facts.members) &&
      facts.members.every((item) => item && typeof item.name === 'string')
    )
  }

  $('period').innerHTML = periods
    .map((item) => `<option value="${esc(item.period)}">${esc(item.label)}</option>`)
    .join('')
  $('note-section').innerHTML = template.sections
    .map(
      (section) =>
        `<option value="${esc(section.key)}">${esc(section.title.replace(/^[一二三四五六七]、/, ''))}</option>`
    )
    .join('')
  let initialMessage = ''
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
    if (saved) {
      if (
        saved.schema !== 1 ||
        !Array.isArray(saved.reports) ||
        saved.reports.length === 0 ||
        !saved.reports.every(
          (item) =>
            typeof item.id === 'string' &&
            Number.isInteger(item.number) &&
            typeof item.savedAt === 'string' &&
            typeof item.generation === 'number' &&
            validFacts(item.facts) &&
            item.notes &&
            Object.entries(item.notes).every(
              ([key, note]) =>
                template.sections.some((section) => section.key === key) &&
                note &&
                typeof note.text === 'string' &&
                ['append', 'correct'].includes(note.mode)
            )
        ) ||
        !periods.every((period) =>
          saved.reports.some((item) => item.facts.period === period.period)
        )
      ) {
        throw new Error('invalid stored report')
      }
      reports = saved.reports
      selectedId = reports.some((item) => item.id === saved.selectedId)
        ? saved.selectedId
        : reports.at(-1).id
    } else {
      periods.toReversed().forEach((facts) => {
        reports.push({
          id: newId(),
          number: 1,
          savedAt: new Date().toISOString(),
          generation: 1,
          facts: clone(facts),
          notes: {}
        })
      })
      selectedId = reports.at(-1).id
      if (!persist()) {
        initialMessage = '未能保存，可导出当前周报。'
      }
    }
  } catch {
    reports = periods.toReversed().map((facts) => ({
      id: newId(),
      number: 1,
      savedAt: new Date().toISOString(),
      generation: 1,
      facts: clone(facts),
      notes: {}
    }))
    selectedId = reports.at(-1).id
    initialMessage = '暂未恢复已保存内容。'
  }
  render()
  if (initialMessage) {
    notify(initialMessage, true)
  }
})()
