import snapshot from './bw-snapshot.json'
export { snapshot }
export const repository = snapshot.source.repository
export const baseline = snapshot.source.sourceCommit
export const revision = '334-draft-4'
export const scenarios = [
  { id: 'unplanned', label: '版本计划未制定', version: 'v0.9' },
  { id: 'during', label: '版本计划制定完（版本中）', version: 'v0.8' },
  { id: 'delivered', label: '版本交付后', version: 'v0.7' }
]
export const stages = ['意图规划', '设计', '开发', '测试', '上线', '反馈维护']
export const shortTitle = (title) => title.replace(/^【[^】]+】\s*/, '')
export const issueState = (issue) => (issue.state === 'CLOSED' ? '已关闭' : '开放')
export const prState = (pr) =>
  pr.state === 'MERGED'
    ? '已合入'
    : pr.state === 'CLOSED'
      ? '已关闭'
      : pr.isDraft
        ? 'Draft'
        : '待评审'
export const material = (version, kind = 'data', commit = baseline) =>
  `${repository}/blob/${commit}/.bw/planning/${version}/${kind}.json`
export const currentTasks = snapshot.plan.tasks
  .filter((t) => t.goalId === 'G4')
  .map((t) => ({ ...snapshot.issues.find((i) => i.number === t.number), goalId: t.goalId }))
export const historicalTasks = snapshot.priorPlan.tasks
  .filter((t) => t.goalId === 'G4')
  .map((t) => ({
    ...snapshot.historicalIssueTitles.find((i) => i.number === t.number),
    goalId: t.goalId,
    historical: true
  }))
export const features = ['334', '440'].map((id) => {
  const pr = snapshot.pulls.find((p) => p.number === (id === '334' ? 459 : 460))
  const issue = snapshot.issues.find((i) => String(i.number) === id)
  const own = id === '334'
  const prefix = `${repository}/blob/${pr.headRefOid}/docs/05-features/overview-metrics/`
  return {
    id,
    goalId: 'G2',
    title: own ? '版本总览重设计' : '项目总览里程碑规划',
    owner: issue.assignees.join('、') || snapshot.plan.goals.find((g) => g.goalId === 'G2').owner,
    purpose: own
      ? '看清一版的承诺、正在形成的成果与交付依据。'
      : '在更长时间内选择大需求，安排各版本的交付增量。',
    scope: snapshot.plan.goals
      .find((g) => g.goalId === 'G2')
      .deliverable.split('\n')
      [own ? 1 : 0].replace(/^\d+\.\s*/, ''),
    stage: '设计 · 原型评审',
    currentStage: '设计',
    next: '审阅原型设计',
    reviewKeys: ['prototype'],
    pr,
    artifacts: [
      [
        '意图规划',
        'intent · 用户价值与范围',
        '待确认',
        own ? '当前任务分支 · intent.md' : `PR #${pr.number} · ${pr.headRefOid.slice(0, 8)}`,
        'intent',
        own ? 'intent.md' : `${prefix}intent.md`
      ],
      [
        '设计',
        'spec · 行为与验收规格',
        '待确认',
        own ? '当前任务分支 · spec.md' : `PR #${pr.number} · ${pr.headRefOid.slice(0, 8)}`,
        'spec',
        own ? 'spec.md' : `${prefix}spec.md`
      ],
      [
        '设计',
        '原型设计 · 可点击高保真',
        '批注迭代中',
        own ? '当前任务分支 · prototype.html' : `PR #${pr.number} · ${pr.headRefOid.slice(0, 8)}`,
        'prototype',
        own ? 'prototype.html' : `${prefix}prototype.html`
      ],
      ['开发', '实施 Plan', '尚未记录', '尚未关联实施计划', 'plan', null],
      [
        '开发',
        `PR #${pr.number} · 评审与后续开发`,
        prState(pr),
        '当前已提交设计与资料，生产实现尚未交付',
        'pr',
        pr.url
      ],
      [
        '测试',
        '已提交修订的 CI',
        pr.commits.nodes[0]?.commit.statusCheckRollup?.state === 'SUCCESS' ? '通过' : '未知',
        `${pr.headRefOid.slice(0, 8)} · PR 检查`,
        'test',
        `${repository}/commit/${pr.headRefOid}`
      ],
      ['上线', '发布包与使用范围', '尚未记录', '尚无关联发布记录', 'release', null],
      ['反馈维护', '目标下的 Issue', '查看任务', 'v0.8 · G2 · 计划关联的任务', 'issues', null]
    ]
  }
})
export const historicalFeatures = [
  {
    id: '334',
    title: '版本总览',
    scope: `关联目标：${snapshot.priorPlan.goals.find((g) => g.goalId === 'G2').title}。计划未单列此需求的交付增量。`
  },
  {
    id: '383',
    title: '版本工作区',
    scope: snapshot.priorPlan.goals.find((g) => g.goalId === 'G2').title
  }
].map((f) => ({
  ...f,
  goalId: 'G2',
  historical: true,
  owner: snapshot.priorPlan.goals.find((g) => g.goalId === 'G2').owner,
  purpose: f.scope,
  stage: '当时阶段未归档',
  currentStage: null,
  next: '查看本版计划依据',
  reviewKeys: ['commitment'],
  artifacts: [
    [
      '意图规划',
      '关联目标 G2 · 本版承诺',
      '已归档',
      `v0.7 planRef · ${snapshot.acceptance.planRef.sourceCommit.slice(0, 8)}`,
      'commitment',
      material('v0.7', 'data', snapshot.acceptance.planRef.sourceCommit)
    ],
    [
      '测试',
      '关联目标 G2 · 人工验收',
      '目标未达成',
      '目标结论不等同该需求整体结论',
      'acceptance',
      material('v0.7', 'acceptance')
    ],
    ['反馈维护', '目标下的 Issue', '查看任务', '只读归档计划中的任务关联', 'issues', null]
  ]
}))

// Local preview projection from explicit plan task references, not a shared version schema.
export function relatedVersions(featureId) {
  return [
    { scene: 'during', version: 'v0.8', plan: snapshot.plan, commit: baseline },
    {
      scene: 'delivered',
      version: 'v0.7',
      plan: snapshot.priorPlan,
      commit: snapshot.acceptance.planRef.sourceCommit
    }
  ].flatMap(({ scene, version, plan, commit }) => {
    const task = plan.tasks.find(
      (t) =>
        t.provider === 'github' &&
        t.repository === repository.replace('https://', '') &&
        String(t.number) === featureId
    )
    if (!task) {
      return []
    }
    const goal = plan.goals.find((g) => g.goalId === task.goalId)
    const increment = scene === 'during' ? features.find((f) => f.id === featureId)?.scope : null
    return [
      {
        scene,
        version,
        goalId: task.goalId,
        scope: increment || goal.title,
        scopeLabel: increment ? '本版承担' : '关联目标',
        separateScope: Boolean(increment),
        source: material(version, 'data', commit),
        revision: commit.slice(0, 8)
      }
    ]
  })
}
