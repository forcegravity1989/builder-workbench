// Pure calculation shared by the PR check and historical SDLC inspection.
export function primaryIssues(body = '') {
  const first = body
    .replace(/<!--[^]*?-->/g, '')
    .trim()
    .split(/\r?\n/)[0]
  const match = /^关联\s*[：:]?\s*(#\d+(?:\s*[、，,]\s*#\d+)*)(?=\s|（|\(|$)/u.exec(first)
  return match ? [...new Set([...match[1].matchAll(/#(\d+)/g)].map((m) => Number(m[1])))] : []
}

export function closingReferences(text = '') {
  return [
    ...text.matchAll(
      /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s*(?:#\d+|[\w.-]+\/[\w.-]+#\d+|https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+)/gi
    )
  ].map((m) => m[0])
}

export function evaluate({ pr, issues, commits, complete = true }) {
  const findings = []
  const add = (code, detail) => findings.push({ code, detail })
  const linked = primaryIssues(pr.body)
  if (!linked.length) {
    add('missing-primary-issue', 'PR 首行须写“关联 #编号”，背景引用不作主关联。')
  }
  if (!complete || commits.length !== pr.commits) {
    add('incomplete-evidence', '提交列表不完整，不能判定时序通过。')
  }
  // A merge can contain conflict-resolution work; only its own commit time
  // counts, rather than dates inherited from either parent's history.
  const dates = commits.flatMap((c) =>
    c.parents.length > 1
      ? [c.commit.committer.date]
      : [c.commit.author.date, c.commit.committer.date]
  )
  if (!dates.length || dates.some((date) => !Number.isFinite(Date.parse(date)))) {
    add('incomplete-evidence', '缺少可验证的提交时间。')
  }
  const firstWork =
    dates.length && dates.every((date) => Number.isFinite(Date.parse(date)))
      ? new Date(Math.min(...dates.map(Date.parse))).toISOString()
      : null
  for (const number of linked) {
    const issue = issues.find((i) => i.number === number)
    if (!issue || issue.pull_request) {
      add('invalid-issue', `#${number} 不存在或实际是 PR。`)
      continue
    }
    if (
      !Number.isFinite(Date.parse(issue.created_at)) ||
      !Number.isFinite(Date.parse(pr.created_at))
    ) {
      add('incomplete-evidence', `#${number} 或 PR 创建时间不可验证。`)
      continue
    }
    if (Date.parse(issue.created_at) > Date.parse(pr.created_at)) {
      add('issue-after-pr', `#${number} 创建于 ${issue.created_at}，晚于 PR ${pr.created_at}。`)
    }
    if (firstWork && Date.parse(issue.created_at) > Date.parse(firstWork)) {
      add(
        'issue-after-commit',
        `#${number} 创建于 ${issue.created_at}，晚于可见提交 ${firstWork}；补关联不改变历史。`
      )
    }
  }
  for (const [source, text] of [
    ['PR 标题', pr.title],
    ['PR 正文', pr.body],
    ...commits.map((c) => [c.sha, c.commit.message])
  ]) {
    const matches = closingReferences(text)
    if (matches.length) {
      add('automatic-close-reference', `${source}: ${matches.join('、')}；请改用“关联”。`)
    }
  }
  return {
    pr: pr.number,
    headSha: pr.head.sha,
    primaryIssues: linked,
    firstVisibleWorkAt: firstWork,
    status: findings.some((f) => f.code === 'incomplete-evidence')
      ? 'unknown'
      : findings.length
        ? 'failed'
        : 'passed',
    findings
  }
}
