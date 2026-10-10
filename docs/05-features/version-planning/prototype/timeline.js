/* Design prototype: all edits live in this page; no project records are written. */
;(() => {
  const origin = Date.UTC(2026, 9, 12)
  const days = 42
  const dayMs = 86400000
  const dateAt = (day) => new Date(origin + day * dayMs).toISOString().slice(0, 10)
  const dayAt = (date) => Math.round((Date.parse(`${date}T00:00:00Z`) - origin) / dayMs)
  const shortDate = (day) => {
    const date = new Date(origin + day * dayMs)
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
  }
  const groups = [
    { id: 'core', title: '目标 1 · 核心流程可用', outcome: '一条完整业务流程可以独立走通' },
    { id: 'data', title: '目标 2 · 数据可核对', outcome: '关键结果有依据，重新打开后仍一致' },
    { id: 'release', title: '目标 3 · 版本可交付', outcome: '验收结论、交付材料与范围一致' }
  ]
  const iterations = [
    { start: 0, end: 4, title: '迭代前准备', goal: '目标与范围对齐' },
    { start: 5, end: 16, title: '迭代 1', goal: '核心流程走通' },
    { start: 17, end: 30, title: '迭代 2', goal: '补齐与验证' },
    { start: 31, end: 41, title: '迭代 3', goal: '验收与交付' }
  ]
  const items = [
    {
      id: 'scope',
      group: 'core',
      name: '明确流程与验收范围',
      stage: '设计',
      owner: '产品负责人',
      start: 0,
      end: 4,
      outcome: '确认本版流程、边界与验收条件'
    },
    {
      id: 'flow',
      group: 'core',
      name: '完成核心业务流程',
      stage: '开发',
      owner: '开发负责人',
      start: 5,
      end: 18,
      outcome: '主流程可运行，关键步骤有明确结果'
    },
    {
      id: 'flow-check',
      group: 'core',
      name: '核对主流程与异常处理',
      stage: '验证',
      owner: '验收负责人',
      start: 17,
      end: 29,
      outcome: '正常与异常路径均按约定工作'
    },
    {
      id: 'data-design',
      group: 'data',
      name: '确定关键数据与核对方法',
      stage: '设计',
      owner: '开发负责人',
      start: 2,
      end: 8,
      outcome: '确定数据依据和独立核对方法'
    },
    {
      id: 'data-work',
      group: 'data',
      name: '完成数据读回与结果呈现',
      stage: '开发',
      owner: '开发负责人',
      start: 12,
      end: 25,
      outcome: '关键结果来自真实读数，可独立读回'
    },
    {
      id: 'data-check',
      group: 'data',
      name: '验证重启后的数据一致性',
      stage: '验证',
      owner: '验收负责人',
      start: 25,
      end: 34,
      outcome: '重启后独立核对，关键结果一致'
    },
    {
      id: 'accept',
      group: 'release',
      name: '完成版本验收',
      stage: '验证',
      owner: '项目负责人',
      start: 31,
      end: 38,
      outcome: '逐项核对版本承诺，由人确认验收结论'
    },
    {
      id: 'handover',
      group: 'release',
      name: '准备交付材料与发布评审',
      stage: '交付',
      owner: '项目负责人',
      start: 35,
      end: 41,
      outcome: '交付材料齐备，发布评审有结论'
    }
  ]
  const milestones = [
    { id: 'scope-ready', name: '范围确认', day: 4, outcome: '版本目标、范围与验收条件经人确认' },
    {
      id: 'flow-ready',
      name: '主流程可用',
      day: 16,
      outcome: '核心流程可以完整演示，遗留项已明确'
    },
    {
      id: 'ready-to-accept',
      name: '进入验收',
      day: 30,
      outcome: '范围内交付项具备验收条件，风险已评估'
    },
    { id: 'version-ready', name: '版本交付', day: 41, outcome: '人确认版本验收结论和交付安排' }
  ]
  const grid = document.querySelector('#timeline-grid')
  const dialog = document.querySelector('#plan-editor')
  const form = document.querySelector('#editor-form')
  const collapsed = new Set()
  let scale = 'week'
  let editing = null
  const element = (tag, className, text) => {
    const node = document.createElement(tag)
    if (className) {
      node.className = className
    }
    if (text !== undefined) {
      node.textContent = text
    }
    return node
  }
  const button = (className, text, action) => {
    const node = element('button', className, text)
    node.type = 'button'
    node.addEventListener('click', action)
    return node
  }
  const row = (className, rail) => {
    const node = element('div', `timeline-row ${className}`)
    const label = element('div', 'row-rail')
    if (typeof rail === 'string') {
      label.textContent = rail
    } else {
      label.append(rail)
    }
    node.append(label)
    grid.append(node)
    return node
  }
  function render() {
    grid.replaceChildren()
    grid.style.setProperty('--chart', scale === 'week' ? '900px' : '1176px')
    grid.style.setProperty('--grid-step', `${100 / (scale === 'week' ? 6 : days)}%`)
    document.querySelector('#item-count').textContent =
      `${groups.length} 个目标 · ${items.length} 个交付项`
    const iterationRow = row('iteration-row', '版本目标 / 交付项')
    iterationRow.firstChild.classList.add('header-rail')
    const iterationTrack = element('div', 'iteration-track')
    iterations.forEach((iteration) => {
      const cell = element('div', 'iteration-cell')
      cell.style.width = `${((iteration.end - iteration.start + 1) / days) * 100}%`
      cell.append(element('strong', '', iteration.title), element('span', '', iteration.goal))
      iterationTrack.append(cell)
    })
    iterationRow.append(iterationTrack)
    const dateRow = row('date-row', '2026 年 10 月 — 11 月')
    dateRow.firstChild.classList.add('header-rail')
    const dateTrack = element('div', 'date-track')
    const step = scale === 'week' ? 7 : 1
    for (let day = 0; day < days; day += step) {
      const date = new Date(origin + day * dayMs)
      const weekend = scale === 'day' && [0, 6].includes(date.getUTCDay())
      dateTrack.append(
        element(
          'div',
          weekend ? 'weekend' : '',
          scale === 'week' ? `${shortDate(day)} — ${shortDate(day + 6)}` : shortDate(day)
        )
      )
    }
    dateRow.append(dateTrack)
    const milestoneRow = row('milestone-row', '关键里程碑')
    milestoneRow.firstChild.classList.add('header-rail')
    const milestoneTrack = element('div', 'milestone-track')
    milestoneRow.append(milestoneTrack)
    const laneEnds = []
    ;[...milestones]
      .sort((left, right) => left.day - right.day)
      .forEach((milestone) => {
        const marker = button('milestone-marker', '', () => edit('milestone', milestone))
        marker.style.left = `${((milestone.day + 0.5) / days) * 100}%`
        if (milestone.day < 3) {
          marker.classList.add('edge-start')
        }
        if (milestone.day > days - 4) {
          marker.classList.add('edge-end')
        }
        marker.append(
          element('i', 'diamond'),
          element('span', '', `${shortDate(milestone.day)} ${milestone.name}`)
        )
        marker.title = milestone.outcome
        marker.setAttribute(
          'aria-label',
          `${milestone.name}，${dateAt(milestone.day)}，${milestone.outcome}`
        )
        milestoneTrack.append(marker)
        const position = ((milestone.day + 0.5) / days) * milestoneTrack.clientWidth
        const labelWidth = marker.lastChild.getBoundingClientRect().width
        const labelStart =
          milestone.day < 3
            ? position
            : milestone.day > days - 4
              ? position - labelWidth
              : position - labelWidth / 2
        let lane = laneEnds.findIndex((end) => labelStart >= end + 12)
        if (lane === -1) {
          lane = laneEnds.length
        }
        laneEnds[lane] = labelStart + labelWidth
        marker.style.top = `${12 + lane * 48}px`
      })
    milestoneTrack.style.height = `${70 + Math.max(0, laneEnds.length - 1) * 48}px`
    groups.forEach((group) => {
      const toggle = button('group-button', '', () => {
        if (collapsed.has(group.id)) {
          collapsed.delete(group.id)
        } else {
          collapsed.add(group.id)
        }
        render()
        grid.querySelector(`[data-group="${group.id}"]`).focus()
      })
      toggle.dataset.group = group.id
      toggle.setAttribute('aria-expanded', String(!collapsed.has(group.id)))
      toggle.append(
        element('span', '', collapsed.has(group.id) ? '▸' : '▾'),
        document.createTextNode(group.title)
      )
      row('group-row', toggle).append(element('div', 'group-caption', group.outcome))
      if (collapsed.has(group.id)) {
        return
      }
      items
        .filter((item) => item.group === group.id)
        .forEach((item) => {
          const label = element('div')
          label.append(
            button('item-title', item.name, () => edit('item', item)),
            element('span', 'item-meta', `${item.stage} · ${item.owner || '待指定负责人'}`)
          )
          const itemRow = row('item-row', label)
          const track = element('div', 'bar-track')
          iterations.slice(1).forEach((iteration) => {
            const boundary = element('div', 'boundary')
            boundary.style.left = `${(iteration.start / days) * 100}%`
            track.append(boundary)
          })
          const bar = button('plan-bar', `${shortDate(item.start)} — ${shortDate(item.end)}`, () =>
            edit('item', item)
          )
          bar.dataset.stage = item.stage
          bar.style.left = `calc(${(item.start / days) * 100}% + 3px)`
          bar.style.width = `calc(${((item.end - item.start + 1) / days) * 100}% - 6px)`
          bar.title = `${item.name}\n${dateAt(item.start)} — ${dateAt(item.end)}\n${item.outcome}`
          bar.setAttribute(
            'aria-label',
            `${item.name}，${dateAt(item.start)} 至 ${dateAt(item.end)}，点击修改排期`
          )
          track.append(bar)
          itemRow.append(track)
        })
    })
  }
  function edit(kind, value) {
    editing = { kind, value }
    form.reset()
    document.querySelector('#form-error').textContent = ''
    document.querySelector('#editor-title').textContent = value
      ? `编辑${kind === 'item' ? '交付项' : '里程碑'}`
      : `新增${kind === 'item' ? '交付项' : '里程碑'}`
    document.querySelector('#editor-kind').textContent = '示例项目 · v0.6'
    document.querySelector('#item-fields').hidden = kind !== 'item'
    document.querySelector('#end-label').hidden = kind !== 'item'
    document.querySelector('#start-label').firstChild.textContent =
      kind === 'item' ? '开始日期' : '节点日期'
    form.elements.end.required = kind === 'item'
    form.elements.end.disabled = kind !== 'item'
    form.elements.name.value = value?.name || ''
    form.elements.group.value = value?.group || groups[0].id
    form.elements.stage.value = value?.stage || '开发'
    form.elements.owner.value = value?.owner || ''
    form.elements.start.value = dateAt(value ? (kind === 'item' ? value.start : value.day) : 5)
    form.elements.end.value = dateAt(value?.end ?? 16)
    form.elements.outcome.value = value?.outcome || ''
    document.querySelector('#outcome-label').firstChild.textContent =
      kind === 'item' ? '交付结果' : '达成条件'
    for (const field of [form.elements.start, form.elements.end]) {
      field.min = dateAt(0)
      field.max = dateAt(days - 1)
    }
    dialog.showModal()
    form.elements.name.focus()
  }
  groups.forEach((group) => {
    const option = element('option', '', group.title)
    option.value = group.id
    form.elements.group.append(option)
  })
  document.querySelectorAll('[data-scale]').forEach((control) =>
    control.addEventListener('click', () => {
      scale = control.dataset.scale
      document
        .querySelectorAll('[data-scale]')
        .forEach((node) => node.setAttribute('aria-pressed', String(node === control)))
      render()
    })
  )
  document.querySelector('#add-item').addEventListener('click', () => edit('item'))
  document.querySelector('#add-milestone').addEventListener('click', () => edit('milestone'))
  ;['close-editor', 'cancel-editor'].forEach((id) =>
    document.querySelector(`#${id}`).addEventListener('click', () => dialog.close())
  )
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const name = form.elements.name.value.trim()
    const outcome = form.elements.outcome.value.trim()
    const start = dayAt(form.elements.start.value)
    const end = editing.kind === 'item' ? dayAt(form.elements.end.value) : start
    if (
      !name ||
      !outcome ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end >= days ||
      end < start
    ) {
      document.querySelector('#form-error').textContent =
        '请填写名称与结果，日期须在版本周期内，结束日期不能早于开始日期。'
      return
    }
    const values =
      editing.kind === 'item'
        ? {
            name,
            outcome,
            start,
            end,
            group: form.elements.group.value,
            stage: form.elements.stage.value,
            owner: form.elements.owner.value.trim()
          }
        : { name, outcome, day: start }
    if (editing.value) {
      Object.assign(editing.value, values)
    } else {
      ;(editing.kind === 'item' ? items : milestones).push({ id: `demo-${Date.now()}`, ...values })
    }
    collapsed.delete(values.group)
    dialog.close()
    render()
    document.querySelector('#feedback').textContent = `已更新示例计划：${name}。`
  })
  render()
})()
