// Scenario fixtures, not a proposed persistence schema or live provider results.
export const revision = '334-draft-1'
export const repository = 'https://github.com/forcegravity1989/builder-workbench'
export const baseline = '90952d9bee18e436b165b82b5c08be92b3d82594'
export const scenarios = [
  {
    id: 'design',
    label: '1 · 先行 B / 评审设计',
    version: 'v0.8',
    caption: '设计待审，开发成果尚未形成'
  },
  {
    id: 'trial',
    label: '2 · 部分用户试用',
    version: 'v0.8',
    caption: '同一 B 版本内试用、反馈与修理'
  },
  {
    id: 'repair',
    label: '3 · 后续 B / 修理完善',
    version: 'v0.9（演示）',
    caption: '同一大需求跨版，承接不同交付范围'
  },
  {
    id: 'history',
    label: '4 · 回看先行 B',
    version: 'v0.8（历史演示）',
    caption: '保留当时承诺与唯一一次正式验收'
  },
  {
    id: 'offline',
    label: '5 · 来源不可读',
    version: 'v0.8',
    caption: '已读承诺保留；新成果与会话保持未知'
  }
]
export const stages = ['意图', '设计 / 高保真 / spec', 'Plan', '开发', '测试', '上线 / 试用']
export const features = [
  {
    id: '334',
    title: '版本总览重设计',
    owner: 'yuzhup',
    purpose: '每版都能看懂承诺、进展和交付，打开成果继续评审与工作。',
    scope: '先让两个大需求的成果与待审项可读，贯通原生工作会话，给组内 Builder 试用。',
    later: '根据试用修理来源缺失与跨版回看体验；更大范围使用在后续 B 版本决定。',
    stage: '设计 / 高保真 / spec',
    next: '待评审 · 未合入成果的呈现与信息优先级',
    reviewKeys: ['intent', 'design'],
    artifacts: [
      ['意图', '版本总览的价值与范围', '草案待审', '任务分支 · intent.md', 'intent'],
      [
        '设计 / 高保真 / spec',
        '可点击高保真 + spec',
        '待内部批注',
        '任务分支 · 当前设计修订',
        'design'
      ],
      ['Plan', '接入材料、成果与原生会话', '尚未形成', '等待规格确认后制定', 'plan'],
      ['开发', '版本总览开发 PR', '尚未形成', '本轮只有原型与文档', 'pr'],
      ['测试', '原型交互检查', '浏览器演示', '不等于 Electron / MVP 通过', 'test'],
      ['上线 / 试用', '组内 MVP 入口', '未提供', '高保真不能作为可运行 MVP', 'trial']
    ]
  },
  {
    id: '440',
    title: '项目里程碑规划',
    owner: '另一 Builder（演示）',
    purpose: '在月度尺度选择需求和优先级，安排各 B 版本的可用增量。',
    scope: '一个月的需求泳道、版本安排与模型协作草拟，先供两位 Builder 使用。',
    later: '按试用反馈修理排期；工作日历适配范围由 #440 评审决定。',
    stage: '上线 / 试用',
    next: '试用中 · 排期反馈待处理，未作正式版本验收',
    reviewKeys: ['design'],
    artifacts: [
      ['意图', '月度选择与交付承诺', '已认可（演示）', '演示人工评审记录', 'intent'],
      ['设计 / 高保真 / spec', '泳道与协作高保真', '修订待审', '试用后返回设计修改', 'design'],
      ['Plan', '先行 MVP 实施计划', '已有（演示）', '演示任务分支', 'plan'],
      ['开发', '里程碑 MVP PR', '已合入（演示）', '演示提交 · 不代表实际 #440', 'pr'],
      ['测试', '两人排期旅程报告', '部分通过（演示）', '工作日历导入未验证', 'test'],
      [
        '上线 / 试用',
        '两位 Builder 试用',
        '部分用户可用（演示）',
        '候选包 · 两人名单 · 试用记录',
        'trial'
      ]
    ]
  }
]
export const smallTasks = [
  {
    id: 'DEMO-01',
    title: '日常 bug：长标题遮住任务入口',
    feature: '任务列表',
    state: '执行中',
    session: '原生会话运行中',
    pr: '未提交',
    issue: '开放',
    availability: '未知',
    next: '继续工作会话'
  },
  {
    id: 'DEMO-02',
    title: '试用反馈：跨周安排需要修订',
    feature: '里程碑规划',
    state: '待处理',
    session: '会话等待输入',
    pr: '评审要求修改',
    issue: '开放',
    availability: '未提供',
    next: '查看修改意见'
  },
  {
    id: 'DEMO-03',
    title: '小需求：恢复筛选后显示来源',
    feature: '任务列表',
    state: '已有结果',
    session: '会话已结束',
    pr: '已合入',
    issue: '开放',
    availability: '未发布',
    next: '核对 PR 与测试'
  },
  {
    id: 'DEMO-04',
    title: 'bug：切版后标题仍显示前一版',
    feature: '版本导航',
    state: '已有结果',
    session: '会话已结束',
    pr: '已合入',
    issue: '人工关闭',
    availability: '组内可用',
    next: '查看处理依据'
  }
]
export function featureForScenario(feature, scenario) {
  const item = { ...feature, artifacts: feature.artifacts.map((row) => [...row]) }
  if (scenario === 'offline') {
    item.reviewKeys = []
    item.stage = '未知'
    item.next = '成果来源读取失败 · 保留已确认承诺'
    item.artifacts = item.artifacts.map((row) => [
      row[0],
      row[1],
      '未知',
      '演示：所属宿主不可达',
      row[4]
    ])
  } else if (feature.id === '334' && ['trial', 'repair', 'history'].includes(scenario)) {
    item.reviewKeys = scenario === 'repair' ? ['design', 'pr'] : []
    item.stage = scenario === 'repair' ? '开发' : '上线 / 试用'
    item.next =
      scenario === 'repair' ? '修理中 · 上版反馈已进入本版 Issue' : 'MVP 试用中 · 整体范围仍未完成'
    item.artifacts[0][2] = '已认可（演示）'
    item.artifacts[1][2] = scenario === 'repair' ? '退回修改（演示）' : '已认可（演示）'
    item.artifacts[2][2] = '已有（演示）'
    item.artifacts[3] = [
      '开发',
      'MVP 与后续修理 PR',
      scenario === 'repair' ? '开放待审（演示）' : '已合入（演示）',
      '演示提交，不是真实 PR 状态',
      'pr'
    ]
    item.artifacts[4] = [
      '测试',
      'MVP 旅程与修复复验',
      '部分通过（演示）',
      '单机旅程通过；跨宿主未验证',
      'test'
    ]
    item.artifacts[5] = [
      '上线 / 试用',
      '组内 MVP 候选包',
      '部分用户可用（演示）',
      '两位 Builder；尚未全面发布',
      'trial'
    ]
    if (scenario === 'repair') {
      item.scope = '修理先行 B 试用问题，补跨版回看；不重复登记上版 MVP 的完成结果。'
    }
  }
  if (scenario === 'history') {
    item.reviewKeys = []
    item.next = '当时 MVP 范围已验收 · 整体需求留待后续版完善（演示）'
    item.owner = '演示 Builder'
    item.scope = '单项目、本机只读成果与人工排期，供两位 Builder 试用（演示归档范围）。'
    item.artifacts = item.artifacts.map((row) => [
      row[0],
      row[1],
      '当时记录（演示）',
      '固定演示归档 hist-01，不是当前分支',
      row[4]
    ])
  }
  return item
}
