/* Design prototype: all edits live in this page; no project records are written. */
;(() => {
  const origin = Date.UTC(2026, 9, 12)
  const days = 42
  const dateAt = (day) => new Date(origin + day * 86400000).toISOString().slice(0, 10)
  const dayAt = (date) => Math.round((Date.parse(`${date}T00:00:00Z`) - origin) / 86400000)
  const shortDate = (day) => dateAt(day).slice(5).replace('-', '/')
  const $ = (selector) => document.querySelector(selector)
  const grid = $('#timeline-grid')
  const scroller = $('.timeline-scroll')
  const dialog = $('#plan-editor')
  const form = $('#editor-form')
  const bulk = $('#bulk-form')
  let state = {
    groups: [],
    items: [],
    milestones: [],
    iterations: [{ title: '迭代 1', outcome: '', start: 0, end: 41 }],
    changes: [],
    mode: 'empty'
  }
  const history = []
  const selected = new Set()
  const collapsed = new Set()
  let scale = 'week'
  let sequence = 0
  let editing
  let cancelGesture
  const id = () => `entry-${++sequence}`
  const snapshot = () => structuredClone(state)
  const feedback = (message) => {
    $('#feedback').textContent = message
  }
  const element = (tag, className = '', text = '') => {
    const node = document.createElement(tag)
    node.className = className
    node.textContent = text
    return node
  }
  const button = (className, text, action) => {
    const node = element('button', className, text)
    node.type = 'button'
    if (action) {
      node.addEventListener('click', action)
    }
    return node
  }
  const row = (className, content) => {
    const node = element('div', `timeline-row ${className}`)
    const rail = element('div', 'row-rail')
    rail.append(typeof content === 'string' ? document.createTextNode(content) : content)
    node.append(rail)
    grid.append(node)
    return node
  }
  const scheduled = (item) => Number.isInteger(item.start) && Number.isInteger(item.end)
  function commit(before, message) {
    history.push(before)
    if (history.length > 30) {
      history.shift()
    }
    state.changes.push(message)
    render()
    feedback(`${message}；可撤销。`)
  }
  function undo() {
    if (cancelGesture) {
      cancelGesture()
      return
    }
    if (!history.length) {
      return
    }
    state = history.pop()
    selected.clear()
    render()
    feedback('已撤销上一步。')
  }
  function selectItem(item, extend) {
    if (!extend) {
      selected.clear()
    }
    if (extend && selected.has(item.id)) {
      selected.delete(item.id)
    } else {
      selected.add(item.id)
    }
    refreshSelection()
  }
  function refreshSelection() {
    $('#selection-toolbar').hidden = !selected.size
    $('#selection-count').textContent = `已选 ${selected.size} 项`
    grid.querySelectorAll('[data-item]').forEach((node) => {
      node.classList.toggle('selected', selected.has(node.dataset.item))
      node.setAttribute('aria-pressed', String(selected.has(node.dataset.item)))
    })
  }
  function positionBar(node, item) {
    if (!node) {
      return
    }
    node.style.left = `calc(${(item.start / days) * 100}% + 3px)`
    node.style.width = `calc(${((item.end - item.start + 1) / days) * 100}% - 6px)`
    const label = node.querySelector('.bar-label')
    if (label) {
      label.textContent = `${shortDate(item.start)} — ${shortDate(item.end)}`
    }
    node.title = `${item.name || ''}\n${dateAt(item.start)} — ${dateAt(item.end)}`
  }
  const pointDay = (event, track) =>
    Math.max(
      0,
      Math.min(
        days - 1,
        Math.floor(
          (event.clientX - track.getBoundingClientRect().left) / (track.clientWidth / days)
        )
      )
    )
  function gesture(event, node, track, preview, message, cleanup = () => {}) {
    if (event.button !== 0 || event.shiftKey || cancelGesture) {
      cleanup()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const before = snapshot()
    const initialX = event.clientX
    const initialScroll = scroller.scrollLeft
    const dayWidth = track.clientWidth / days
    let current = event
    let started = false
    let invalid = ''
    let frame
    let active = true
    node.setPointerCapture(event.pointerId)
    node.classList.add('dragging')
    const update = () => {
      const delta = Math.round(
        (current.clientX - initialX + scroller.scrollLeft - initialScroll) / dayWidth
      )
      try {
        invalid = preview(delta, pointDay(current, track)) || ''
      } catch {
        invalid = '无法完成调整，请重新尝试'
      }
      node.classList.toggle('invalid', Boolean(invalid))
    }
    const move = (next) => {
      if (next.pointerId !== event.pointerId) {
        return
      }
      current = next
      if (Math.abs(next.clientX - initialX) > 3) {
        started = true
      }
      if (started) {
        update()
      }
    }
    const autoScroll = () => {
      if (!active) {
        return
      }
      if (started) {
        const rect = scroller.getBoundingClientRect()
        const railWidth = grid.firstChild.firstChild.clientWidth
        if (current.clientX > rect.right - 28) {
          scroller.scrollLeft += 10
        } else if (current.clientX < rect.left + railWidth + 20) {
          scroller.scrollLeft -= 10
        }
        update()
      }
      frame = requestAnimationFrame(autoScroll)
    }
    const finish = (cancelled) => {
      if (!active) {
        return
      }
      active = false
      cancelAnimationFrame(frame)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', up)
      node.removeEventListener('pointercancel', cancel)
      node.removeEventListener('lostpointercapture', cancel)
      if (node.hasPointerCapture(event.pointerId)) {
        node.releasePointerCapture(event.pointerId)
      }
      cancelGesture = undefined
      node.classList.remove('dragging', 'invalid')
      cleanup()
      if (cancelled || invalid) {
        state = before
        render()
        feedback(cancelled ? '已取消拖动。' : `${invalid}；整次调整已取消。`)
      } else if (JSON.stringify(state) !== JSON.stringify(before)) {
        node.dataset.dragged = 'true'
        commit(before, message)
      }
    }
    const up = (next) => {
      if (next.pointerId !== event.pointerId) {
        return
      }
      move(next)
      if (started) {
        update()
      }
      finish(false)
    }
    const cancel = (next) => {
      if (next && next.pointerId !== event.pointerId) {
        return
      }
      finish(true)
    }
    cancelGesture = cancel
    node.addEventListener('pointermove', move)
    node.addEventListener('pointerup', up)
    node.addEventListener('pointercancel', cancel)
    node.addEventListener('lostpointercapture', cancel)
    frame = requestAnimationFrame(autoScroll)
  }
  function render() {
    if (cancelGesture) {
      cancelGesture()
      return
    }
    const { groups, iterations, items, milestones } = state
    grid.replaceChildren()
    grid.style.setProperty('--chart', scale === 'day' ? '1344px' : '900px')
    grid.style.setProperty('--grid-step', `${100 / (scale === 'day' ? 42 : 6)}%`)
    const count = items.filter(scheduled).length
    $('#item-count').textContent = `${items.length} 个交付项 · ${items.length - count} 个未排期`
    $('#undo-plan').disabled = !history.length
    $('#source-description').textContent =
      state.mode === 'empty'
        ? '空画布起步：先带入工作，再安排时段。'
        : 'Agent 初稿示意：预置草案，可继续调整；未调用模型。'
    $('#start-empty').setAttribute('aria-pressed', String(state.mode === 'empty'))
    $('#start-draft').setAttribute('aria-pressed', String(state.mode === 'draft'))
    const iterationRow = row('iteration-row', '目标 / 交付项')
    const iterationTrack = element('div', 'iteration-track')
    iterationRow.append(iterationTrack)
    iterations.forEach((iteration, index) => {
      const cell = element('div', 'iteration-cell')
      cell.style.width = `${((iteration.end - iteration.start + 1) / days) * 100}%`
      cell.append(
        button('iteration-title', iteration.title, () => edit('iteration', iteration)),
        element('span', '', iteration.outcome || '点击补充迭代目标')
      )
      if (index < iterations.length - 1) {
        const handle = button('iteration-handle', '', () => {})
        handle.title = '拖动调整迭代边界；交付项日期不变'
        handle.setAttribute('aria-label', `调整${iteration.title}边界`)
        handle.addEventListener('dblclick', () => edit('boundary', iteration))
        handle.addEventListener('pointerdown', (event) => {
          const next = iterations[index + 1]
          const originalEnd = iteration.end
          gesture(
            event,
            handle,
            iterationTrack,
            (delta) => {
              const end = originalEnd + delta
              if (end < iteration.start || end >= next.end) {
                return '每个迭代至少保留一天'
              }
              iteration.end = end
              next.start = end + 1
              cell.style.width = `${((end - iteration.start + 1) / days) * 100}%`
              iterationTrack.children[index + 1].style.width =
                `${((next.end - next.start + 1) / days) * 100}%`
            },
            '调整迭代边界（交付项日期不变）'
          )
        })
        cell.append(handle)
      }
      iterationTrack.append(cell)
    })
    const dateRow = row('date-row', '2026 年 10 月 — 11 月')
    const dateTrack = element('div', 'date-track')
    for (let day = 0; day < days; day += scale === 'week' ? 7 : 1) {
      dateTrack.append(
        element(
          'div',
          '',
          scale === 'week' ? `${shortDate(day)} — ${shortDate(day + 6)}` : shortDate(day)
        )
      )
    }
    dateRow.append(dateTrack)
    const milestoneRow = row('milestone-row', '关键里程碑 · 双击空白处添加')
    const milestoneTrack = element('div', 'milestone-track')
    milestoneRow.append(milestoneTrack)
    milestoneTrack.addEventListener('dblclick', (event) => {
      if (!event.target.closest('button')) {
        edit('milestone', undefined, pointDay(event, milestoneTrack))
      }
    })
    if (!milestones.length) {
      milestoneTrack.append(element('span', 'track-hint', '双击日期位置，放下一个里程碑'))
    }
    const laneEnds = []
    ;[...milestones]
      .sort((a, b) => a.day - b.day)
      .forEach((milestone) => {
        const marker = button('milestone-marker', '', () => {
          if (!marker.dataset.dragged) {
            edit('milestone', milestone)
          }
        })
        marker.style.left = `${((milestone.day + 0.5) / days) * 100}%`
        marker.classList.toggle('edge-start', milestone.day < 3)
        marker.classList.toggle('edge-end', milestone.day > days - 4)
        marker.append(
          element('i', 'diamond'),
          element('span', '', `${shortDate(milestone.day)} ${milestone.name}`)
        )
        marker.setAttribute(
          'aria-label',
          `${milestone.name}，${dateAt(milestone.day)}，点击编辑或拖动日期`
        )
        marker.addEventListener('pointerdown', (event) => {
          const originalDay = milestone.day
          gesture(
            event,
            marker,
            milestoneTrack,
            (delta) => {
              const day = originalDay + delta
              if (day < 0 || day >= days) {
                return '里程碑超出版本周期'
              }
              milestone.day = day
              marker.style.left = `${((day + 0.5) / days) * 100}%`
              marker.lastChild.textContent = `${shortDate(day)} ${milestone.name}`
            },
            `移动里程碑「${milestone.name}」`
          )
        })
        milestoneTrack.append(marker)
        const position = ((milestone.day + 0.5) / days) * milestoneTrack.clientWidth
        const width = marker.lastChild.getBoundingClientRect().width
        const start =
          milestone.day < 3
            ? position
            : milestone.day > days - 4
              ? position - width
              : position - width / 2
        let lane = laneEnds.findIndex((end) => start >= end + 12)
        if (lane < 0) {
          lane = laneEnds.length
        }
        laneEnds[lane] = start + width
        marker.style.top = `${12 + lane * 48}px`
      })
    milestoneTrack.style.height = `${70 + Math.max(0, laneEnds.length - 1) * 48}px`
    groups.forEach((group) => {
      const rail = element('div', 'group-rail')
      const toggle = button(
        'group-button',
        `${collapsed.has(group.id) ? '▸' : '▾'} ${group.title}`,
        () => {
          if (collapsed.has(group.id)) {
            collapsed.delete(group.id)
          } else {
            collapsed.add(group.id)
          }
          render()
        }
      )
      toggle.setAttribute('aria-expanded', String(!collapsed.has(group.id)))
      rail.append(
        toggle,
        button('text-action', '编辑', () => edit('group', group))
      )
      row('group-row', rail).append(
        element('div', 'group-caption', group.outcome || '目标结果待补充')
      )
      if (collapsed.has(group.id)) {
        return
      }
      items
        .filter((item) => item.group === group.id)
        .forEach((item) => {
          const label = element('div')
          const title = button('item-title', item.name, (event) => selectItem(item, event.shiftKey))
          title.dataset.item = item.id
          title.addEventListener('dblclick', () => edit('item', item))
          label.append(
            title,
            element(
              'span',
              'item-meta',
              `${scheduled(item) ? item.stage : '未排期'} · ${item.owner || '待指定负责人'}`
            ),
            button('item-detail', '日期 / 详情', () => edit('item', item))
          )
          const itemRow = row('item-row', label)
          const track = element('div', 'bar-track')
          itemRow.append(track)
          iterations.slice(1).forEach((iteration) => {
            const boundary = element('div', 'boundary')
            boundary.style.left = `${(iteration.start / days) * 100}%`
            track.append(boundary)
          })
          if (!scheduled(item)) {
            const precise = element(
              'span',
              'unscheduled-item',
              '在这一行拖出时段，或从左侧填写日期'
            )
            track.append(precise)
            track.addEventListener('pointerdown', (event) => {
              if (event.target.closest('button') || event.shiftKey || event.button !== 0) {
                return
              }
              const anchor = pointDay(event, track)
              const ghost = element('div', 'plan-bar ghost')
              track.append(ghost)
              positionBar(ghost, { start: anchor, end: anchor })
              gesture(
                event,
                track,
                track,
                (_delta, point) => {
                  item.start = Math.min(anchor, point)
                  item.end = Math.max(anchor, point)
                  positionBar(ghost, item)
                },
                `安排「${item.name}」`,
                () => ghost.remove()
              )
            })
          } else {
            const bar = button('plan-bar', '', (event) => {
              if (!bar.dataset.dragged) {
                selectItem(item, event.shiftKey)
              }
            })
            bar.dataset.item = item.id
            bar.dataset.stage = item.stage
            bar.append(
              element('span', 'resize-start'),
              element('span', 'bar-label'),
              element('span', 'resize-end')
            )
            positionBar(bar, item)
            bar.setAttribute(
              'aria-label',
              `${item.name}，${dateAt(item.start)} 至 ${dateAt(item.end)}，双击编辑`
            )
            bar.addEventListener('dblclick', () => edit('item', item))
            bar.addEventListener('pointerdown', (event) => {
              if (event.shiftKey) {
                return
              }
              const edge = event.target.classList.contains('resize-start')
                ? 'start'
                : event.target.classList.contains('resize-end')
                  ? 'end'
                  : ''
              if (!selected.has(item.id)) {
                selected.clear()
                selected.add(item.id)
              }
              const moving = edge
                ? [item]
                : state.items.filter((entry) => selected.has(entry.id) && scheduled(entry))
              const originals = moving.map((entry) => ({
                entry,
                start: entry.start,
                end: entry.end
              }))
              gesture(
                event,
                bar,
                track,
                (delta) => {
                  const proposals = originals.map(({ entry, start, end }) => ({
                    entry,
                    start: start + (edge === 'end' ? 0 : delta),
                    end: end + (edge === 'start' ? 0 : delta)
                  }))
                  if (
                    proposals.some(
                      (entry) => entry.start < 0 || entry.end >= days || entry.start > entry.end
                    )
                  ) {
                    return '时段不能倒置或超出版本周期'
                  }
                  proposals.forEach(({ entry, start, end }) => {
                    Object.assign(entry, { start, end })
                    positionBar(grid.querySelector(`.plan-bar[data-item="${entry.id}"]`), entry)
                  })
                },
                edge
                  ? `调整「${item.name}」${edge === 'start' ? '开始' : '结束'}日期`
                  : `移动 ${moving.length} 个交付项`
              )
            })
            track.append(bar)
          }
        })
    })
    if (!items.length) {
      const empty = row('empty-row', '尚未带入交付项')
      empty.append(
        element(
          'div',
          'empty-canvas',
          '粘贴一列交付项，或从 Agent 初稿示意开始。日期、负责人和结果可以随后补充。'
        )
      )
    }
    refreshSelection()
  }
  function fillGroups(select) {
    select.replaceChildren()
    state.groups.forEach((group) => {
      const option = element('option', '', group.title)
      option.value = group.id
      select.append(option)
    })
  }
  function edit(kind, value, point = 5) {
    editing = { kind, value }
    form.reset()
    fillGroups(form.elements.group)
    const labels = {
      item: '交付项',
      milestone: '里程碑',
      group: '版本目标',
      iteration: '迭代目标',
      boundary: '迭代边界'
    }
    $('#editor-title').textContent = `${value ? '编辑' : '新增'}${labels[kind]}`
    $('#editor-kind').textContent = '示例项目 · v0.6'
    $('#form-error').textContent = ''
    $('#item-fields').hidden = kind !== 'item'
    $('#start-label').hidden = ['group', 'iteration'].includes(kind)
    $('#end-label').hidden = kind !== 'item'
    $('#start-label').firstChild.textContent =
      kind === 'item' ? '开始日期' : kind === 'boundary' ? '本迭代结束日期' : '节点日期'
    $('#outcome-label').hidden = kind === 'boundary'
    $('#outcome-label').firstChild.textContent = kind === 'milestone' ? '达成条件' : '交付结果'
    form.elements.start.disabled = ['group', 'iteration'].includes(kind)
    form.elements.start.required = kind !== 'item'
    form.elements.end.disabled = kind !== 'item'
    form.elements.end.required = false
    form.elements.name.value = value?.name || value?.title || ''
    form.elements.name.disabled = kind === 'boundary'
    form.elements.group.value = value?.group || state.groups[0]?.id || ''
    form.elements.stage.value = value?.stage || '开发'
    form.elements.owner.value = value?.owner || ''
    form.elements.start.value = dateAt(
      kind === 'boundary'
        ? value.end
        : kind === 'milestone'
          ? (value?.day ?? point)
          : (value?.start ?? point)
    )
    form.elements.end.value = dateAt(value?.end ?? point + 4)
    if (kind === 'item' && !scheduled(value)) {
      form.elements.start.value = ''
      form.elements.end.value = ''
    }
    form.querySelector('.editor-note').textContent =
      kind === 'item'
        ? '两日期留空表示未排期；安排时段须填写完整起止日期。本页修改仅在内存。'
        : '本页修改仅用于原型演示，刷新后恢复空画布。'
    form.elements.outcome.value = value?.outcome || ''
    for (const field of [form.elements.start, form.elements.end]) {
      field.min = dateAt(0)
      field.max = dateAt(days - 1)
    }
    dialog.showModal()
    ;(kind === 'boundary' ? form.elements.start : form.elements.name).focus()
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const { kind, value } = editing
    const name = form.elements.name.value.trim()
    const outcome = form.elements.outcome.value.trim()
    const start = dayAt(form.elements.start.value)
    const end = dayAt(form.elements.end.value)
    const noDates = kind === 'item' && !form.elements.start.value && !form.elements.end.value
    if (
      !name ||
      (!noDates &&
        ['item', 'milestone', 'boundary'].includes(kind) &&
        (!Number.isInteger(start) || start < 0 || start >= days)) ||
      (kind === 'item' && !noDates && (!Number.isInteger(end) || end < start || end >= days))
    ) {
      $('#form-error').textContent = '请填写名称，并确保日期在版本周期内且结束不早于开始。'
      return
    }
    if (kind === 'boundary') {
      const next = state.iterations[state.iterations.indexOf(value) + 1]
      if (start < value.start || start >= next.end) {
        $('#form-error').textContent = '每个迭代至少保留一天。'
        return
      }
    }
    const before = snapshot()
    if (kind === 'item') {
      Object.assign(value, {
        name,
        outcome,
        start: noDates ? null : start,
        end: noDates ? null : end,
        group: form.elements.group.value,
        stage: form.elements.stage.value,
        owner: form.elements.owner.value.trim()
      })
    } else if (kind === 'milestone') {
      if (value) {
        Object.assign(value, { name, outcome, day: start })
      } else {
        state.milestones.push({ id: id(), name, outcome, day: start })
      }
    } else if (kind === 'boundary') {
      value.end = start
      state.iterations[state.iterations.indexOf(value) + 1].start = start + 1
    } else if (value) {
      Object.assign(value, { title: name, outcome })
    } else {
      state.groups.push({ id: id(), title: name, outcome })
    }
    dialog.close()
    commit(
      before,
      `更新${kind === 'item' ? '交付项' : kind === 'milestone' ? '里程碑' : kind === 'boundary' ? '迭代边界' : '目标'}「${name}」`
    )
  })
  $('#add-goal').addEventListener('click', () => edit('group'))
  $('#add-iteration').addEventListener('click', () => {
    const last = state.iterations.at(-1)
    if (last.end - last.start < 1) {
      feedback('末尾迭代不足两天，无法继续拆分。')
      return
    }
    const before = snapshot()
    const end = last.end
    last.end = Math.floor((last.start + end) / 2)
    state.iterations.push({
      title: `迭代 ${state.iterations.length + 1}`,
      outcome: '',
      start: last.end + 1,
      end
    })
    commit(before, '拆分末尾迭代；可拖动分界继续调整')
  })
  $('#add-item').addEventListener('click', () => {
    bulk.reset()
    fillGroups(bulk.elements.group)
    if (!state.groups.length) {
      const option = element('option', '', '未分组交付项（自动建立）')
      option.value = ''
      bulk.elements.group.append(option)
    }
    $('#bulk-preview').textContent = '等待带入内容'
    $('#bulk-editor').showModal()
    bulk.elements.lines.focus()
  })
  const lines = () =>
    bulk.elements.lines.value
      .split(/\r?\n/)
      .map((line) => line.split('\t')[0].trim())
      .filter(Boolean)
  bulk.elements.lines.addEventListener('input', () => {
    const entries = lines()
    $('#bulk-preview').textContent =
      entries.length > 100
        ? '一次最多带入 100 项，请减少清单。'
        : `${entries.length} 个未排期交付项：${entries.slice(0, 3).join('、')}${entries.length > 3 ? '…' : ''}`
  })
  bulk.addEventListener('submit', (event) => {
    event.preventDefault()
    const entries = lines()
    if (!entries.length || entries.length > 100) {
      $('#bulk-preview').textContent = '请带入 1—100 个非空交付项。'
      return
    }
    const before = snapshot()
    let group = bulk.elements.group.value
    if (!group) {
      group = id()
      state.groups.push({ id: group, title: '未分组交付项', outcome: '' })
    }
    entries.forEach((name) =>
      state.items.push({
        id: id(),
        name,
        group,
        stage: '开发',
        owner: '',
        outcome: '',
        start: null,
        end: null
      })
    )
    $('#bulk-editor').close()
    commit(before, `带入 ${entries.length} 个未排期交付项`)
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
  document
    .querySelectorAll('[data-close]')
    .forEach((control) =>
      control.addEventListener('click', () =>
        document.getElementById(control.dataset.close).close()
      )
    )
  ;['close-editor', 'cancel-editor'].forEach((key) =>
    $(`#${key}`).addEventListener('click', () => dialog.close())
  )
  $('#undo-plan').addEventListener('click', undo)
  $('#clear-selection').addEventListener('click', () => {
    selected.clear()
    refreshSelection()
  })
  document.querySelectorAll('[data-shift]').forEach((control) =>
    control.addEventListener('click', () => {
      const moving = state.items.filter((item) => selected.has(item.id) && scheduled(item))
      if (!moving.length) {
        feedback('所选交付项尚未排期，请先拖出时段。')
        return
      }
      const delta = Number(control.dataset.shift)
      if (moving.some((item) => item.start + delta < 0 || item.end + delta >= days)) {
        feedback('至少一项会超出版本周期，整组未移动。')
        return
      }
      const before = snapshot()
      moving.forEach((item) => {
        item.start += delta
        item.end += delta
      })
      commit(before, `成组移动 ${moving.length} 个已排期交付项；未排期项保持待安排`)
    })
  )
  $('#unschedule').addEventListener('click', () => {
    const moving = state.items.filter((item) => selected.has(item.id) && scheduled(item))
    if (!moving.length) {
      feedback('所选交付项已经处于未排期区。')
      return
    }
    const before = snapshot()
    moving.forEach((item) => {
      item.start = null
      item.end = null
    })
    commit(before, `移回 ${moving.length} 个交付项到未排期区`)
  })
  function start(mode) {
    const before = snapshot()
    state = {
      groups: [],
      items: [],
      milestones: [],
      iterations: [{ title: '迭代 1', outcome: '', start: 0, end: 41 }],
      changes: [],
      mode
    }
    if (mode === 'draft') {
      state.groups = [
        { id: 'core', title: '核心流程可用', outcome: '完整业务流程可以独立走通' },
        { id: 'data', title: '数据可核对', outcome: '重启后关键结果一致' },
        { id: 'release', title: '版本可交付', outcome: '验收结论与范围一致' }
      ]
      state.iterations = [
        { title: '迭代前准备', outcome: '范围对齐', start: 0, end: 4 },
        { title: '迭代 1', outcome: '核心流程走通', start: 5, end: 16 },
        { title: '迭代 2', outcome: '补齐与验证', start: 17, end: 30 },
        { title: '迭代 3', outcome: '验收与交付', start: 31, end: 41 }
      ]
      state.items = [
        { id: 'scope', group: 'core', name: '明确流程与验收范围', stage: '设计', start: 0, end: 4 },
        { id: 'flow', group: 'core', name: '完成核心业务流程', stage: '开发', start: 5, end: 18 },
        {
          id: 'check',
          group: 'core',
          name: '核对主流程与异常处理',
          stage: '验证',
          start: 17,
          end: 29
        },
        {
          id: 'data-work',
          group: 'data',
          name: '完成数据读回与结果呈现',
          stage: '开发',
          start: 12,
          end: 25
        },
        {
          id: 'restart',
          group: 'data',
          name: '验证重启后的数据一致性',
          stage: '验证',
          start: null,
          end: null
        },
        { id: 'accept', group: 'release', name: '完成版本验收', stage: '验证', start: 31, end: 38 },
        {
          id: 'handover',
          group: 'release',
          name: '准备交付材料与发布评审',
          stage: '交付',
          start: null,
          end: null
        }
      ].map((item) => ({ owner: '', outcome: '', ...item }))
      state.milestones = [
        { id: 'm1', name: '范围确认', day: 4, outcome: '' },
        { id: 'm2', name: '核心流程可用', day: 18, outcome: '' },
        { id: 'm3', name: '版本评审', day: 41, outcome: '' }
      ]
    }
    selected.clear()
    collapsed.clear()
    commit(before, mode === 'draft' ? '载入预置 Agent 初稿示意（未调用模型）' : '从空画布重新开始')
  }
  $('#start-empty').addEventListener('click', () => start('empty'))
  $('#start-draft').addEventListener('click', () => start('draft'))
  $('#collaborate').addEventListener('click', () => {
    const { groups, items, iterations, milestones } = state
    const request = [
      '请协助完善示例项目 v0.6 的版本计划。',
      `计划周期：${dateAt(0)} 至 ${dateAt(days - 1)}。起点：${state.mode === 'draft' ? '预置 Agent 初稿示意，未调用模型' : '空画布人工编排'}。`,
      '\n迭代：',
      ...iterations.map(
        (entry) =>
          `- ${entry.title}：${dateAt(entry.start)} 至 ${dateAt(entry.end)}；目标：${entry.outcome || '待补充'}`
      ),
      '\n版本目标与交付项：',
      ...groups.flatMap((group) => [
        `- ${group.title}；目标结果：${group.outcome || '待补充'}`,
        ...items
          .filter((item) => item.group === group.id)
          .map(
            (item) =>
              `  - ${item.name}；${scheduled(item) ? `${dateAt(item.start)} 至 ${dateAt(item.end)}` : '未排期'}；负责人：${item.owner || '待指定'}；交付结果：${item.outcome || '待补充'}`
          )
      ]),
      '\n里程碑：',
      ...(milestones.length
        ? milestones.map(
            (entry) =>
              `- ${dateAt(entry.day)} ${entry.name}；达成条件：${entry.outcome || '待补充'}`
          )
        : ['- 尚未制定']),
      '\n本轮调整：',
      ...(state.changes.length
        ? state.changes.slice(-10).map((entry) => `- ${entry}`)
        : ['- 尚未调整']),
      '\n请检查缺失目标、未排期项和日期冲突，提出可解释的安排建议。缺少依据时先列出待确认问题；所有新安排由人审核，不把排期视为完成，不修改 Issue 状态。'
    ].join('\n')
    $('#collaboration-request').value = request
    $('#copy-feedback').textContent = ''
    $('#collaboration-editor').showModal()
  })
  $('#copy-request').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#collaboration-request').value)
      $('#copy-feedback').textContent = '已复制请求，尚未发送。'
    } catch {
      $('#collaboration-request').select()
      $('#copy-feedback').textContent = '浏览器未允许复制，请手动复制已选文字。'
    }
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && cancelGesture) {
      event.preventDefault()
      cancelGesture()
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'z' &&
      !event.target.closest('input, textarea, select, [contenteditable]') &&
      !document.querySelector('dialog[open]')
    ) {
      event.preventDefault()
      undo()
    }
  })
  document.addEventListener(
    'click',
    (event) => {
      if (!cancelGesture) {
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      cancelGesture()
      feedback('已取消拖动，请重新选择操作。')
    },
    true
  )
  render()
})()
