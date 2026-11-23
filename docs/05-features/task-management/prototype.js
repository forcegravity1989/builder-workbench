const $ = (id) => document.getElementById(id)
const icons = {
  wall: '<rect width="7" height="7" x="3" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="14" rx="1"></rect><rect width="7" height="7" x="3" y="14" rx="1"></rect>',
  package:
    '<path d="M12 22V12"></path><path d="m16 17 2 2 4-4"></path><path d="M21 11.127V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.32-.753"></path><path d="M3.29 7 12 12l8.71-5"></path><path d="m7.5 4.27 8.997 5.148"></path>',
  overview:
    '<rect width="7" height="9" x="3" y="3" rx="1"></rect><rect width="7" height="5" x="14" y="3" rx="1"></rect><rect width="7" height="9" x="14" y="12" rx="1"></rect><rect width="7" height="5" x="3" y="16" rx="1"></rect>',
  list: '<path d="M3 5h.01"></path><path d="M3 12h.01"></path><path d="M3 19h.01"></path><path d="M8 5h13"></path><path d="M8 12h13"></path><path d="M8 19h13"></path>',
  clock:
    '<path d="M16 14v2.2l1.6 1"></path><path d="M16 2v4"></path><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"></path><path d="M3 10h5"></path><path d="M8 2v4"></path><circle cx="16" cy="16" r="6"></circle>',
  book: '<path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path>',
  server:
    '<path d="M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8"></path><path d="M10 19v-3.96 3.15"></path><path d="M7 19h5"></path><rect width="6" height="10" x="16" y="12" rx="2"></rect>',
  settings:
    '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path><circle cx="12" cy="12" r="3"></circle>',
  plus: '<path d="M5 12h14"></path><path d="M12 5v14"></path>',
  refresh:
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path>',
  issue: '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="1"></circle>',
  pr: '<circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M13 6h3a2 2 0 0 1 2 2v7"></path><line x1="6" x2="6" y1="9" y2="21"></line>'
}
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || ''}</svg>`
document.querySelectorAll('[data-icon]').forEach((node) => {
  node.innerHTML = icon(node.dataset.icon)
})
const seed = Array.from({ length: 18 }, (_, i) => ({
  id: 901 + i,
  kind: i < 12 ? 'issue' : 'pr',
  repo: i % 4 === 0 ? 'demo-service' : 'builder-workbench',
  title: [
    '任务列表读取失败时保留筛选条件',
    '项目选择器支持搜索登记项目',
    '返回列表恢复分页和滚动位置',
    '明确任务来源和仓库身份',
    '刷新任务后同步更新时间',
    '空结果显示清除筛选入口'
  ][i % 6],
  assignee: i % 2 ? '小多' : '陈晨',
  label: i % 3 ? '界面' : '协议',
  state: i === 5 || i === 16 ? 'closed' : 'open',
  author: i % 2 ? '小多' : '陈晨',
  review: i % 2 === 0,
  body: '用户从任务屏查找项目内的工作项，进入详情核对内容后返回列表。\n\n验收：项目、任务类型与编号保持一致；取消操作不改变任务。',
  comments: []
}))
let data, kind, preset, query, projectSet, filters, page, selected
const pageSize = 6
function reset() {
  data = structuredClone(seed)
  kind = 'issue'
  preset = 'open'
  query = ''
  projectSet = ['builder-workbench']
  filters = { state: 'open', assignee: 'all', label: 'all' }
  page = 0
  selected = null
  $('search').value = ''
  $('scenario').value = 'normal'
  $('journey').value = 'list'
  $('detail').hidden = true
  $('list').hidden = false
  render()
}
function matching() {
  return data.filter(
    (row) =>
      row.kind === kind &&
      (!filters.author || filters.author === 'all' || row.author === filters.author) &&
      projectSet.includes(row.repo) &&
      (filters.state === 'all' || row.state === filters.state) &&
      (filters.assignee === 'all' || row.assignee === filters.assignee) &&
      (filters.label === 'all' || row.label === filters.label) &&
      (preset !== 'mine' || (kind === 'issue' ? row.assignee : row.author) === '小多') &&
      (preset !== 'review' || row.review) &&
      (!query || `${row.id} ${row.title} ${row.repo}`.toLowerCase().includes(query.toLowerCase()))
  )
}
function render() {
  document.querySelectorAll('[data-kind]').forEach((b) => {
    b.classList.toggle('active', b.dataset.kind === kind)
    b.setAttribute('aria-pressed', String(b.dataset.kind === kind))
  })
  $('search').placeholder = '按标题、编号或仓库搜索演示任务…'
  $('projects').textContent =
    projectSet.length === 1 ? `${projectSet[0]} ⌄` : `${projectSet.length} 个项目 ⌄`
  $('presets').replaceChildren()
  const options =
    kind === 'issue'
      ? [
          ['open', '开放'],
          ['mine', '分配给我']
        ]
      : [
          ['open', '开放'],
          ['mine', '我的'],
          ['review', '待评审']
        ]
  options.forEach(([id, label]) => {
    const b = document.createElement('button')
    b.textContent = label
    b.classList.toggle('active', preset === id)
    b.onclick = () => {
      preset = id
      filters.state = 'open'
      page = 0
      render()
    }
    $('presets').append(b)
  })
  $('filterSummary').textContent = [
    filters.state !== 'open' ? `状态：${filters.state}` : '',
    filters.assignee !== 'all' ? `负责人：${filters.assignee}` : '',
    filters.label !== 'all' ? `标签：${filters.label}` : ''
  ]
    .filter(Boolean)
    .join(' · ')
  $('head').innerHTML = `<tr>${[
    'ID',
    '标题 / 上下文',
    ...(kind === 'issue' ? ['负责人', '标签', '状态'] : ['评审人', '检查项', '合并']),
    '已更新',
    ''
  ]
    .map((x) => `<th>${x}</th>`)
    .join('')}</tr>`
  const all = $('scenario').value === 'normal' ? matching() : []
  const count = Math.max(1, Math.ceil(all.length / pageSize))
  page = Math.min(page, count - 1)
  $('rows').replaceChildren()
  all.slice(page * pageSize, (page + 1) * pageSize).forEach((row) => {
    const tr = document.createElement('tr')
    const id = document.createElement('td')
    id.innerHTML = `<span class="badge">${icon(row.kind)} #${row.id}</span>`
    tr.append(id)
    const td = document.createElement('td')
    td.className = 'title'
    const b = document.createElement('button')
    b.textContent = row.title
    b.onclick = () => openDetail(row)
    td.append(b)
    const sub = document.createElement('small')
    sub.textContent = `${row.author} · ${row.repo}`
    td.append(sub)
    tr.append(td)
    const cells =
      kind === 'issue'
        ? [row.assignee, row.label, row.state === 'open' ? '打开' : '已关闭']
        : ['陈晨', row.id % 2 ? '通过' : '进行中', row.state === 'closed' ? '已关闭' : '待合入']
    for (const [index, value] of [...cells, '2 小时前'].entries()) {
      const cell = document.createElement('td')
      cell.textContent = value
      if (kind === 'issue' && index < 3) {
        const key = ['assignee', 'label', 'state'][index]
        const button = document.createElement('button')
        button.textContent = `${value} ⌄`
        button.setAttribute('aria-label', `修改 #${row.id} ${['负责人', '标签', '状态'][index]}`)
        button.onclick = () => {
          const menu = $('rowMenu')
          menu.replaceChildren()
          const choices =
            key === 'state'
              ? [
                  ['open', '打开'],
                  ['closed', '已关闭']
                ]
              : (key === 'assignee' ? ['小多', '陈晨'] : ['界面', '协议']).map((x) => [x, x])
          choices.forEach(([next, label]) => {
            const option = document.createElement('button')
            option.textContent = label
            option.onclick = () => {
              row[key] = next
              menu.hidePopover()
              render()
            }
            menu.append(option)
          })
          const rect = button.getBoundingClientRect()
          menu.style.left = `${Math.min(rect.left, innerWidth - 300)}px`
          menu.style.top = `${rect.bottom}px`
          menu.showPopover()
        }
        cell.replaceChildren(button)
      }
      tr.append(cell)
    }
    appendRowActions(tr, row)
    $('rows').append(tr)
  })
  $('notice').replaceChildren()
  if (!all.length) {
    $('notice').textContent =
      $('scenario').value === 'error'
        ? '无法读取 GitHub 任务。网络连接失败。'
        : query || filters.label !== 'all' || preset !== 'open'
          ? '没有匹配当前筛选的任务。'
          : '当前范围没有任务。'
    const retry = document.createElement('button')
    retry.textContent = $('scenario').value === 'error' ? '重试' : '清除筛选'
    retry.onclick = () => {
      if ($('scenario').value === 'error') {
        $('scenario').value = 'normal'
        render()
        return
      }
      $('scenario').value = 'normal'
      query = ''
      $('search').value = ''
      preset = 'open'
      filters = { state: 'open', assignee: 'all', label: 'all' }
      render()
    }
    $('notice').append(' ', retry)
  }
  $('page').replaceChildren()
  for (let index = 0; index < count; index++) {
    const button = document.createElement('button')
    button.textContent = String(index + 1)
    button.classList.toggle('active', index === page)
    if (index === page) {
      button.setAttribute('aria-current', 'page')
    }
    button.onclick = () => {
      page = index
      render()
    }
    $('page').append(button)
  }
  $('prev').disabled = page === 0
  $('next').disabled = page >= count - 1
}
function renderDetailBase(row) {
  selected = row
  $('list').hidden = true
  $('detail').hidden = false
  $('identity').textContent = `${row.repo} · #${row.id}`
  $('detailTitle').textContent = row.title
  $('detailState').textContent = row.state === 'open' ? '打开' : '已关闭'
  $('tabs').replaceChildren()
  const tabs = row.kind === 'issue' ? ['对话'] : ['对话', '检查项', '文件变更']
  tabs.forEach((name) => {
    const b = document.createElement('button')
    b.textContent = name
    b.onclick = () => {
      ;[...$('tabs').children].forEach((x) => x.classList.toggle('active', x === b))
      $('body').replaceChildren()
      if (name === '文件变更') {
        const pre = document.createElement('pre')
        pre.textContent = 'src/task-list.ts\n@@ -1,2 +1,2 @@\n- return [];\n+ return loadedTasks;'
        $('body').append(pre)
      } else {
        const p = document.createElement('p')
        p.style.whiteSpace = 'pre-line'
        p.textContent =
          name === '检查项'
            ? `lint / typecheck：${row.id % 2 ? '通过' : '进行中'}\n协议检查：通过\n更新于 2 小时前`
            : row.body
        $('body').append(p)
      }
    }
    $('tabs').append(b)
  })
  $('tabs').firstChild.click()
}
$('back').onclick = () => {
  $('detail').hidden = true
  $('list').hidden = false
  selected = null
  render()
}
document.querySelectorAll('[data-kind]').forEach(
  (b) =>
    (b.onclick = () => {
      kind = b.dataset.kind
      preset = 'open'
      page = 0
      render()
    })
)
$('search').oninput = () => {
  query = $('search').value
  page = 0
  render()
}
$('prev').onclick = () => {
  page--
  render()
}
$('next').onclick = () => {
  page++
  render()
}
$('filters').onclick = () => {
  filterSections()
  showPicker('filterDialog', 'filters')
}

$('projects').onclick = () => {
  document
    .querySelectorAll('[name=repo]')
    .forEach((x) => (x.checked = projectSet.includes(x.value)))
  showPicker('projectDialog', 'projects')
}
$('applyProjects').onclick = () => {
  $('projectDialog').hidePopover()
  projectSet = [...document.querySelectorAll('[name=repo]:checked')].map((x) => x.value)
  page = 0
  render()
}
function create() {
  $('createError').textContent = ''
  $('createDialog').showModal()
  $('createTitle').focus()
}
$('new').onclick = create
$('cancelCreate').onclick = () => $('createDialog').close()
$('createForm').onsubmit = (event) => {
  event.preventDefault()
  if ($('scenario').value === 'error') {
    $('createError').textContent = '创建失败：无法连接 GitHub。草稿已保留，恢复网络后重试。'
    return
  }
  const title = $('createTitle').value.trim()
  if (!title) {
    $('createError').textContent = '填写标题。'
    return
  }
  data.unshift({
    id: Math.max(...data.map((x) => x.id)) + 1,
    kind: 'issue',
    repo: $('createRepo').value,
    title,
    body: $('createBody').value,
    assignee: '小多',
    author: '小多',
    label: '界面',
    state: 'open',
    comments: []
  })
  kind = 'issue'
  preset = 'open'
  projectSet = [$('createRepo').value]
  filters = { state: 'open', assignee: 'all', label: 'all' }
  query = ''
  $('search').value = ''
  page = 0
  $('createDialog').close()
  $('createForm').reset()
  render()
}
$('refresh').onclick = () => {
  $('refresh').disabled = true
  $('notice').textContent = '正在读取任务…'
  setTimeout(() => {
    $('refresh').disabled = false
    $('scenario').value = 'normal'
    render()
  }, 350)
}
$('scenario').onchange = () => {
  if (!selected) {
    render()
  }
}
$('journey').onchange = () => {
  if ($('journey').value === 'create') {
    create()
  } else {
    $('back').click()
  }
}
$('theme').onchange = () =>
  document.documentElement.classList.toggle('dark', $('theme').value === 'dark')
$('reset').onclick = () => {
  document.querySelectorAll(':popover-open').forEach((x) => x.hidePopover())
  document.querySelectorAll('dialog[open]').forEach((x) => x.close())
  $('createForm').reset()
  reset()
}
$('evidence').onclick = () => $('evidenceDialog').showModal()
reset()
function showPicker(id, anchor) {
  const rect = $(anchor).getBoundingClientRect()
  const node = $(id)
  node.style.left = `${Math.min(rect.left, innerWidth - 300)}px`
  node.style.top = `${rect.bottom + 6}px`
  node.showPopover()
}
document
  .querySelectorAll('[data-dismiss]')
  .forEach((b) => (b.onclick = () => $(b.dataset.dismiss).hidePopover()))

$('references').onclick = () => $('evidenceDialog').showModal()
function workspaceBoundary(row) {
  $('handoffText').textContent =
    `${row.repo} · #${row.id} · ${row.id % 2 ? '创建新工作区' : '打开已关联工作区'}`
  $('handoff').showModal()
}
function appendRowActions(tr, row) {
  const td = document.createElement('td')
  const start = document.createElement('button')
  start.textContent = row.id % 2 ? '开始 →' : '打开 →'
  start.setAttribute('aria-label', `${start.textContent} #${row.id} 的工作区`)
  start.onclick = () => workspaceBoundary(row)
  const more = document.createElement('button')
  more.textContent = '⋯'
  more.setAttribute('aria-label', `更多 #${row.id}`)
  more.onclick = () => {
    const menu = $('rowMenu')
    menu.replaceChildren()
    for (const [name, action] of [
      ['查看详情', () => openDetail(row)],
      ['开始新工作区', () => workspaceBoundary(row)]
    ]) {
      const button = document.createElement('button')
      button.textContent = name
      button.onclick = () => {
        menu.hidePopover()
        action()
      }
      menu.append(button)
    }
    const r = more.getBoundingClientRect()
    menu.style.left = `${Math.min(r.left, innerWidth - 300)}px`
    menu.style.top = `${r.bottom}px`
    menu.showPopover()
  }
  td.append(start, more)
  tr.append(td)
}
function filterSections() {
  const menu = $('filterDialog')
  menu.replaceChildren()
  const options = {
    state: [
      ['open', '打开'],
      ['closed', '已关闭'],
      ['all', '全部']
    ],
    author: [
      ['all', '全部'],
      ['小多', '小多'],
      ['陈晨', '陈晨']
    ],
    assignee: [
      ['all', '全部'],
      ['小多', '小多'],
      ['陈晨', '陈晨']
    ],
    label: [
      ['all', '全部'],
      ['界面', '界面'],
      ['协议', '协议']
    ]
  }
  for (const [key, name] of [
    ['state', '状态'],
    ['author', '作者'],
    ['label', '标签'],
    ['assignee', '负责人']
  ]) {
    const b = document.createElement('button')
    b.textContent = `${name} ›`
    b.onclick = () => {
      menu.replaceChildren()
      const back = document.createElement('button')
      back.textContent = `← ${name}`
      back.onclick = filterSections
      menu.append(back)
      options[key].forEach(([value, label]) => {
        const item = document.createElement('button')
        item.textContent = label + (filters[key] === value ? ' ✓' : '')
        item.onclick = () => {
          filters[key] = value
          page = 0
          render()
          filterSections()
        }
        menu.append(item)
      })
    }
    menu.append(b)
  }
}
function openDetail(row) {
  $('tabs').hidden = false
  renderDetailBase(row)
  $('detailTitle').textContent = `${row.title} #${row.id}`
  const launch = document.createElement('button')
  launch.className = 'detail-launch'
  launch.textContent = row.id % 2 ? '从议题开始工作区 →' : '打开工作区 →'
  launch.onclick = () => workspaceBoundary(row)
  $('detailTitle').append(launch)
  if (row.kind !== 'issue') {
    return
  }
  $('tabs').hidden = true
  const body = $('body')
  body.replaceChildren()
  const properties = document.createElement('div')
  properties.className = 'properties'
  for (const [key, value] of [
    ['状态', row.state === 'open' ? '打开' : '已关闭'],
    ['负责人', row.assignee],
    ['标签', row.label],
    ['工作区', row.id % 2 ? '未关联' : '任务处理工作区']
  ]) {
    const cell = document.createElement('div')
    const label = document.createElement('small')
    label.textContent = key
    const content = document.createElement('div')
    content.textContent = value
    cell.append(label, content)
    properties.append(cell)
  }
  body.append(properties)
  const description = document.createElement('section')
  description.className = 'conversation'
  const head = document.createElement('header')
  head.textContent = `${row.author} · 2 小时前`
  const text = document.createElement('p')
  text.style.whiteSpace = 'pre-line'
  text.textContent = row.body
  description.append(head, text)
  body.append(description)
  const comment = document.createElement('section')
  comment.className = 'conversation'
  comment.innerHTML =
    '<header>陈晨 · 1 小时前</header><p>已核对来源与编号，继续跟进详情返回路径。</p>'
  body.append(comment)
  const form = document.createElement('form')
  form.className = 'comment-form'
  const input = document.createElement('textarea')
  input.rows = 3
  input.placeholder = '留下评论'
  input.required = true
  input.setAttribute('aria-label', '评论正文')
  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.textContent = '评论'
  form.append(input, submit)
  form.onsubmit = (event) => {
    event.preventDefault()
    form.querySelector('[role="alert"]')?.remove()
    if ($('scenario').value === 'error') {
      const error = document.createElement('p')
      error.setAttribute('role', 'alert')
      error.textContent = '评论发送失败，草稿已保留。'
      form.append(error)
      return
    }
    const entry = document.createElement('section')
    entry.className = 'conversation'
    const who = document.createElement('header')
    who.textContent = '小多 · 刚刚'
    const content = document.createElement('p')
    content.textContent = input.value
    entry.append(who, content)
    body.insertBefore(entry, form)
    row.comments.push(input.value)
    input.value = ''
  }
  for (const saved of row.comments) {
    const entry = document.createElement('section')
    entry.className = 'conversation'
    const who = document.createElement('header')
    who.textContent = '小多'
    const content = document.createElement('p')
    content.textContent = saved
    entry.append(who, content)
    body.append(entry)
  }
  body.append(form)
}
$('projectSearch').oninput = () => {
  const query = $('projectSearch').value.toLowerCase()
  document
    .querySelectorAll('[name=repo]')
    .forEach((x) => (x.closest('label').hidden = !x.value.toLowerCase().includes(query)))
}
$('screenHelp').onclick = () => $('helpDialog').showModal()
