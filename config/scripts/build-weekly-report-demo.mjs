import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '../..')
const feature = resolve(root, 'docs/05-features/weekly-report')
const snapshot = JSON.parse(
  await readFile(resolve(feature, 'prototype/github-report.json'), 'utf8')
)
const facts = snapshot.reports[0]
const definition = await build({
  entryPoints: [resolve(root, 'src/shared/workbench/weekly-report-format.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false
})
const module = { exports: {} }
new Function('require', 'module', 'exports', definition.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports
)
const sources = new Map()
for (const collection of [
  facts.goals,
  facts.progress,
  facts.risks,
  facts.requirements,
  facts.problems,
  facts.members
]) {
  for (const item of collection) {
    for (const url of item.sources ?? []) {
      sources.set(url, {
        url,
        summary: `取数截至 ${snapshot.collectedAt}；计划/验收按已合入材料，Issue 保留关闭原因。`
      })
    }
  }
}
const goalName = (id) => facts.goals.find((goal) => goal.id === id)?.title ?? '未纳入当前计划'
const bug = (issue) => issue.labels.some((label) => label.toLowerCase() === 'bug')
const closedBugs = snapshot.providerFacts.closedIssuesInWindow.filter(bug)
const openBugs = snapshot.providerFacts.openIssues.filter(bug)
const windowStart = `${facts.period}T00:00:00+08:00`
const newBugs = [
  ...snapshot.providerFacts.openIssues,
  ...snapshot.providerFacts.closedIssuesInWindow
].filter(
  (issue) =>
    bug(issue) &&
    Date.parse(issue.createdAt) >= Date.parse(windowStart) &&
    Date.parse(issue.createdAt) <= Date.parse(snapshot.collectedAt)
)
const completedBugs = closedBugs.filter((issue) => issue.stateReason === 'completed')
const cancelledBugs = closedBugs.filter((issue) => issue.stateReason === 'not_planned')
const document = {
  schemaVersion: 1,
  project: { name: facts.project, repository: `github.com/${facts.repository}` },
  period: {
    start: facts.period,
    endExclusive: facts.endExclusive.slice(0, 10),
    timezone: snapshot.timezone
  },
  version: facts.projectVersion,
  generatedAt: snapshot.collectedAt,
  sections: {
    goals: facts.goals.map((goal) => [goal.title, goal.deliverable, goal.due, goal.status]),
    progress: facts.progress.map((item) => [item.title, item.current, item.next]),
    risks: facts.risks.map((item) => [
      item.level === 'Unknown' ? '未知' : item.level,
      item.description,
      item.action,
      item.owner,
      item.due,
      item.status
    ]),
    milestones: [],
    requirements: facts.requirements.map((item) => [
      goalName(item.goal),
      `#${item.number} ${item.title}`,
      item.due,
      item.owner,
      item.status,
      item.progress
    ]),
    problems: facts.problems
      .filter((item) => item.number === 301)
      .map((item) => [
        `#${item.number} ${item.title}`,
        item.status,
        item.owner,
        item.progress,
        item.next
      ]),
    members: facts.members.map((item) => [item.name, item.role, item.scope])
  },
  problemSummary: `已分类 Bug：本周新增 ${newBugs.length} 单，关闭 ${closedBugs.length} 单（已处理 ${completedBugs.length} 单、不再计划 ${cancelledBugs.length} 单），当前未关闭 ${openBugs.length} 单；未分类用户反馈 ${facts.problems.filter((item) => item.number === 301).length} 条。`,
  sources: [...sources.values()],
  manual: {}
}
document.sections.goals[1] = [
  '对齐运维全景并逐步补齐交付自动化',
  '本次验收交付差距矩阵；资产迁移及真实流程验证由 #253 继续跟踪',
  '未记录',
  '差距矩阵人工确认达成'
]
for (const item of closedBugs) {
  const number = item.number
  document.sources.push({
    url: item.url,
    summary: `Bug 标签；关闭原因 ${item.stateReason}；关闭时间 ${item.closedAt}`
  })
  document.sections.problems.push([
    `#${number} ${item.title}`,
    item.stateReason === 'not_planned' ? '不再计划' : '已关闭（已处理）',
    item.assignees?.join('、') || '未指派',
    item.stateReason === 'not_planned'
      ? '按仓库规划不再计划'
      : '本周已关闭；具体处理结论见原 Issue',
    '—'
  ])
}
await writeFile(
  resolve(feature, 'prototype/weekly-report.json'),
  `${JSON.stringify(document, null, 2)}\n`
)
await writeFile(resolve(feature, 'prototype.html'), module.exports.exportWeeklyReportHtml(document))
process.stdout.write('Generated real weekly report JSON and HTML from verified GitHub snapshot.\n')
