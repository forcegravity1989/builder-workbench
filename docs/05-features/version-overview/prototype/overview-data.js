import snapshot from './bw-snapshot.json'
export { snapshot }
export const repository = snapshot.source.repository
export const acceptanceForVersion = (version) =>
  snapshot.acceptance.version === version ? snapshot.acceptance : null
export const baseline = snapshot.source.sourceCommit
export const revision = '334-draft-15'
export const formatTime = (value) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
        .format(new Date(value))
        .replaceAll('/', '-')
    : '未记录'
export function archivePull(version, workflow) {
  const document =
    workflow === 'acceptance'
      ? acceptanceForVersion(version)
      : version === snapshot.plan.version
        ? snapshot.plan
        : version === snapshot.priorPlan.version
          ? snapshot.priorPlan
          : null
  return (
    snapshot.pulls.find((pull) => pull.number === document?.workflow?.archivePr?.number) ?? null
  )
}
export const scenarios = [
  { id: 'unplanned', label: '版本计划未制定', version: 'v0.9' },
  { id: 'during', label: '版本计划制定完（版本中）', version: 'v0.8' },
  { id: 'delivered', label: '版本交付后', version: 'v0.7' }
]
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
// Explicit design samples; no labels or title associations are written to the source Issues.
export const features = ['334', '440'].map((id) => {
  const designPR = snapshot.pulls.find((p) => p.number === (id === '334' ? 459 : 460))
  const issue = snapshot.issues.find((i) => String(i.number) === id)
  const own = id === '334'
  return {
    id,
    previewExpanded: own,
    goalId: 'G2',
    title: own ? '版本总览重设计' : '项目总览里程碑规划',
    owner: issue.assignees.join('、') || snapshot.plan.goals.find((g) => g.goalId === 'G2').owner,
    stage: own ? 'Build · 评审中' : 'Design · 评审中',
    designPR,
    developmentPR: own ? snapshot.pulls.find((pr) => pr.number === 474) : null
  }
})
export const historicalFeatures = [
  {
    id: '383',
    title: '版本工作区'
  }
].map((f) => ({
  ...f,
  previewExpanded: f.id === '383',
  goalId: 'G2',
  historical: true,
  owner: snapshot.priorPlan.goals.find((g) => g.goalId === 'G2').owner,
  stage: '当时阶段未记录',
  designPR: null
}))

// Local preview projection from explicit plan task references, not a shared version schema.
export function relatedVersions(featureId) {
  return [
    { scene: 'during', version: 'v0.8', plan: snapshot.plan },
    {
      scene: 'delivered',
      version: 'v0.7',
      plan: snapshot.priorPlan
    }
  ].flatMap(({ scene, version, plan }) => {
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
    return [
      {
        scene,
        version,
        scope: goal?.title || '目标范围未记录'
      }
    ]
  })
}
