import p4 from '../../../../.bw/planning/v0.4/data.json'
import p5 from '../../../../.bw/planning/v0.5/data.json'
import p6 from '../../../../.bw/planning/v0.6/data.json'
import p7 from '../../../../.bw/planning/v0.7/data.json'
import p8 from '../../../../.bw/planning/v0.8/data.json'
import a5 from '../../../../.bw/planning/v0.5/acceptance.json'
import a6 from '../../../../.bw/planning/v0.6/acceptance.json'
import a7 from '../../../../.bw/planning/v0.7/acceptance.json'
export const historyCommit = 'adf64a10a'
export const historyPlans = [p4, p5, p6, p7, p8]
const acceptances = { 'v0.5': a5, 'v0.6': a6, 'v0.7': a7 }
export const historicalRows = historyPlans.flatMap((p) =>
  p.goals.map((g, index) => {
    const result = acceptances[p.version]?.results?.find((r) => r.goalId === g.goalId)
    return {
      id: `history:${p.version}:${g.goalId}`,
      title: g.title,
      owner: g.owner || '未记录',
      planVersion: p.version,
      goalId: g.goalId,
      displayGoal: `G${index + 1}`,
      scope: g.deliverable,
      criterion: g.acceptance,
      result: result || null,
      planPath: `.bw/planning/${p.version}/data.json`,
      acceptancePath: acceptances[p.version] ? `.bw/planning/${p.version}/acceptance.json` : null
    }
  })
)
export const historyCounts = {
  met: historicalRows.filter((r) => r.result?.decision?.outcome === 'met').length,
  notMet: historicalRows.filter((r) => r.result?.decision?.outcome === 'not-met').length,
  unknown: historicalRows.filter((r) => !r.result?.decision?.outcome).length
}
export const sourceUrl = (path) =>
  `https://github.com/forcegravity1989/builder-workbench/blob/${historyCommit}/${path}`
export const outcomeLabel = (value) =>
  value === 'met' ? '达成' : value === 'not-met' ? '未达成' : '未记录'
