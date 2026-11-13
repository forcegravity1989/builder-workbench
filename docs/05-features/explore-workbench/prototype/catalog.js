// 仅用于布局评审；内容覆盖与运行证据以 guidance.md 为准。
const features = {
  F01: ['工作区', '把一件事放进独立工作区，保留它的文件与执行上下文。', true],
  F02: ['任务管理', '找到待处理的任务，从同一处进入工作并回看结果。', true],
  F03: ['智能体运行状态', '辨认正在运行、等待回应和受阻的工作。', true],
  F04: ['智能体编排', '查看已有的多智能体编排介绍。', true],
  F05: ['账号用量', '了解当前账号的用量与额度状态。', true],
  F06: ['终端与会话', '在终端和分屏中开展工作，之后回到原来的会话。', true],
  F07: ['编辑器', '在工作过程中打开和编辑文件。', true],
  F08: ['内置浏览器与批注', '查看页面或原型，把具体位置和意见带回工作。', true],
  F09: ['差异与评审', '检查文件改动，留下意见并继续处理。', true],
  F10: ['PR 检查', '查看 PR 的检查结果与评论。', true],
  F11: ['提交与交付', '让 AI 准备提交和 PR，由人核对交付。', true],
  F12: ['工作区看板', '查看工作区状态，切回正在处理的工作。', false],
  F14: ['自动化', '了解现有自动化的创建、启停和运行入口。', false],
  F16: ['快捷跳转', '快速找到并进入一个工作区或会话。', false],
  F18: ['项目里程碑', '安排阶段成果与时间，再对照实际交付。', false],
  F19: ['项目墙', '查看多个项目，找到这次要进入的工作。', false],
  F20: ['纳入项目', '添加项目并进入工作，项目背景可以按需补充。', false],
  F21: ['项目总览', '查看项目方向、阶段安排和真实读数。', false],
  F22: ['版本计划', '确定这一版做什么、怎样验收，并安排任务。', false],
  F23: ['版本与会话导航', '从版本和目标找到对应工作区与会话。', false],
  F24: ['评审通知与共享主机', '建立必要连接，请同伴检视改动，并从通知进入 PR。', false],
  F25: ['版本验收', '对照目标核验证据，由人确认结果并归档。', false],
  F27: ['版本总览', '查看本版目标、任务和验收事实。', false],
  F28: ['指标配置与采集', '明确度量口径，查看真实读数与缺失原因。', false],
  F29: ['CodeHub / WeLink', '配置沿 BW 入门，具体使用结合任务和协作场景。', false]
}
const groups = [
  { id: 'projects', name: '项目墙与纳入', items: ['F19', 'F20'] },
  { id: 'overview', name: '项目总览', items: ['F21', 'F18', 'F28'] },
  { id: 'planning', name: '版本计划与导航', items: ['F22', 'F23'] },
  { id: 'execution', name: '任务与执行', items: ['F02', 'F01', 'F06'] },
  { id: 'browser', name: '内置浏览器', items: ['F08'] },
  { id: 'review', name: '检视与协作', items: ['F09', 'F24'] },
  { id: 'acceptance', name: '验收与版本事实', items: ['F25', 'F27'] },
  { id: 'automation', name: '自动化', items: ['F14'] },
  { id: 'agents', name: '智能体编排', items: ['F04'] }
]
const related = {
  F01: ['F03', 'F12', 'F16'],
  F02: ['F29'],
  F06: ['F03', 'F05', 'F07'],
  F08: ['F24'],
  F09: ['F07', 'F10', 'F11'],
  F22: ['F23'],
  F23: ['F16'],
  F24: ['F08', 'F29'],
  F25: ['F29'],
  F27: ['F25']
}
const journeys = [
  {
    title: '建立项目方向与阶段安排',
    summary: '说清想做成什么，把共同方向落到阶段成果。',
    related: ['F21', 'F18']
  },
  {
    title: '确定本版承诺并开工',
    summary: '结合上版结果与新要求，形成可以执行、可以验收的计划。',
    related: ['F22', 'F23', 'F02']
  },
  {
    title: '把问题推进到可信交付',
    summary: '从任务开始，完成必要的讨论、开发、验证和同伴检视。',
    related: ['F02', 'F01', 'F08', 'F09', 'F24']
  },
  {
    title: '把本版承诺验收清楚',
    summary: '对照证据确认结果，留下结论与下一步安排。',
    related: ['F25', 'F27']
  },
  {
    title: '用真实效果保持方向',
    summary: '看进展与效果，发现偏差，决定后续投入。',
    related: ['F21', 'F28', 'F22']
  },
  {
    title: '让项目持续可维护',
    summary: '审视项目知识、架构与技术债，决定处理或暂缓，并验证结果。',
    building: true
  },
  {
    title: '让下次工作少操心',
    summary: '把真实工作中跑通的做法沉淀下来，在下次同类任务中复用并检验。',
    building: true
  }
]
let activeTab = 'feature'
let groupId = 'execution'
let featureId = 'F01'
let journeyIndex = 0
const catalog = document.querySelector('#catalog')
const content = document.querySelector('#content')
const html = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )

function relatedMarkup(ids = []) {
  if (!ids.length) {
    return ''
  }
  return `<section class="related"><h3>相关功能与操作</h3><div class="related-list">${ids.map((id) => `<button class="related-item" type="button" data-related="${id}">${html(features[id][0])}</button>`).join('')}</div></section>`
}

function render() {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    const selected = button.dataset.tab === activeTab
    button.setAttribute('aria-selected', String(selected))
    button.tabIndex = selected ? 0 : -1
  })
  document.querySelector('#explore-body').setAttribute('aria-labelledby', `tab-${activeTab}`)
  catalog.setAttribute('aria-label', activeTab === 'feature' ? '功能目录' : '工作旅程目录')
  if (activeTab === 'feature') {
    catalog.innerHTML = groups
      .map(
        (group) =>
          `<div class="group"><button class="group-button" type="button" data-group="${group.id}" aria-expanded="${group.id === groupId}">${html(group.name)}<span class="chevron" aria-hidden="true">${group.id === groupId ? '⌄' : '›'}</span></button>${group.id === groupId ? `<div class="children">${group.items.map((id) => `<button type="button" class="item" data-feature="${id}" aria-current="${id === featureId}"><span class="item-name">${html(features[id][0])}</span>${features[id][2] ? '' : '<span class="mini-state">准备中</span>'}</button>`).join('')}</div>` : ''}</div>`
      )
      .join('')
    const [title, description, available] = features[featureId]
    content.innerHTML = `<header class="content-heading"><span class="badge">${available ? '已有演示' : '内容准备中'}</span><h2>${html(title)}</h2><p>${html(description)}</p></header>${available ? `<div class="stage"><strong>现有${html(title)}演示</strong><p>原型仅标示内容所在位置。</p><p class="annotation">沿用现有正文与动画，本轮不重画。</p></div>` : ''}${relatedMarkup(related[featureId])}`
  } else {
    catalog.innerHTML = journeys
      .map(
        (journey, index) =>
          `<button class="journey" type="button" data-journey="${index}" aria-current="${index === journeyIndex}"><span class="journey-number" aria-hidden="true">${index + 1}</span><span class="journey-copy">${html(journey.title)}${journey.building ? '<span class="mini-state">建设中</span>' : ''}</span></button>`
      )
      .join('')
    const journey = journeys[journeyIndex]
    content.innerHTML = `<header class="content-heading"><span class="badge">${journey.building ? '建设中' : '内容准备中'}</span><h2>${html(journey.title)}</h2><p>${html(journey.summary)}</p></header>${relatedMarkup(journey.related)}`
  }
  content.scrollTop = 0
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button')
  if (!button) {
    return
  }
  if (button.dataset.tab) {
    activeTab = button.dataset.tab
    render()
  } else if (button.dataset.group) {
    groupId = button.dataset.group
    featureId = groups.find((group) => group.id === groupId).items[0]
    render()
    catalog.querySelector(`[data-group="${groupId}"]`).focus({ preventScroll: true })
  } else if (button.dataset.feature) {
    featureId = button.dataset.feature
    render()
    catalog.querySelector(`[data-feature="${featureId}"]`).focus({ preventScroll: true })
  } else if (button.dataset.journey !== undefined) {
    journeyIndex = Number(button.dataset.journey)
    render()
    catalog.querySelector(`[data-journey="${journeyIndex}"]`).focus({ preventScroll: true })
  } else if (button.dataset.related) {
    activeTab = 'feature'
    featureId = button.dataset.related
    groupId = groups.find((group) => group.items.includes(featureId))?.id ?? groupId
    render()
  }
})
document.querySelectorAll('[data-tab]').forEach((button) =>
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return
    }
    event.preventDefault()
    activeTab =
      event.key === 'Home'
        ? 'work'
        : event.key === 'End'
          ? 'feature'
          : activeTab === 'work'
            ? 'feature'
            : 'work'
    render()
    document.querySelector(`#tab-${activeTab}`).focus()
  })
)
function closeExplore() {
  document.querySelector('#explore').hidden = true
  document.querySelector('#closed').hidden = false
  document.querySelector('#reopen').focus()
}
document.querySelector('#close-top').addEventListener('click', closeExplore)
document.querySelector('#close-bottom').addEventListener('click', closeExplore)
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !document.querySelector('#explore').hidden) {
    closeExplore()
  }
})
document.querySelector('#reopen').addEventListener('click', () => {
  document.querySelector('#closed').hidden = true
  document.querySelector('#explore').hidden = false
  document.querySelector(`#tab-${activeTab}`).focus()
})
document.querySelector('#theme-toggle').addEventListener('click', (event) => {
  const dark = document.documentElement.dataset.theme !== 'dark'
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  event.currentTarget.textContent = dark ? '切换浅色' : '切换深色'
})
render()
