/* Prototype data is fictional. All edits stay in this page. */
;(() => {
  const origin = Date.UTC(2026, 6, 1)
  const days = 92
  const dayWidth = 40
  const rowHeight = 40
  const chartWidth = days * dayWidth
  const dateAt = (day) => new Date(origin + day * 86400000).toISOString().slice(0, 10)
  const date = (day) => new Date(origin + day * 86400000)
  const $ = (query) => document.querySelector(query)
  const grid = $('#timeline-grid')
  const scroll = $('.sheet-scroll')
  const status = $('#gesture-status')
  const menu = $('#node-menu')
  let currentTheme = 'gtsllm'
  const initialRows = [
    '月份',
    '日期',
    '星期',
    '各迭代目标',
    'B版本',
    '版本计划',
    '质量策划',
    '模型训练团队',
    '设计',
    '开发',
    '测试',
    '资料开发',
    '安全送检',
    '业务联调',
    '适配昇腾',
    '适配 GDE B 版本',
    'GDE（含 DSP）转测试计划'
  ].map((name, id) => ({
    id,
    name,
    kind: ['month', 'date', 'weekday'][id] || (id === 5 ? 'node' : 'range'),
    role: id < 3 ? 'calendar' : id === 4 ? 'build' : 'plan',
    external: id === 16,
    defaultTone: id < 5 ? 'iteration' : 'plan',
    fill: null,
    textColor: null,
    itemColor: id === 4 || id === 5 ? '#FFC000' : '#FFFFFF'
  }))
  const colors = ['#FFFFFF', '#FFC000', '#FFFF00', '#D9D9D9']
  let sequence = 20
  const nextId = () => `segment-${++sequence}`
  const selected = new Set()
  const history = []
  const future = []
  const keyboardInput = document.createElement('input')
  keyboardInput.className = 'keyboard-input'
  keyboardInput.maxLength = 100
  keyboardInput.autocomplete = 'off'
  keyboardInput.setAttribute('aria-label', '画布键盘输入')
  document.body.append(keyboardInput)
  let activeLane = 8
  let activeCell
  let selectedRow
  let cancelGesture
  let activeEdit
  let statusTimer
  let state = {
    version: '示例版本',
    rows: initialRows,
    items: [
      { id: 'i1', lane: 3, start: 0, end: 29, name: '迭代一', node: false },
      { id: 'i2', lane: 3, start: 30, end: 60, name: '迭代二', node: false },
      { id: 'i3', lane: 3, start: 61, end: 91, name: '迭代三', node: false },
      { id: 'd1', lane: 8, start: 3, end: 10, name: '界面草稿', node: false },
      { id: 'd2', lane: 8, start: 25, end: 31, name: '第二轮调整', node: false },
      { id: 'dev1', lane: 9, start: 14, end: 38, name: '核心流程实现', node: false },
      { id: 't1', lane: 10, start: 39, end: 48, name: '流程核对', node: false },
      { id: 't2', lane: 10, start: 60, end: 69, name: '补充验证', node: false },
      { id: 'n1', lane: 4, start: 20, end: 26, name: '示例构建', node: false, color: colors[1] },
      {
        id: 'n2',
        lane: 5,
        start: 60,
        end: 60,
        name: '演示节点',
        node: true,
        color: colors[2],
        textColor: '#C00000'
      }
    ]
  }
  const snapshot = () => structuredClone(state)
  const rowFor = (id) => state.rows.find((row) => row.id === id)
  const planRow = (row) => row && (row.kind === 'range' || row.kind === 'node')
  const styledItem = (item) => {
    const row = rowFor(item.lane)
    return row?.kind === 'node' || row?.role === 'build'
  }
  const scheduled = (item) => Number.isInteger(item.start) && Number.isInteger(item.end)
  function overlapReason(proposals) {
    const candidates = proposals.map((proposal) => ({
      ...proposal,
      lane: proposal.entry?.lane ?? proposal.lane,
      id: proposal.entry?.id ?? proposal.id
    }))
    const movingIds = new Set(candidates.map((item) => item.id).filter(Boolean))
    const existing = state.items.filter((item) => scheduled(item) && !movingIds.has(item.id))
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index]
      if (
        [...existing, ...candidates.slice(index + 1)].some(
          (item) =>
            item.lane === candidate.lane &&
            candidate.start <= item.end &&
            candidate.end >= item.start
        )
      ) {
        return '同一泳道的时段不能重叠'
      }
    }
    return ''
  }
  const element = (tag, className = '', text = '') => {
    const node = document.createElement(tag)
    node.className = className
    node.textContent = text
    return node
  }
  function feedback(text = '', error = false) {
    clearTimeout(statusTimer)
    status.textContent = text
    status.hidden = !text
    status.classList.toggle('error', error)
    if (text && !cancelGesture) {
      statusTimer = setTimeout(
        () => {
          status.hidden = true
        },
        error ? 4000 : 2000
      )
    }
  }
  function commit(before) {
    if (JSON.stringify(before) === JSON.stringify(state)) {
      return
    }
    history.push(before)
    future.length = 0
    if (history.length > 30) {
      history.shift()
    }
    render()
  }
  function refreshSelection() {
    grid.querySelectorAll('[data-item]').forEach((node) => {
      const isSelected = selected.has(node.dataset.item)
      node.classList.toggle('selected', isSelected)
      node.setAttribute('aria-pressed', String(isSelected))
    })
    grid.querySelectorAll('.side-b[data-lane]').forEach((node) => {
      node.classList.toggle('active-lane', Number(node.dataset.lane) === activeLane)
      node.classList.toggle('selected-row', Number(node.dataset.lane) === selectedRow)
    })
    grid.querySelector('.cell-focus')?.remove()
    if (activeCell && !selectedRow) {
      const track = grid.querySelector(`.track[data-lane="${activeCell.rowId}"]`)
      if (track) {
        const focus = element('div', 'cell-focus')
        focus.style.left = `${activeCell.day * dayWidth}px`
        focus.dataset.lane = activeCell.rowId
        focus.dataset.day = activeCell.day
        track.append(focus)
      }
    }
  }
  function select(item, extend = false, day) {
    selectedRow = undefined
    activeLane = item.lane
    activeCell = scheduled(item) ? { rowId: item.lane, day: day ?? item.start } : undefined
    if (!extend) {
      selected.clear()
    }
    if (extend && selected.has(item.id)) {
      selected.delete(item.id)
    } else {
      selected.add(item.id)
    }
    refreshSelection()
    focusKeyboard()
  }
  function itemAtCell() {
    return (
      activeCell &&
      state.items.find(
        (item) =>
          item.lane === activeCell.rowId &&
          scheduled(item) &&
          item.start <= activeCell.day &&
          item.end >= activeCell.day
      )
    )
  }
  function selectCell(rowId, day, focus = true) {
    if (!planRow(rowFor(rowId))) {
      return
    }
    activeLane = rowId
    activeCell = { rowId, day: Math.max(0, Math.min(days - 1, day)) }
    selectedRow = undefined
    selected.clear()
    const item = itemAtCell()
    if (item) {
      selected.add(item.id)
    }
    refreshSelection()
    if (focus) {
      revealCell()
      focusKeyboard()
    }
  }
  function keyboardRect() {
    if (activeCell && !selectedRow) {
      const track = grid.querySelector(`.track[data-lane="${activeCell.rowId}"]`)
      if (track) {
        const rect = track.getBoundingClientRect()
        return {
          left: rect.left + activeCell.day * dayWidth,
          top: rect.top,
          right: rect.left + (activeCell.day + 1) * dayWidth,
          bottom: rect.bottom
        }
      }
    }
    const item = state.items.find((entry) => selected.has(entry.id))
    return grid
      .querySelector(
        item ? `[data-item="${item.id}"]` : `.side-b[data-lane="${selectedRow ?? activeLane}"]`
      )
      ?.getBoundingClientRect()
  }
  function focusKeyboard() {
    if (activeEdit || cancelGesture) {
      return
    }
    keyboardInput.classList.remove('editing-input')
    keyboardInput.value = ''
    keyboardInput.style.width = '1px'
    const rect = keyboardRect()
    if (rect) {
      keyboardInput.style.left = `${rect.left}px`
      keyboardInput.style.top = `${rect.top}px`
    }
    const row = rowFor(activeCell?.rowId ?? selectedRow ?? activeLane)
    keyboardInput.setAttribute(
      'aria-label',
      activeCell && !selectedRow
        ? `${row?.name || ''}，${dateAt(activeCell.day)}，活动格`
        : `${row?.name || ''}，画布键盘输入`
    )
    keyboardInput.focus({ preventScroll: true })
  }
  function revealCell() {
    const rect = keyboardRect()
    if (!rect) {
      return
    }
    const viewport = scroll.getBoundingClientRect()
    const left = grid.querySelector('.side-b')?.getBoundingClientRect().right ?? viewport.left
    if (activeCell && !selectedRow && rect.left < left) {
      scroll.scrollLeft -= left - rect.left
    } else if (activeCell && !selectedRow && rect.right > viewport.right) {
      scroll.scrollLeft += rect.right - viewport.right
    }
    const top = viewport.top + rowHeight * 3
    if (rect.top < top) {
      scroll.scrollTop -= top - rect.top
    } else if (rect.bottom > viewport.bottom) {
      scroll.scrollTop += rect.bottom - viewport.bottom
    }
  }
  function navigate(key, reverse = false) {
    const rows = state.rows.filter(planRow)
    if (!rows.length) {
      return
    }
    let index = Math.max(
      0,
      rows.findIndex((row) => row.id === (selectedRow ?? activeCell?.rowId ?? activeLane))
    )
    if (selectedRow && key !== 'Tab' && key !== 'ArrowRight') {
      if (['ArrowUp', 'ArrowDown', 'Enter'].includes(key)) {
        const delta = key === 'ArrowUp' || (key === 'Enter' && reverse) ? -1 : 1
        index = Math.max(0, Math.min(rows.length - 1, index + delta))
        selectPlanRow(rows[index])
      }
      return
    }
    let day = activeCell?.day ?? 0
    if (selectedRow) {
      selectCell(rows[index].id, 0)
      return
    }
    if (key === 'Tab') {
      day += reverse ? -1 : 1
      if (day >= days && index < rows.length - 1) {
        day = 0
        index++
      } else if (day < 0 && index > 0) {
        day = days - 1
        index--
      }
    } else if (key === 'ArrowLeft') {
      day--
    } else if (key === 'ArrowRight') {
      day++
    } else {
      index += key === 'ArrowUp' || (key === 'Enter' && reverse) ? -1 : 1
    }
    index = Math.max(0, Math.min(rows.length - 1, index))
    selectCell(rows[index].id, day)
  }
  function bindEditor(input, finish, rect, composing = false, blurSave = true) {
    const custom = input === keyboardInput
    const reposition = () => {
      if (!custom) {
        return
      }
      const bounds = rect?.() || keyboardRect()
      if (bounds) {
        const width = Math.max(180, Math.min(360, bounds.right - bounds.left))
        input.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - width - 8))}px`
        input.style.top = `${bounds.top + 7}px`
        input.style.width = `${width}px`
      }
    }
    const complete = (save, move, restoreFocus = true) => {
      input.removeEventListener('keydown', keydown)
      input.removeEventListener('blur', blur)
      input.removeEventListener('compositionstart', start)
      input.removeEventListener('compositionend', end)
      finish(save)
      if (custom) {
        input.classList.remove('editing-input')
      }
      if (move) {
        navigate(move.key, move.reverse)
      } else if (restoreFocus) {
        focusKeyboard()
      }
    }
    const keydown = (event) => {
      if (composing || event.isComposing || event.keyCode === 229) {
        return
      }
      if (['Enter', 'Escape', 'Tab'].includes(event.key)) {
        event.preventDefault()
        event.stopPropagation()
        complete(
          event.key !== 'Escape',
          event.key === 'Escape' ? undefined : { key: event.key, reverse: event.shiftKey }
        )
      }
    }
    const blur = () => complete(blurSave, undefined, false)
    const start = () => {
      composing = true
    }
    const end = () => {
      composing = false
    }
    activeEdit = { cancel: () => complete(false), reposition }
    input.addEventListener('keydown', keydown)
    input.addEventListener('blur', blur)
    input.addEventListener('compositionstart', start)
    input.addEventListener('compositionend', end)
    if (custom) {
      input.classList.add('editing-input')
    }
    reposition()
  }
  function position(node, item) {
    node.style.left = `${item.start * dayWidth}px`
    node.style.width = `${(item.end - item.start + 1) * dayWidth}px`
    node.style.top = `${Math.max(1, Math.round((rowHeight - 24) / 2))}px`
    node.style.background = styledItem(item) ? item.color || 'var(--surface)' : 'var(--surface)'
    node.style.color = item.textColor || 'var(--foreground)'
    node.setAttribute(
      'aria-label',
      `${item.name || '新时段'}，${dateAt(item.start)} 至 ${dateAt(item.end)}`
    )
  }
  const rawDay = (event, track) =>
    Math.floor((event.clientX - track.getBoundingClientRect().left) / dayWidth)
  const pointDay = (event, track) => Math.max(0, Math.min(days - 1, rawDay(event, track)))
  function gesture(event, node, track, preview, describe, options = {}) {
    if (
      event.button !== 0 ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      cancelGesture ||
      activeEdit
    ) {
      options.cleanup?.()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const before = snapshot()
    const previousSelection = [...selected]
    const previousSelectedRow = options.previousSelectedRow ?? selectedRow
    const previousActiveLane = options.previousActiveLane ?? activeLane
    const previousActiveCell =
      options.previousActiveCell === undefined
        ? structuredClone(activeCell)
        : options.previousActiveCell
    const initialX = event.clientX
    const initialPoint = rawDay(event, track)
    let current = event
    let started = false
    let invalid = ''
    let frame
    let active = true
    node.setPointerCapture(event.pointerId)
    const update = () => {
      const delta = rawDay(current, track) - initialPoint
      invalid = preview(delta, pointDay(current, track), current) || ''
      node.classList.toggle('invalid', Boolean(invalid))
      feedback(
        `${describe(delta, pointDay(current, track))}${invalid ? ` · ${invalid}` : ''}`,
        Boolean(invalid)
      )
    }
    const move = (next) => {
      if (next.pointerId !== event.pointerId) {
        return
      }
      current = next
      if (!started && Math.abs(next.clientX - initialX) > 3) {
        started = true
        node.classList.add('dragging')
        options.onStart?.()
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
        const rect = scroll.getBoundingClientRect()
        const leftRail = grid.querySelector('.side-b').getBoundingClientRect().right
        if (current.clientX > rect.right - 24) {
          scroll.scrollLeft += 12
        } else if (current.clientX < leftRail + 10) {
          scroll.scrollLeft -= 12
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
      options.cleanup?.()
      feedback()
      if (cancelled || invalid) {
        state = before
        selectedRow = planRow(rowFor(previousSelectedRow)) ? previousSelectedRow : undefined
        activeLane = planRow(rowFor(previousActiveLane)) ? previousActiveLane : undefined
        activeCell = previousActiveCell
        selected.clear()
        previousSelection.forEach((entry) => selected.add(entry))
        render()
        if (invalid && !cancelled) {
          feedback(`${invalid}；本次调整已取消`, true)
        }
      } else if (started) {
        commit(before)
        options.onComplete?.()
      } else {
        options.onTap?.()
      }
    }
    const up = (next) => {
      if (next.pointerId !== event.pointerId) {
        return
      }
      move(next)
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
  function editName(item, draft = false, options = {}) {
    if (activeEdit || cancelGesture) {
      return
    }
    const conflict = draft ? overlapReason([item]) : ''
    if (conflict) {
      feedback(conflict, true)
      return
    }
    const track = grid.querySelector(`.track[data-lane="${item.lane}"]`)
    let node = draft ? undefined : grid.querySelector(`.segment[data-item="${item.id}"]`)
    if (!node && !options.input) {
      node = segmentNode(item, track, true)
      track.append(node)
    }
    node?.classList.add('editing')
    const input = options.input || element('input', 'inline-name')
    if (!options.preserveValue) {
      input.value = item.name || ''
    }
    input.maxLength = 100
    input.setAttribute('aria-label', '时段名称')
    if (!options.input) {
      node.replaceChildren(input)
    }
    let done = false
    const finish = (save) => {
      if (done) {
        return
      }
      done = true
      activeEdit = undefined
      const name = input.value.trim()
      if (save && name) {
        const before = snapshot()
        if (draft) {
          state.items.push({ ...item, id: nextId(), name })
        } else {
          item.name = name
        }
        selected.clear()
        selected.add(draft ? state.items.at(-1).id : item.id)
        if (scheduled(item)) {
          activeCell = {
            rowId: item.lane,
            day: activeCell?.rowId === item.lane ? activeCell.day : item.start
          }
        }
        commit(before)
      } else if (save && !draft) {
        const before = snapshot()
        state.items = state.items.filter((entry) => entry.id !== item.id)
        selected.clear()
        commit(before)
      }
      render()
    }
    bindEditor(
      input,
      finish,
      () => {
        const target = grid.querySelector(`[data-item="${item.id}"]`)
        return !scheduled(item) && target ? target.getBoundingClientRect() : keyboardRect()
      },
      options.composing
    )
    if (!options.preserveValue) {
      input.focus({ preventScroll: true })
      if (options.input) {
        input.setSelectionRange(input.value.length, input.value.length)
      } else {
        input.select()
      }
    }
  }
  function makeRange(event, track, lane) {
    if (
      event.target.closest('.segment, input') ||
      event.button !== 0 ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      activeEdit
    ) {
      return
    }
    const previousSelectedRow = selectedRow
    const previousActiveLane = activeLane
    const previousActiveCell = structuredClone(activeCell)
    activeLane = lane
    selectedRow = undefined
    refreshSelection()
    const pending = state.items.find(
      (item) => item.lane === lane && !scheduled(item) && selected.has(item.id)
    )
    const row = rowFor(lane)
    const anchor = pointDay(event, track)
    if (row.kind === 'node' && !pending) {
      selectCell(lane, anchor)
      return
    }
    const range = {
      lane,
      start: anchor,
      end: anchor,
      name: pending?.name || '',
      node: row.kind === 'node',
      color: pending?.color || row.itemColor
    }
    const ghost = segmentNode(range, track, true)
    ghost.classList.add('ghost')
    ghost.hidden = true
    track.append(ghost)
    gesture(
      event,
      track,
      track,
      (_delta, point, current) => {
        if (rawDay(current, track) < 0 || rawDay(current, track) >= days) {
          return '时段超出日期范围'
        }
        range.start = range.node ? point : Math.min(anchor, point)
        range.end = range.node ? point : Math.max(anchor, point)
        const conflict = overlapReason([range])
        if (conflict) {
          return conflict
        }
        position(ghost, range)
      },
      (_delta, point) =>
        range.node
          ? dateAt(point)
          : `${dateAt(Math.min(anchor, point))} — ${dateAt(Math.max(anchor, point))}`,
      {
        previousSelectedRow,
        previousActiveLane,
        previousActiveCell,
        onStart: () => {
          activeCell = { rowId: lane, day: anchor }
          ghost.hidden = false
          refreshSelection()
        },
        onTap: () => selectCell(lane, anchor),
        cleanup: () => ghost.remove(),
        onComplete: () => {
          activeCell = { rowId: lane, day: range.start }
          if (pending) {
            const before = snapshot()
            Object.assign(pending, { start: range.start, end: range.end })
            commit(before)
          } else {
            editName(range, true)
          }
        }
      }
    )
  }
  function segmentNode(item, track, preview = false) {
    const node = element('div', `segment${item.node ? ' node' : ''}`)
    position(node, item)
    node.append(element('span', 'segment-name', item.name))
    if (preview) {
      return node
    }
    node.dataset.item = item.id
    node.dataset.lane = item.lane
    node.tabIndex = 0
    node.setAttribute('role', 'button')
    if (!item.node) {
      node.append(element('span', 'resize-start'), element('span', 'resize-end'))
    }
    node.addEventListener('click', (event) => {
      if (node.dataset.dragged) {
        delete node.dataset.dragged
        return
      }
      if (!activeEdit) {
        select(item, event.shiftKey || event.ctrlKey || event.metaKey, pointDay(event, track))
      }
    })
    node.addEventListener('dblclick', (event) => {
      event.stopPropagation()
      editName(item)
    })
    node.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || activeEdit) {
        return
      }
      const edge = event.target.closest('.resize-start')
        ? 'start'
        : event.target.closest('.resize-end')
          ? 'end'
          : ''
      const moving =
        edge || !selected.has(item.id)
          ? [item]
          : state.items.filter((entry) => selected.has(entry.id) && scheduled(entry))
      const originals = moving.map((entry) => ({ entry, start: entry.start, end: entry.end }))
      gesture(
        event,
        node,
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
            return '时段不能倒置或超出日期范围'
          }
          const conflict = overlapReason(proposals)
          if (conflict) {
            return conflict
          }
          proposals.forEach(({ entry, start, end }) => {
            Object.assign(entry, { start, end })
            position(grid.querySelector(`.segment[data-item="${entry.id}"]`), entry)
          })
        },
        (delta) => {
          const original = originals.find((entry) => entry.entry.id === item.id)
          return `${moving.length > 1 ? `${moving.length} 项 · ` : ''}${dateAt(original.start + (edge === 'end' ? 0 : delta))} — ${dateAt(original.end + (edge === 'start' ? 0 : delta))}`
        },
        {
          onStart: () => {
            if (!selected.has(item.id)) {
              select(item)
            }
            node.dataset.dragged = 'true'
          },
          onComplete: () => {
            activeCell = { rowId: item.lane, day: item.start }
            refreshSelection()
            focusKeyboard()
          }
        }
      )
    })
    node.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      if (activeEdit || cancelGesture) {
        return
      }
      if (!selected.has(item.id)) {
        select(item)
      }
      showMenu(event.clientX, event.clientY)
    })
    return node
  }
  function backlogNode(item) {
    const node = element('button', 'unscheduled', item.name)
    node.type = 'button'
    node.dataset.item = item.id
    node.setAttribute('aria-label', `${item.name}，未排期`)
    node.addEventListener('click', (event) => {
      if (!activeEdit) {
        select(item, event.shiftKey || event.ctrlKey || event.metaKey)
      }
    })
    node.addEventListener('pointerdown', (event) => {
      const track = grid.querySelector(`.track[data-lane="${item.lane}"]`)
      const range = { ...item, start: 0, end: 0 }
      const ghost = segmentNode(range, track, true)
      ghost.classList.add('ghost')
      ghost.hidden = true
      track.append(ghost)
      gesture(
        event,
        node,
        track,
        (_delta, point, current) => {
          const rect = track.getBoundingClientRect()
          if (
            rawDay(current, track) < 0 ||
            rawDay(current, track) >= days ||
            current.clientY < rect.top ||
            current.clientY > rect.bottom
          ) {
            ghost.hidden = true
            return '请拖到当前泳道的日期位置'
          }
          range.start = point
          range.end = point
          const conflict = overlapReason([range])
          if (conflict) {
            return conflict
          }
          ghost.hidden = false
          position(ghost, range)
        },
        (_delta, point) => `${item.name} · ${dateAt(point)}`,
        {
          cleanup: () => ghost.remove(),
          onStart: () => select(item),
          onComplete: () => {
            const before = snapshot()
            Object.assign(item, { start: range.start, end: range.end })
            activeCell = { rowId: item.lane, day: range.start }
            commit(before)
            focusKeyboard()
          }
        }
      )
    })
    return node
  }
  function cell(className, row, column) {
    const node = element('div', className)
    node.style.gridRow = String(row)
    node.style.gridColumn = String(column)
    if (row <= 3 && column > 1) {
      node.classList.add('header-cell')
      node.style.top = `${(row - 1) * rowHeight}px`
    }
    grid.append(node)
    return node
  }
  function editVersion(node) {
    if (activeEdit || cancelGesture) {
      return
    }
    const input = element('input')
    input.value = state.version
    input.setAttribute('aria-label', '版本名称')
    node.replaceWith(input)
    let done = false
    const finish = (save) => {
      if (done) {
        return
      }
      done = true
      activeEdit = undefined
      if (save && input.value.trim()) {
        const before = snapshot()
        state.version = input.value.trim()
        commit(before)
      }
      render()
    }
    activeEdit = { cancel: () => finish(false) }
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        finish(event.key === 'Enter')
      }
    })
    input.addEventListener('blur', () => finish(true))
    input.focus()
    input.select()
  }
  function selectPlanRow(row) {
    if (cancelGesture || activeEdit || !planRow(row)) {
      return
    }
    selected.clear()
    selectedRow = row.id
    activeCell = undefined
    activeLane = row.id
    refreshSelection()
    revealCell()
    focusKeyboard()
  }
  function editRowName(row, draft, options = {}) {
    if (cancelGesture || activeEdit || !planRow(row)) {
      return
    }
    menu.hidden = true
    const before = draft?.before || snapshot()
    const label = grid.querySelector(`.side-b[data-lane="${row.id}"] strong`)
    const input = options.input || element('input', 'row-name-input')
    if (!options.preserveValue) {
      input.value = draft ? '' : row.name
    }
    input.maxLength = 100
    input.setAttribute('aria-label', '计划行名称')
    if (!options.input) {
      label.replaceChildren(input)
    }
    let done = false
    const finish = (save) => {
      if (done) {
        return
      }
      done = true
      activeEdit = undefined
      const name = input.value.trim()
      if (save && name) {
        row.name = name
        commit(before)
      } else if (draft) {
        state = before
        activeLane = draft.activeLane
        selectedRow = draft.selectedRow
        activeCell = draft.activeCell
        selected.clear()
        draft.selectedItems.forEach((id) => selected.add(id))
      }
      render()
    }
    bindEditor(
      input,
      finish,
      () => grid.querySelector(`.side-b[data-lane="${row.id}"] strong`)?.getBoundingClientRect(),
      options.composing,
      !draft
    )
    if (!options.preserveValue) {
      input.focus({ preventScroll: true })
      if (options.input) {
        input.setSelectionRange(input.value.length, input.value.length)
      } else {
        input.select()
      }
    }
  }
  function insertRow(index, kind) {
    if (cancelGesture || activeEdit) {
      return
    }
    const draft = {
      before: snapshot(),
      activeLane,
      activeCell: structuredClone(activeCell),
      selectedRow,
      selectedItems: [...selected]
    }
    const row = {
      id: ++sequence,
      name: '',
      kind,
      role: 'plan',
      external: false,
      fill: null,
      textColor: null,
      itemColor: kind === 'node' ? colors[1] : colors[0]
    }
    state.rows.splice(Math.max(3, Math.min(index, state.rows.length)), 0, row)
    activeLane = row.id
    selectedRow = row.id
    activeCell = undefined
    selected.clear()
    menu.hidden = true
    render()
    editRowName(row, draft)
  }
  function deleteRow(row) {
    if (cancelGesture || activeEdit || !planRow(rowFor(row.id))) {
      return
    }
    const before = snapshot()
    const index = state.rows.findIndex((entry) => entry.id === row.id)
    state.rows.splice(index, 1)
    state.items = state.items.filter((item) => item.lane !== row.id)
    activeLane = state.rows.slice(index).find(planRow)?.id || state.rows.slice(3, index).at(-1)?.id
    selectedRow = undefined
    selected.clear()
    menu.hidden = true
    commit(before)
    feedback('计划行及其内容已删除，可撤销')
  }
  function markRow(row, field, value) {
    if (cancelGesture || activeEdit || !planRow(rowFor(row.id))) {
      return
    }
    const before = snapshot()
    row[field] = value
    menu.hidden = true
    commit(before)
  }
  function showRowMenu(event, row) {
    event.preventDefault()
    if (cancelGesture || activeEdit) {
      return
    }
    const index = row ? state.rows.findIndex((entry) => entry.id === row.id) : state.rows.length - 1
    menu.replaceChildren()
    menu.classList.add('compact-menu')
    if (planRow(row)) {
      selectPlanRow(row)
      menuOption('修改行名称', () => editRowName(row))
      insertMenuGroup('上方新增', index)
    }
    const next = row && !planRow(row) ? 3 : index + 1
    insertMenuGroup('下方新增', next)
    if (planRow(row)) {
      const items = state.items.filter((item) => item.lane === row.id)
      const count = items.filter(scheduled).length
      const counts = `${count} 时段 · ${items.length - count} 未排期`
      const deletion = menuOption('删除行', () => deleteRow(row))
      deletion.setAttribute('aria-label', '删除行')
      deletion.setAttribute('aria-description', counts)
      deletion.append(element('small', 'menu-count', counts))
      const currentFill = getComputedStyle(
        grid.querySelector(`.side-b[data-lane="${row.id}"]`)
      ).backgroundColor
      const effectiveFill =
        row.fill ||
        {
          'rgb(255, 255, 255)': '#FFFFFF',
          'rgb(255, 192, 0)': '#FFC000',
          'rgb(255, 255, 0)': '#FFFF00',
          'rgb(217, 217, 217)': '#D9D9D9',
          'rgb(141, 180, 226)': '#8DB4E2',
          'rgb(204, 192, 218)': '#CCC0DA'
        }[currentFill]
      fillMenuBar(
        ['白色', '橙色', '黄色', '灰色', '蓝色', '紫色'],
        [...colors, '#8DB4E2', '#CCC0DA'],
        effectiveFill,
        (fill) => markRow(row, 'fill', fill)
      )
      const text = menuGroup('文字')
      ;[
        ['红字', '#C00000'],
        ['黑字', '#000000']
      ].forEach(([name, color]) => {
        const choice = menuOption(name, () => markRow(row, 'textColor', color), undefined, text)
        choice.setAttribute('role', 'menuitemradio')
        choice.setAttribute('aria-label', `文字：${name}`)
        choice.setAttribute('aria-checked', String((row.textColor || '#000000') === color))
        choice.style.color = color
      })
    }
    themeMenuGroup()
    placeMenu(event.clientX, event.clientY)
  }
  function render() {
    if (cancelGesture || activeEdit) {
      return
    }
    if (!planRow(rowFor(activeLane))) {
      activeLane = state.rows.find(planRow)?.id
    }
    if (!planRow(rowFor(selectedRow))) {
      selectedRow = undefined
    }
    if (activeCell && !planRow(rowFor(activeCell.rowId))) {
      activeCell = undefined
    }
    const hadFocus =
      document.activeElement === keyboardInput || grid.contains(document.activeElement)
    selected.forEach((id) => {
      if (!state.items.some((item) => item.id === id)) {
        selected.delete(id)
      }
    })
    grid.replaceChildren()
    grid.style.setProperty('--a', '60px')
    grid.style.setProperty('--b', '187px')
    grid.style.setProperty('--chart', `${chartWidth}px`)
    grid.style.gridTemplateRows = `repeat(${state.rows.length}, ${rowHeight}px)`
    const iteration = cell('side-a iteration-label', 1, 1)
    iteration.style.gridRow = '1 / 4'
    iteration.textContent = '迭代'
    if (state.rows.length > 3) {
      const version = cell('side-a', 4, 1)
      version.style.gridRow = `4 / ${state.rows.length + 1}`
      const versionLabel = element('div', 'version-label', '版本')
      const versionName = element('span', 'version-name', state.version)
      versionName.tabIndex = 0
      versionName.addEventListener('dblclick', () => editVersion(versionName))
      versionLabel.append(versionName)
      version.append(versionLabel)
      version.addEventListener('contextmenu', (event) => showRowMenu(event))
    }
    state.rows.forEach((row, index) => {
      const { id: lane, name } = row
      const rail = cell(
        `side-b${row.defaultTone === 'iteration' ? ' blue-rail' : ''}${row.external ? ' external-lane' : ''}`,
        index + 1,
        2
      )
      if (row.fill) {
        rail.style.background = row.fill
      }
      rail.style.color = row.textColor || 'var(--foreground)'
      const label = element('strong', '', name)
      rail.append(label)
      rail.addEventListener('contextmenu', (event) => {
        if (!event.target.closest('.unscheduled, input')) {
          showRowMenu(event, row)
        }
      })
      if (planRow(row)) {
        rail.dataset.lane = lane
        label.tabIndex = 0
        label.addEventListener('focus', () => selectPlanRow(row))
        label.addEventListener('dblclick', () => editRowName(row))
        rail.addEventListener('click', (event) => {
          if (!event.target.closest('.unscheduled, input')) {
            selectPlanRow(row)
          }
        })
        const pending = state.items.filter((item) => item.lane === lane && !scheduled(item))
        if (pending.length) {
          rail.classList.add('pending-rail')
          rail.querySelector('strong').title = name
          const backlog = element('div', 'backlog')
          backlog.setAttribute('aria-label', `${name}未排期项`)
          backlog.addEventListener(
            'wheel',
            (event) => {
              if (event.ctrlKey || backlog.scrollWidth <= backlog.clientWidth) {
                return
              }
              event.preventDefault()
              event.stopPropagation()
              backlog.scrollLeft += event.deltaX || event.deltaY
            },
            { passive: false }
          )
          pending.forEach((item) => backlog.append(backlogNode(item)))
          rail.append(backlog)
        }
      }
      const track = cell('track', index + 1, 3)
      if (row.kind === 'month') {
        track.classList.add('month-band')
        for (const [label, count] of [
          ['2026 年 7 月', 31],
          ['2026 年 8 月', 31],
          ['2026 年 9 月', 30]
        ]) {
          const month = element('div', '', label)
          month.style.width = `${count * dayWidth}px`
          track.append(month)
        }
      } else if (row.kind === 'date' || row.kind === 'weekday') {
        track.classList.add(row.kind === 'date' ? 'date-band' : 'weekday-band')
        for (let day = 0; day < days; day++) {
          const current = date(day)
          const dayCell = element(
            'div',
            [0, 6].includes(current.getUTCDay()) ? 'weekend' : '',
            row.kind === 'date'
              ? String(current.getUTCDate())
              : ['日', '一', '二', '三', '四', '五', '六'][current.getUTCDay()]
          )
          dayCell.style.width = `${dayWidth}px`
          track.append(dayCell)
        }
      } else {
        track.dataset.lane = lane
        track.setAttribute('aria-label', `${name}泳道`)
        for (let day = 0; day < days; day++) {
          const shade = element('div', 'day-shade')
          shade.style.left = `${day * dayWidth}px`
          shade.style.width = `${dayWidth}px`
          track.append(shade)
        }
        state.items
          .filter((item) => item.lane === lane && scheduled(item))
          .forEach((item) => track.append(segmentNode(item, track)))
        track.addEventListener('pointerdown', (event) => makeRange(event, track, lane))
        if (row.kind === 'node') {
          track.addEventListener('dblclick', (event) => {
            if (event.target.closest('.segment') || activeEdit) {
              return
            }
            activeLane = lane
            selectedRow = undefined
            const point = pointDay(event, track)
            const candidate = {
              lane,
              start: point,
              end: point,
              name: '',
              node: true,
              color: row.itemColor
            }
            const conflict = overlapReason([candidate])
            if (conflict) {
              feedback(conflict, true)
              return
            }
            editName(candidate, true)
          })
        }
      }
    })
    refreshSelection()
    if (hadFocus) {
      focusKeyboard()
    }
  }
  function colorNodes(color) {
    if (cancelGesture || activeEdit) {
      return
    }
    if (planRow(rowFor(selectedRow))) {
      markRow(rowFor(selectedRow), 'fill', color)
      return
    }
    const nodes = state.items.filter((item) => selected.has(item.id) && styledItem(item))
    if (!nodes.length) {
      return
    }
    const before = snapshot()
    nodes.forEach((item) => {
      item.color = color
    })
    menu.hidden = true
    commit(before)
  }
  function toggleTextColor() {
    if (cancelGesture || activeEdit) {
      return
    }
    const row = rowFor(selectedRow)
    if (planRow(row)) {
      markRow(row, 'textColor', row.textColor === '#C00000' ? '#000000' : '#C00000')
      return
    }
    const items = state.items.filter((item) => selected.has(item.id) && styledItem(item))
    if (!items.length) {
      return
    }
    const before = snapshot()
    items.forEach((item) => {
      item.textColor = item.textColor === '#C00000' ? '#000000' : '#C00000'
    })
    menu.hidden = true
    commit(before)
  }
  function menuGroup(label, className = '') {
    const group = element('div', `menu-actions ${className}`)
    group.setAttribute('role', 'group')
    group.setAttribute('aria-label', label)
    group.append(element('span', 'menu-label', label))
    menu.append(group)
    return group
  }
  function setTheme(theme) {
    if (cancelGesture || activeEdit) {
      return
    }
    currentTheme = theme
    document.documentElement.dataset.theme = theme
    $('#theme-name').textContent = theme === 'orca' ? 'Orca 主题' : 'GTSLLM 主题'
    menu.hidden = true
    focusKeyboard()
  }
  function themeMenuGroup() {
    const group = menuGroup('主题', 'theme-options')
    ;[
      ['GTSLLM', 'gtsllm'],
      ['Orca', 'orca']
    ].forEach(([name, theme]) => {
      const choice = menuOption(name, () => setTheme(theme), undefined, group)
      choice.setAttribute('role', 'menuitemradio')
      choice.setAttribute('aria-label', `主题：${name}`)
      choice.setAttribute('aria-checked', String(currentTheme === theme))
    })
  }
  function showThemeMenu(event) {
    event.preventDefault()
    if (cancelGesture || activeEdit) {
      return
    }
    menu.replaceChildren()
    menu.classList.add('compact-menu')
    themeMenuGroup()
    placeMenu(event.clientX, event.clientY)
  }
  function insertMenuGroup(label, index) {
    const group = menuGroup(label)
    ;[
      ['时段', 'range'],
      ['节点', 'node']
    ].forEach(([name, kind]) => {
      const choice = menuOption(name, () => insertRow(index, kind), undefined, group)
      choice.setAttribute('aria-label', `${label}${name}行`)
    })
  }
  function fillMenuBar(names, fills, currentFill, onSelect) {
    const group = menuGroup('底色', 'fill-bar')
    names.forEach((name, index) => {
      const fill = fills[index]
      const choice = menuOption('', () => onSelect(fill), fill, group)
      choice.classList.add('fill-choice')
      choice.setAttribute('role', 'menuitemradio')
      choice.setAttribute('aria-label', `底色：${name}`)
      choice.setAttribute('aria-checked', String(currentFill?.toUpperCase() === fill))
      choice.title = `底色：${name}`
    })
  }
  function menuOption(label, action, fill, parent = menu) {
    const option = element('button', '', label)
    option.type = 'button'
    option.setAttribute('role', 'menuitem')
    if (fill) {
      const swatch = element('i', 'swatch')
      swatch.style.background = fill
      option.prepend(swatch)
    }
    option.addEventListener('click', action)
    parent.append(option)
    return option
  }
  function placeMenu(x, y) {
    menu.style.left = '0px'
    menu.style.top = '0px'
    menu.hidden = false
    const bounds = menu.getBoundingClientRect()
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - bounds.width - 8))}px`
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - bounds.height - 8))}px`
  }
  function showMenu(x, y) {
    menu.replaceChildren()
    menu.classList.add('compact-menu')
    const fills = new Set(
      state.items
        .filter((item) => selected.has(item.id) && styledItem(item))
        .map((item) => item.color || colors[0])
    )
    menuOption('取消排期', () => {
      if (cancelGesture || activeEdit) {
        return
      }
      const items = state.items.filter((item) => selected.has(item.id) && scheduled(item))
      if (!items.length) {
        return
      }
      const before = snapshot()
      items.forEach((item) => {
        item.start = null
        item.end = null
      })
      activeCell = undefined
      menu.hidden = true
      commit(before)
      focusKeyboard()
    })
    if (fills.size) {
      fillMenuBar(
        ['白色', '橙色', '黄色', '灰色'],
        colors,
        fills.size === 1 ? [...fills][0] : undefined,
        colorNodes
      )
      menuOption('Alt+5  红字 / 黑字', toggleTextColor)
    }
    themeMenuGroup()
    placeMenu(x, y)
  }
  $('.page-heading').addEventListener('contextmenu', showThemeMenu)
  scroll.addEventListener('contextmenu', (event) => {
    if (!event.defaultPrevented && !event.target.closest('input')) {
      showThemeMenu(event)
    }
  })
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('#node-menu')) {
      menu.hidden = true
    }
  })
  document.addEventListener('paste', (event) => {
    if (
      (!canvasFocus(event.target) && !cancelGesture) ||
      (event.target.closest('input,textarea,[contenteditable]') &&
        (event.target !== keyboardInput || activeEdit))
    ) {
      return
    }
    if (cancelGesture || activeEdit) {
      event.preventDefault()
      return
    }
    const entries =
      event.clipboardData
        ?.getData('text/plain')
        .split(/\r?\n/)
        .map((line) => line.split('\t')[0].trim())
        .filter(Boolean) || []
    if (!entries.length) {
      return
    }
    event.preventDefault()
    const row = rowFor(activeLane)
    if (!planRow(row)) {
      feedback('请先右键日期表头侧栏新增计划行', true)
      return
    }
    if (entries.length > 100) {
      feedback('一次最多粘贴 100 项', true)
      return
    }
    const before = snapshot()
    state.items.push(
      ...entries.map((name) => ({
        id: nextId(),
        lane: activeLane,
        name,
        start: null,
        end: null,
        node: row.kind === 'node',
        color: row.itemColor
      }))
    )
    commit(before)
  })
  function canvasFocus(target) {
    return (
      target === keyboardInput ||
      target === scroll ||
      Boolean(target.closest('.side-b[data-lane], .segment, .unscheduled'))
    )
  }
  function beginKeyboardEdit(preserveValue = false, composing = false) {
    if (activeEdit || cancelGesture) {
      return
    }
    const options = { input: keyboardInput, preserveValue, composing }
    const row = rowFor(selectedRow)
    if (planRow(row)) {
      editRowName(row, undefined, options)
      return
    }
    const item = itemAtCell() || state.items.find((entry) => selected.has(entry.id))
    if (item) {
      editName(item, false, options)
      return
    }
    if (!activeCell) {
      keyboardInput.value = ''
      return
    }
    const cellRow = rowFor(activeCell.rowId)
    if (!planRow(cellRow)) {
      return
    }
    editName(
      {
        lane: cellRow.id,
        start: activeCell.day,
        end: activeCell.day,
        name: '',
        node: cellRow.kind === 'node',
        color: cellRow.itemColor
      },
      true,
      options
    )
  }
  keyboardInput.addEventListener('compositionstart', () => {
    if (!activeEdit) {
      beginKeyboardEdit(true, true)
    }
  })
  keyboardInput.addEventListener('input', () => {
    if (!activeEdit) {
      beginKeyboardEdit(true)
    }
  })
  scroll.addEventListener('focus', () => {
    if (!activeCell && !selectedRow && !selected.size) {
      selectCell(activeLane, 0)
    } else {
      focusKeyboard()
    }
  })
  scroll.addEventListener('scroll', () => {
    if (activeEdit) {
      activeEdit.reposition?.()
    } else if (document.activeElement === keyboardInput) {
      const rect = keyboardRect()
      if (rect) {
        keyboardInput.style.left = `${rect.left}px`
        keyboardInput.style.top = `${rect.top}px`
      }
    }
  })
  document.addEventListener('keydown', (event) => {
    if (event.target.closest('#node-menu')) {
      if (event.key === 'Escape') {
        menu.hidden = true
        focusKeyboard()
        event.preventDefault()
      }
      return
    }
    if (
      (!canvasFocus(event.target) && !cancelGesture) ||
      (event.target.closest('input,textarea,[contenteditable]') &&
        (event.target !== keyboardInput || activeEdit))
    ) {
      return
    }
    if (event.isComposing || event.keyCode === 229) {
      return
    }
    const modifier = event.ctrlKey || event.metaKey
    const undoKey = modifier && event.key.toLowerCase() === 'z' && !event.shiftKey
    const redoKey =
      modifier &&
      (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))
    if ((cancelGesture || activeEdit) && event.key !== 'Escape' && !undoKey && !redoKey) {
      event.preventDefault()
      return
    }
    if (event.key === 'Escape') {
      if (cancelGesture) {
        cancelGesture()
      } else if (activeEdit) {
        activeEdit.cancel()
      } else {
        selected.clear()
        selectedRow = undefined
        activeCell = undefined
        refreshSelection()
        menu.hidden = true
      }
      event.preventDefault()
    } else if (undoKey || redoKey) {
      event.preventDefault()
      if (cancelGesture) {
        cancelGesture()
        return
      }
      if (activeEdit) {
        activeEdit.cancel()
        return
      }
      const source = redoKey ? future : history
      const destination = redoKey ? history : future
      if (source.length) {
        destination.push(snapshot())
        state = source.pop()
        selected.clear()
        selectedRow = undefined
        menu.hidden = true
        render()
      }
    } else if (event.key === 'Delete') {
      const covered = itemAtCell()
      const items = state.items.filter(
        (item) => selected.has(item.id) || (!selected.size && item.id === covered?.id)
      )
      if (!items.length) {
        return
      }
      event.preventDefault()
      const before = snapshot()
      const ids = new Set(items.map((item) => item.id))
      state.items = state.items.filter((item) => !ids.has(item.id))
      selected.clear()
      commit(before)
      feedback('条目已清除，可撤销')
    } else if (/^[1-4]$/.test(event.key) && event.altKey && !modifier) {
      event.preventDefault()
      colorNodes(colors[Number(event.key) - 1])
    } else if (event.key === '5' && event.altKey && !modifier) {
      event.preventDefault()
      toggleTextColor()
    } else if (event.key === 'F2' && !modifier && !event.altKey) {
      event.preventDefault()
      beginKeyboardEdit()
    } else if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(event.key) &&
      !modifier &&
      !event.altKey
    ) {
      event.preventDefault()
      navigate(event.key, event.shiftKey)
    } else if (
      event.key.length === 1 &&
      !modifier &&
      !event.altKey &&
      event.target !== keyboardInput
    ) {
      event.preventDefault()
      focusKeyboard()
      keyboardInput.value = event.key
      beginKeyboardEdit(true)
    }
  })
  render()
})()
