import fs from 'node:fs'
import { evaluate, primaryIssues } from './pr-issue-audit.mjs'

const repo = process.env.GITHUB_REPOSITORY
const number = process.env.PR_NUMBER
const expectedSha = process.env.PR_HEAD_SHA
if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[1-9]\d*$/.test(number)) {
  throw new Error('GITHUB_REPOSITORY and PR_NUMBER are required')
}
const endpoint = `https://api.github.com/repos/${repo}`
async function get(path) {
  const response = await fetch(`${endpoint}/${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN || process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    signal: AbortSignal.timeout(30000)
  })
  if (!response.ok) {
    throw new Error(`GitHub ${response.status}: ${path}`)
  }
  return response.json()
}

let result
try {
  const pr = await get(`pulls/${number}`)
  if (expectedSha && pr.head.sha !== expectedSha) {
    throw new Error('PR head changed; rerun on current head')
  }
  const commits = []
  // GitHub returns at most 250 commits; larger PRs remain Unknown.
  for (let page = 1; page <= 3; page++) {
    const rows = await get(`pulls/${number}/commits?per_page=100&page=${page}`)
    commits.push(...rows)
    if (rows.length < 100) {
      break
    }
  }
  const issues = await Promise.all(primaryIssues(pr.body).map((n) => get(`issues/${n}`)))
  result = evaluate({ pr, issues, commits })
  const latest = await get(`pulls/${number}`)
  if (latest.head.sha !== pr.head.sha || latest.body !== pr.body || latest.title !== pr.title) {
    throw new Error('PR changed during inspection; rerun on current metadata')
  }
} catch (error) {
  result = { status: 'unknown', findings: [{ code: 'incomplete-evidence', detail: error.message }] }
}
console.log(JSON.stringify(result, null, 2))
if (process.env.GITHUB_STEP_SUMMARY) {
  const details = result.findings.map((f) => `- ${f.code}: ${f.detail}`).join('\n')
  // Render remote text as code, never as HTML or workflow commands.
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `\n## Issue 关联检查：${result.status}\n\n~~~text\n${details.replaceAll('~', '\\u007e')}\n~~~\n`
  )
}
if (process.env.AUDIT_OUTPUT) {
  fs.writeFileSync(process.env.AUDIT_OUTPUT, JSON.stringify(result, null, 2))
}
if (result.status !== 'passed') {
  process.exitCode = 1
}
