import fs from 'node:fs'
import { inspectPullRequest } from './pr-issue-audit.mjs'

const repo = process.env.GITHUB_REPOSITORY
const number = process.env.PR_NUMBER
if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[1-9]\d*$/.test(number)) {
  throw new Error('GITHUB_REPOSITORY and PR_NUMBER are required')
}
const endpoint = `https://api.github.com/repos/${repo}`
async function get(path, allowMissing = false) {
  const response = await fetch(`${endpoint}/${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN || process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    signal: AbortSignal.timeout(30000)
  })
  if (allowMissing && response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(`GitHub ${response.status}: ${path}`)
  }
  return response.json()
}

let result
try {
  result = await inspectPullRequest(get, number, process.env.PR_HEAD_SHA)
} catch (error) {
  result = {
    status: 'unknown',
    findings: [{ code: 'unavailable-evidence', detail: `无法核验，请重跑检查：${error.message}` }]
  }
}
console.log(JSON.stringify(result, null, 2))
if (process.env.GITHUB_STEP_SUMMARY) {
  const details = result.exempt
    ? 'BW 固定流程分支，豁免 Issue 关联检查。'
    : result.findings.map((f) => `- ${f.code}: ${f.detail}`).join('\n') ||
      '首行引用均为可读的本仓 Issue。'
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
