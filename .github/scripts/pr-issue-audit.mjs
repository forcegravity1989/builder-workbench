export function primaryIssues(body) {
  const first = (body ?? '')
    .replace(/<!--[^]*?-->/g, '')
    .trim()
    .split(/\r?\n/)[0]
  const match =
    /^关联[\t ]*[：:]?[\t ]*(#[1-9]\d*(?:[\t ]*[、，,][\t ]*#[1-9]\d*)*)[\t ]*(?:[（(].*[）)])?[\t ]*$/u.exec(
      first
    )
  return match ? [...new Set([...match[1].matchAll(/#(\d+)/g)].map((m) => Number(m[1])))] : []
}

export function isExempt(pr) {
  const repository = pr.base?.repo?.full_name
  if (!repository || pr.head?.repo?.full_name !== repository) {
    return false
  }
  return /^(?:bw\/(?:project|metrics-refresh|week-plan|week-acceptance)|bw\/[^/]+\/(?:plan|acceptance))$/.test(
    pr.head.ref
  )
}

export function evaluate({ pr, issues = [] }) {
  const exempt = isExempt(pr)
  const linked = exempt ? [] : primaryIssues(pr.body)
  const findings = []
  if (!exempt && !linked.length) {
    findings.push({
      code: 'missing-primary-issue',
      detail:
        'PR 正文首个非空、非 HTML 注释行须写“关联 #编号”（多个用顿号或逗号分隔）。见 docs/development.md 的 PR 规范。'
    })
  }
  for (const number of linked) {
    const issue = issues.find((i) => i.number === number)
    if (!issue || issue.pull_request || issue.repository_url !== pr.base.repo.url) {
      findings.push({
        code: 'invalid-issue',
        detail: `#${number} 未找到可读的本仓 Issue、实际是 PR 或已转移到其他仓库；请修正首行编号。`
      })
    }
  }
  return {
    pr: pr.number,
    headSha: pr.head.sha,
    primaryIssues: linked,
    exempt,
    status: findings.length ? 'failed' : 'passed',
    findings
  }
}

const snapshot = (pr) =>
  JSON.stringify([
    pr.head.sha,
    pr.head.ref,
    pr.head.repo?.full_name,
    pr.base.ref,
    pr.base.repo?.full_name,
    pr.body
  ])

export async function inspectPullRequest(get, number, expectedSha) {
  const pr = await get(`pulls/${number}`)
  if (expectedSha && pr.head.sha !== expectedSha) {
    throw new Error('PR head 已更新，请重跑最新 PR 检查。')
  }
  const linked = isExempt(pr) ? [] : primaryIssues(pr.body)
  const issues = (await Promise.all(linked.map((n) => get(`issues/${n}`, true)))).filter(Boolean)
  const result = evaluate({ pr, issues })
  const latest = await get(`pulls/${number}`)
  if (snapshot(latest) !== snapshot(pr)) {
    throw new Error('检查期间 PR 内容或来源分支已变化，请重跑。')
  }
  return result
}
