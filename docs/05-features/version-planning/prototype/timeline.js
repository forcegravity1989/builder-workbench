/* Prototype data is fictional. All edits stay in this page. */
;(() => {
  const origin = Date.UTC(2026, 6, 1)
  const days = 92
  const pixels = (characters) => Math.round(7 * characters + 5)
  const columnIndex = (letters) =>
    [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 3
  const columnWidths = Array(days)
  const widthGroups = [
    [2.35546875, 'C:J,AH:AL,AO:AP,BM:BN,BQ:BR,BT:BU'],
    [3.35546875, 'M:O,Q,T:U,X,AB:AE,AR,AU:AW,BB:BE,BH:BL,BX:BY,CD:CE,CK:CN'],
    [12.35546875, 'K,Y'],
    [13.5, 'R,AF,AM,AS,AZ,BO,BV,CB,CG'],
    [17.2109375, 'S'],
    [17.85546875, 'L,P,V:W,Z:AA,AG,AQ,AT,AX:AY,BA,BF:BG,BP'],
    [15.35546875, 'BS,BW,BZ:CA,CC,CH:CI'],
    [28.5, 'AN'],
    [5.85546875, 'CF'],
    [18.35546875, 'CJ'],
    [14.140625, 'CO'],
    [14.35546875, 'CP']
  ]
  widthGroups.forEach(([width, ranges]) =>
    ranges.split(',').forEach((range) => {
      const [first, last = first] = range.split(':')
      for (let day = columnIndex(first); day <= columnIndex(last); day++) {
        columnWidths[day] = pixels(width)
      }
    })
  )
  if (
    columnWidths.some((width) => !Number.isFinite(width)) ||
    columnWidths.filter(Boolean).length !== days
  ) {
    throw new Error('日期列宽不完整')
  }
  const columnEdges = [0]
  columnWidths.forEach((width) => columnEdges.push(columnEdges.at(-1) + width))
  const chartWidth = columnEdges.at(-1)
  const rowHeights = [
    16.5, 14.6, 14.6, 16.5, 16.5, 60.65, 16.5, 16.5, 16.5, 16.5, 16.5, 16.5, 16.5, 45.65, 27.45,
    58.3, 34.85
  ].map((height) => Math.max(24, Math.round((height * 4) / 3)))
  let layoutRowHeights = [...rowHeights]
  const dateAt = (day) => new Date(origin + day * 86400000).toISOString().slice(0, 10)
  const date = (day) => new Date(origin + day * 86400000)
  const $ = (query) => document.querySelector(query)
  const grid = $('#timeline-grid')
  const scroll = $('.sheet-scroll')
  const status = $('#gesture-status')
  const menu = $('#node-menu')
  const laneNames = [
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
  ]
  const colors = ['#FFFFFF', '#FFC000', '#FFFF00', '#D9D9D9']
  let sequence = 20
  const nextId = () => `segment-${++sequence}`
  const selected = new Set()
  const history = []
  let activeLane = 8
  let cancelGesture
  let activeEdit
  let statusTimer
  let state = {
    version: '示例版本',
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
    })
  }
  function select(item, extend = false) {
    activeLane = item.lane
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
  function position(node, item) {
    node.style.left = `${columnEdges[item.start]}px`
    node.style.width = `${columnEdges[item.end + 1] - columnEdges[item.start]}px`
    node.style.top = `${Math.max(1, Math.round((layoutRowHeights[item.lane] - 24) / 2))}px`
    node.style.background = item.node || item.lane === 4 ? item.color || colors[0] : colors[0]
    node.style.color = item.textColor || '#000000'
    node.setAttribute(
      'aria-label',
      `${item.name || '新时段'}，${dateAt(item.start)} 至 ${dateAt(item.end)}`
    )
  }
  const rawDay = (event, track) => {
    const x = event.clientX - track.getBoundingClientRect().left
    if (x < 0) {
      return Math.floor(x / columnWidths[0])
    }
    if (x >= chartWidth) {
      return days + Math.floor((x - chartWidth) / columnWidths.at(-1))
    }
    let low = 0
    let high = days
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2)
      if (columnEdges[middle] <= x) {
        low = middle
      } else {
        high = middle
      }
    }
    return low
  }
  const pointDay = (event, track) => Math.max(0, Math.min(days - 1, rawDay(event, track)))
  function gesture(event, node, track, preview, describe, options = {}) {
    if (event.button !== 0 || event.shiftKey || cancelGesture || activeEdit) {
      options.cleanup?.()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const before = snapshot()
    const previousSelection = [...selected]
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
        selected.clear()
        previousSelection.forEach((entry) => selected.add(entry))
        render()
        if (invalid && !cancelled) {
          feedback(`${invalid}；本次调整已取消`, true)
        }
      } else if (started) {
        commit(before)
        options.onComplete?.()
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
  function editName(item, draft = false) {
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
    if (!node) {
      node = segmentNode(item, track, true)
      track.append(node)
    }
    node.classList.add('editing')
    const input = element('input', 'inline-name')
    input.value = item.name || ''
    input.maxLength = 100
    input.setAttribute('aria-label', '时段名称')
    node.replaceChildren(input)
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
  function makeRange(event, track, lane) {
    if (event.target.closest('.segment') || event.button !== 0 || event.shiftKey || activeEdit) {
      return
    }
    activeLane = lane
    refreshSelection()
    const pending = state.items.find(
      (item) => item.lane === lane && !scheduled(item) && selected.has(item.id)
    )
    if (lane === 5 && !pending) {
      selected.clear()
      refreshSelection()
      return
    }
    const anchor = pointDay(event, track)
    const range = {
      lane,
      start: anchor,
      end: anchor,
      name: pending?.name || '',
      node: lane === 5,
      color: pending?.color || (lane === 4 ? colors[1] : undefined)
    }
    const ghost = segmentNode(range, track, true)
    ghost.classList.add('ghost')
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
        cleanup: () => ghost.remove(),
        onComplete: () => {
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
        select(item, event.shiftKey)
      }
    })
    node.addEventListener('dblclick', (event) => {
      event.stopPropagation()
      editName(item)
    })
    node.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.shiftKey || activeEdit) {
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
          }
        }
      )
    })
    node.addEventListener('contextmenu', (event) => {
      if (!item.node && item.lane !== 4) {
        return
      }
      event.preventDefault()
      select(item)
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
        select(item, event.shiftKey)
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
            commit(before)
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
    if (row <= 6 && column > 1) {
      node.classList.add('header-cell')
      node.style.top = `${layoutRowHeights.slice(0, row - 1).reduce((sum, height) => sum + height, 0)}px`
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
  function render() {
    if (cancelGesture || activeEdit) {
      return
    }
    grid.replaceChildren()
    layoutRowHeights = [...rowHeights]
    grid.style.setProperty('--a', `${pixels(7.85546875)}px`)
    grid.style.setProperty('--b', `${pixels(26)}px`)
    grid.style.setProperty('--chart', `${chartWidth}px`)
    grid.style.gridTemplateRows = layoutRowHeights.map((height) => `${height}px`).join(' ')
    const iteration = cell('side-a iteration-label', 1, 1)
    iteration.style.gridRow = '1 / 6'
    iteration.textContent = '迭代'
    const version = cell('side-a', 6, 1)
    version.style.gridRow = '6 / 18'
    const versionLabel = element('div', 'version-label', '版本')
    const versionName = element('span', 'version-name', state.version)
    versionName.tabIndex = 0
    versionName.addEventListener('dblclick', () => editVersion(versionName))
    versionLabel.append(versionName)
    version.append(versionLabel)
    laneNames.forEach((name, lane) => {
      const rail = cell(
        `side-b${lane < 5 ? ' blue-rail' : ''}${lane === 16 ? ' external-lane' : ''}`,
        lane + 1,
        2
      )
      rail.append(element('strong', '', name))
      if (lane >= 3) {
        rail.dataset.lane = lane
        rail.addEventListener('click', () => {
          activeLane = lane
          refreshSelection()
        })
        const pending = state.items.filter((item) => item.lane === lane && !scheduled(item))
        if (pending.length) {
          const backlog = element('div', 'backlog')
          pending.forEach((item) => backlog.append(backlogNode(item)))
          rail.append(backlog)
        }
      }
      const track = cell('track', lane + 1, 3)
      if (lane === 0) {
        track.classList.add('month-band')
        for (const [label, count] of [
          ['2026 年 7 月', 31],
          ['2026 年 8 月', 31],
          ['2026 年 9 月', 30]
        ]) {
          const month = element('div', '', label)
          const start = label.includes('7 月') ? 0 : label.includes('8 月') ? 31 : 62
          month.style.width = `${columnEdges[start + count] - columnEdges[start]}px`
          track.append(month)
        }
      } else if (lane < 3) {
        track.classList.add(lane === 1 ? 'date-band' : 'weekday-band')
        for (let day = 0; day < days; day++) {
          const current = date(day)
          const dayCell = element(
            'div',
            [0, 6].includes(current.getUTCDay()) ? 'weekend' : '',
            lane === 1
              ? String(current.getUTCDate())
              : ['日', '一', '二', '三', '四', '五', '六'][current.getUTCDay()]
          )
          dayCell.style.width = `${columnWidths[day]}px`
          track.append(dayCell)
        }
      } else {
        track.dataset.lane = lane
        track.setAttribute('aria-label', `${name}泳道`)
        for (let day = 0; day < days; day++) {
          const shade = element('div', 'day-shade')
          shade.style.left = `${columnEdges[day]}px`
          shade.style.width = `${columnWidths[day]}px`
          track.append(shade)
        }
        state.items
          .filter((item) => item.lane === lane && scheduled(item))
          .forEach((item) => track.append(segmentNode(item, track)))
        track.addEventListener('pointerdown', (event) => makeRange(event, track, lane))
        if (lane === 5) {
          track.addEventListener('dblclick', (event) => {
            if (event.target.closest('.segment') || activeEdit) {
              return
            }
            activeLane = lane
            const point = pointDay(event, track)
            const candidate = {
              lane,
              start: point,
              end: point,
              name: '',
              node: true,
              color: colors[1]
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
    grid.querySelectorAll('.side-b[data-lane]').forEach((rail) => {
      const backlog = rail.querySelector('.backlog')
      if (!backlog) {
        return
      }
      const lane = Number(rail.dataset.lane)
      const contentHeight =
        rail.querySelector('strong').getBoundingClientRect().height +
        backlog.getBoundingClientRect().height +
        13
      layoutRowHeights[lane] = Math.max(rowHeights[lane], Math.ceil(contentHeight))
    })
    grid.style.gridTemplateRows = layoutRowHeights.map((height) => `${height}px`).join(' ')
    grid.querySelectorAll('.header-cell').forEach((node) => {
      const row = Number(node.style.gridRow)
      node.style.top = `${layoutRowHeights.slice(0, row - 1).reduce((sum, height) => sum + height, 0)}px`
    })
    state.items
      .filter(scheduled)
      .forEach((item) => position(grid.querySelector(`.segment[data-item="${item.id}"]`), item))
    refreshSelection()
  }
  function colorNodes(color) {
    if (cancelGesture || activeEdit) {
      return
    }
    const nodes = state.items.filter(
      (item) => selected.has(item.id) && (item.node || item.lane === 4)
    )
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
    const items = state.items.filter(
      (item) => selected.has(item.id) && (item.node || item.lane === 4)
    )
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
  function showMenu(x, y) {
    menu.replaceChildren()
    ;['白色', '橙色', '黄色', '灰色'].forEach((name, index) => {
      const option = element('button', '', `${index + 1}  ${name}`)
      option.type = 'button'
      option.setAttribute('role', 'menuitem')
      const swatch = element('i', 'swatch')
      swatch.style.background = colors[index]
      option.prepend(swatch)
      option.addEventListener('click', () => colorNodes(colors[index]))
      menu.append(option)
    })
    const textOption = element('button', '', '5  红字 / 黑字')
    textOption.type = 'button'
    textOption.setAttribute('role', 'menuitem')
    textOption.addEventListener('click', toggleTextColor)
    menu.append(textOption)
    menu.style.left = `${Math.min(x, innerWidth - 140)}px`
    menu.style.top = `${Math.min(y, innerHeight - 150)}px`
    menu.hidden = false
  }
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('#node-menu')) {
      menu.hidden = true
    }
  })
  document.addEventListener('paste', (event) => {
    if (event.target.closest('input,textarea,[contenteditable]')) {
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
        node: activeLane === 5,
        color: colors[1]
      }))
    )
    commit(before)
  })
  document.addEventListener('keydown', (event) => {
    if (event.target.closest('input,textarea,[contenteditable]')) {
      return
    }
    const undoKey = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z'
    if ((cancelGesture || activeEdit) && event.key !== 'Escape' && !undoKey) {
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
        refreshSelection()
        menu.hidden = true
      }
      event.preventDefault()
    } else if (undoKey) {
      event.preventDefault()
      if (cancelGesture) {
        cancelGesture()
        return
      }
      if (activeEdit) {
        activeEdit.cancel()
        return
      }
      if (history.length) {
        state = history.pop()
        selected.clear()
        render()
      }
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      const items = state.items.filter((item) => selected.has(item.id) && scheduled(item))
      if (!items.length) {
        return
      }
      event.preventDefault()
      const before = snapshot()
      items.forEach((item) => {
        item.start = null
        item.end = null
      })
      commit(before)
    } else if (/^[1-4]$/.test(event.key) && !event.ctrlKey && !event.metaKey) {
      colorNodes(colors[Number(event.key) - 1])
    } else if (event.key === '5' && !event.ctrlKey && !event.metaKey) {
      toggleTextColor()
    } else if (event.key === 'Enter') {
      const item = state.items.find((entry) => selected.has(entry.id) && scheduled(entry))
      if (item) {
        event.preventDefault()
        editName(item)
      }
    }
  })
  render()
})()
