import snapshot from './bw-snapshot.json'
export { snapshot }
export const repository = snapshot.source.repository
export const baseline = snapshot.source.sourceCommit
export const revision = '334-draft-2'
export const scenarios = [
  { id: 'unplanned', label: '版本计划未制定', version: 'v0.9' },
  { id: 'during', label: '版本计划制定完（版本中）', version: 'v0.8' },
  { id: 'delivered', label: '版本交付后', version: 'v0.7' }
]
export const stages = ['意图', '设计 / 高保真 / spec', 'Plan', '开发', '测试', '上线 / 试用']
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
  .map((t) => snapshot.issues.find((i) => i.number === t.number))
export const features = ['334', '440'].map((id) => {
  const pr = snapshot.pulls.find((p) => p.number === (id === '334' ? 459 : 460))
  const issue = snapshot.issues.find((i) => String(i.number) === id)
  const own = id === '334'
  const prefix = `${repository}/blob/${pr.headRefOid}/docs/05-features/overview-metrics/`
  return {
    id,
    title: own ? '版本总览重设计' : '项目总览里程碑规划',
    owner: issue.assignees.join('、') || snapshot.plan.goals.find((g) => g.goalId === 'G2').owner,
    purpose: own
      ? '看清一版的承诺、正在形成的成果与交付依据。'
      : '在更长时间内选择大需求，安排各版本的交付增量。',
    scope: snapshot.plan.goals
      .find((g) => g.goalId === 'G2')
      .deliverable.split('\n')
      [own ? 1 : 0].replace(/^\d+\.\s*/, ''),
    later: '后续增量待实际使用反馈和版本计划确认。',
    stage: '设计修订',
    next: '待审 · 意图、旅程与高保真',
    reviewKeys: ['design'],
    pr,
    artifacts: [
      [
        '意图',
        '用户价值与范围',
        '草案待确认',
        own ? '当前任务分支 · intent.md' : `PR #${pr.number} · ${pr.headRefOid.slice(0, 8)}`,
        'intent',
        own ? 'intent.md' : `${prefix}intent.md`
      ],
      [
        '设计 / 高保真 / spec',
        '高保真、旅程与规格',
        '待评审',
        own ? '当前任务分支 · 可编辑设计' : `PR #${pr.number} · ${pr.headRefOid.slice(0, 8)}`,
        'design',
        own ? 'spec.md' : `${prefix}spec.md`
      ],
      ['Plan', '实施计划', '尚未记录', '等待设计认可后制定', 'plan', null],
      [
        '开发',
        `PR #${pr.number} · 设计草案`,
        prState(pr),
        '当前成果是设计与资料，生产接线尚未交付',
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
      [
        '上线 / 试用',
        'MVP 与使用反馈',
        '尚未记录',
        '未找到与本版范围对应的包、试用人群和反馈记录',
        'trial',
        null
      ]
    ]
  }
})
