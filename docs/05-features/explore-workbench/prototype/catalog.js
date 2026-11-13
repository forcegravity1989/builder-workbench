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
const featureScreens = {
  F18: '03-milestone-draft.jpg',
  F19: '01-project-wall.jpg',
  F21: '02-project-card.jpg'
}
const guideScreens = '../../03-guide/project-direction/screens/'
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
    title: '明确方向',
    start: '已纳入 BW 的项目和一项产品想法',
    end: '可回看的项目名片与阶段安排',
    related: ['F19', 'F21', 'F18']
  },
  {
    title: '制定版本计划',
    start: '项目方向、上版结果和新要求',
    end: '团队评审后的版本目标、验收条件和任务',
    related: ['F22', 'F23', 'F02']
  },
  {
    title: '构建交付',
    start: '一项待处理的问题或需求',
    end: '经验证、检视并合入的改动',
    related: ['F02', 'F01', 'F08', 'F09', 'F24']
  },
  {
    title: '验收成果',
    start: '本版承诺与实际交付证据',
    end: '由人确认并归档的验收结论',
    related: ['F25', 'F27']
  },
  {
    title: '查看效果',
    start: '交付结果、真实读数和当前目标',
    end: '形成调整决定，为下一轮定方向或排计划',
    related: ['F21', 'F28', 'F22']
  },
  {
    title: '持续维护',
    start: '工作中发现需要维护的问题',
    end: '有明确处理结论和验证结果的维护事项',
    building: true
  },
  {
    title: '沉淀复用',
    start: '实际工作中验证过的做法',
    end: '团队可在后续同类任务中复用的做法',
    building: true
  }
]

const steps = [
  {
    title: '找到项目',
    action: '在项目墙打开「周末书集」的项目总览。',
    duration: 3300
  },
  {
    title: '明确共同方向',
    action: '编辑愿景，核对提交摘要。',
    duration: 9800
  },
  {
    title: '安排阶段成果',
    action: '添加阶段成果与日期，调整特性排期。',
    duration: 3600
  },
  {
    title: '评审并更新',
    action: '核对改动，评审合入后更新正式安排。',
    duration: 3800
  }
]
let activeTab = 'work'
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

function relatedMarkup(ids = [], compact = false) {
  if (!ids.length) {
    return ''
  }
  return `<section class="related" aria-label="相关功能">${compact ? '' : '<h3>相关功能</h3>'}<div class="related-list">${ids.map((id) => `<button class="related-item" type="button" data-related="${id}">${html(features[id][0])}</button>`).join('')}</div></section>`
}

let activeStep = 0
let time = 0
let playback = null
let pausedMode = null
let frameId = 0
let lastFrame
let charter

function directoryMarkup() {
  const rows = (entries, offset = 0) =>
    entries
      .map(({ title, building }, index) => {
        const id = offset + index
        return `<li><button class="journey" type="button" data-journey="${id}" aria-current="${id === journeyIndex}"><span class="journey-title">${html(title)}</span>${building ? '<span class="building-label">建设中</span>' : ''}</button></li>`
      })
      .join('')
  return `<ol class="journey-chain" aria-label="核心工作旅程">${rows(journeys.slice(0, 5))}</ol>
    <button class="next-round" type="button" data-journey="0" aria-label="调整下一轮，回到明确方向">↺ <span>调整下一轮</span></button>
    <h2 class="catalog-heading">贯穿每一轮</h2>
    <ul class="journey-support">${rows(journeys.slice(5), 5)}</ul>`
}

function journeyHeading(journey) {
  return `<header class="journey-heading">
    <h2>${html(journey.title)}</h2>
    <dl class="journey-outcomes">
      <div><dt>起点</dt><dd>${html(journey.start)}</dd></div>
      <div><dt>结果</dt><dd>${html(journey.end)}</dd></div>
    </dl>
  </header>`
}

function walkthroughMarkup() {
  return `<div class="walkthrough">
    <ol class="step-flow" aria-label="旅程步骤">
      ${steps
        .map(
          (step, index) => `<li><button class="step-card" type="button" data-step="${index}">
        <span class="step-index" aria-hidden="true">${index + 1}</span><span>${html(step.title)}</span>
      </button></li>`
        )
        .join('')}
    </ol>
    <section class="current-demo" aria-labelledby="demo-title">
      <header class="demo-heading">
        <h3 class="visually-hidden" id="demo-title" aria-live="polite"></h3><p id="demo-description"></p>
        <div class="demo-controls">
          <button class="btn btn-primary" type="button" id="play-sequence">顺序播放</button>
          <button class="btn btn-secondary" type="button" id="replay-sequence">从头重播</button>
          <button class="btn btn-ghost" type="button" id="replay-clip">播放片段</button>
        </div>
      </header>
      <div id="demo-scene" class="demo-scene"></div>
      <footer class="demo-caption">
        <span class="demo-source" id="demo-source">模拟演示 · 团队仓已连接代码托管</span>
      </footer>
    </section>
  </div>`
}

function updatePlayControls() {
  const featurePlay = document.querySelector('#play-feature')
  if (featurePlay) {
    featurePlay.textContent = playback
      ? '暂停'
      : time >= steps[1].duration
        ? '重播片段'
        : time > 0
          ? '继续播放'
          : '播放片段'
  }
  const play = document.querySelector('#play-sequence')
  if (!play) {
    return
  }
  play.textContent = playback
    ? '暂停'
    : time > 0 && time < steps[activeStep].duration
      ? '继续播放'
      : '顺序播放'
  const clip = document.querySelector('#replay-clip')
  clip.hidden = activeStep !== 1
  clip.textContent = playback || time > 0 ? '重播片段' : '播放片段'
}

function showStep() {
  const step = steps[activeStep]
  content
    .querySelectorAll('[data-step]')
    .forEach((button) =>
      button.setAttribute('aria-current', String(Number(button.dataset.step) === activeStep))
    )
  document.querySelector('#demo-title').textContent = step.title
  document.querySelector('#demo-description').textContent = step.action
  document.querySelector('#demo-source').parentElement.hidden = activeStep !== 1
  charter?.unmount()
  charter = null
  const scene = document.querySelector('#demo-scene')
  if (activeStep === 1) {
    mountCharter(scene)
  } else {
    scene.innerHTML = '<div class="step-reference">演示待接入</div>'
  }
  updatePlayControls()
}

function mountCharter(scene) {
  charter = window.createCharterPreview(scene)
  charter.render(time)
}

function pause() {
  cancelAnimationFrame(frameId)
  if (playback) {
    pausedMode = playback
  }
  playback = null
  lastFrame = undefined
  updatePlayControls()
}

function advance(now) {
  if (!playback) {
    return
  }
  if (lastFrame !== undefined) {
    time += now - lastFrame
  }
  lastFrame = now
  const duration = steps[activeTab === 'feature' ? 1 : activeStep].duration
  if (time >= duration) {
    time = duration
    charter?.render(time)
    if (playback === 'clip' || activeStep === steps.length - 1) {
      pause()
      pausedMode = null
      return
    }
    activeStep += 1
    time = 0
    showStep()
  } else {
    charter?.render(time)
  }
  frameId = requestAnimationFrame(advance)
}

function play(mode) {
  pause()
  playback = mode
  pausedMode = null
  updatePlayControls()
  frameId = requestAnimationFrame(advance)
}

function selectStep(index) {
  pause()
  pausedMode = null
  content.scrollTop = 0
  activeStep = index
  time = 0
  showStep()
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause()
  }
})

function switchTab(tab) {
  if (activeTab === tab) {
    return
  }
  pause()
  time = 0
  pausedMode = null
  activeTab = tab
}

function render() {
  pause()
  charter?.unmount()
  charter = null
  document.querySelectorAll('[data-tab]').forEach((button) => {
    const selected = button.dataset.tab === activeTab
    button.setAttribute('aria-selected', String(selected))
    button.tabIndex = selected ? 0 : -1
  })
  document.querySelector('#explore-body').setAttribute('aria-labelledby', `tab-${activeTab}`)
  catalog.setAttribute('aria-label', activeTab === 'feature' ? '功能目录' : '工作旅程目录')
  if (activeTab === 'feature') {
    time = 0
    pausedMode = null
    catalog.innerHTML = groups
      .map(
        (group) =>
          `<div class="group"><button class="group-button" type="button" data-group="${group.id}" aria-expanded="${group.id === groupId}">${html(group.name)}<span class="chevron" aria-hidden="true">${group.id === groupId ? '⌄' : '›'}</span></button>${group.id === groupId ? `<div class="children">${group.items.map((id) => `<button type="button" class="item" data-feature="${id}" aria-current="${id === featureId}"><span class="item-name">${html(features[id][0])}</span>${features[id][2] || featureScreens[id] ? '' : '<span class="mini-state">准备中</span>'}</button>`).join('')}</div>` : ''}</div>`
      )
      .join('')
    const [title, description, available] = features[featureId]
    const screen = featureScreens[featureId]
    const status = screen ? '动画待接入' : available ? '已有演示' : '内容准备中'
    const preview = screen
      ? `<figure class="feature-reference"><img src="${guideScreens}${screen}" alt="${html(title)}的现有截图"></figure>`
      : available
        ? `<div class="stage"><strong>现有${html(title)}演示</strong><p>沿用探索 BW 中的演示。</p></div>`
        : ''
    if (featureId === 'F21') {
      content.innerHTML = `<header class="journey-heading"><h2>项目总览</h2></header>
        <section class="current-demo feature-demo" aria-label="名片编辑演示">
          <header class="demo-heading"><p>${html(steps[1].action)}</p>
            <button class="btn btn-primary" type="button" id="play-feature">播放片段</button>
          </header>
          <div class="demo-scene" id="feature-charter"></div>
          <footer class="demo-caption"><span class="demo-source">模拟演示 · 团队仓已连接代码托管</span></footer>
        </section>`
      mountCharter(document.querySelector('#feature-charter'))
    } else {
      content.innerHTML = `<header class="content-heading"><span class="badge">${status}</span><h2>${html(title)}</h2><p>${html(description)}</p></header>${preview}${relatedMarkup(related[featureId])}`
    }
  } else {
    catalog.innerHTML = directoryMarkup()
    const journey = journeys[journeyIndex]
    const status = journey.building ? '' : '<p class="journey-status">内容准备中</p>'
    content.innerHTML =
      journeyHeading(journey) +
      (journeyIndex === 0 ? walkthroughMarkup() : status) +
      relatedMarkup(journey.related, journeyIndex === 0)
    if (journeyIndex === 0) {
      showStep()
    }
  }
  content.scrollTop = 0
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button')
  if (!button) {
    return
  }
  if (button.dataset.tab) {
    switchTab(button.dataset.tab)
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
    activeStep = 0
    time = 0
    pausedMode = null
    render()
    catalog.querySelector(`[data-journey="${journeyIndex}"]`).focus({ preventScroll: true })
  } else if (button.dataset.step !== undefined) {
    selectStep(Number(button.dataset.step))
  } else if (button.id === 'play-feature') {
    if (playback) {
      pause()
    } else {
      if (time >= steps[1].duration) {
        time = 0
        charter.unmount()
        mountCharter(document.querySelector('#feature-charter'))
      }
      play('clip')
    }
  } else if (button.id === 'play-sequence') {
    if (playback) {
      pause()
    } else {
      if (time >= steps[activeStep].duration) {
        selectStep(activeStep === steps.length - 1 ? 0 : activeStep)
      }
      play(pausedMode ?? 'sequence')
    }
  } else if (button.id === 'replay-sequence') {
    selectStep(0)
    play('sequence')
  } else if (button.id === 'replay-clip') {
    selectStep(1)
    play('clip')
  } else if (button.dataset.related) {
    switchTab('feature')
    featureId = button.dataset.related
    groupId = groups.find((group) => group.items.includes(featureId))?.id ?? groupId
    render()
    document.querySelector('#tab-feature').focus({ preventScroll: true })
  }
})
document.querySelectorAll('[data-tab]').forEach((button) =>
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return
    }
    event.preventDefault()
    const tab =
      event.key === 'Home'
        ? 'work'
        : event.key === 'End'
          ? 'feature'
          : activeTab === 'work'
            ? 'feature'
            : 'work'
    switchTab(tab)
    render()
    document.querySelector(`#tab-${activeTab}`).focus()
  })
)
function closeExplore() {
  pause()
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
  render()
  document.querySelector(`#tab-${activeTab}`).focus()
})
document.querySelector('#theme-toggle').addEventListener('click', (event) => {
  const dark = document.documentElement.dataset.theme !== 'dark'
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  event.currentTarget.textContent = dark ? '切换浅色' : '切换深色'
})
render()
