// The provider adapter publishes an existing result; it never infers success from logs.
// 本次 run 由 verify.mjs 写下的 last-run.txt 指针定位，不假设 out/verify/ 下只有一个目录
// （本机复跑会留下历史 run，数量假设会误报）。
import fs from 'node:fs';
import path from 'node:path';
import { externalReviewState, reviewStateLine } from './review-state.mjs';

const base = '.bw/release/out/verify';
const failSummary = '交付验证没有生成本次运行的完整报告。请查看前置步骤的失败原因；不能判为通过。\n';
const runId = fs.existsSync(path.join(base, 'last-run.txt')) ? fs.readFileSync(path.join(base, 'last-run.txt'), 'utf8').trim() : '';
const run = /^[A-Za-z0-9.-]+$/.test(runId) ? path.join(base, runId) : '';
if (!run || !fs.existsSync(path.join(run, 'review.md'))) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, failSummary);
  process.exitCode = 1;
} else {
  let content = fs.readFileSync(path.join(run, 'review.md'), 'utf8');
  // 外部评审状态只在 PR 上下文有意义（push/dispatch 不查询）；读取失败如实显灰。
  const prNumber = (process.env.GITHUB_REF ?? '').match(/^refs\/pull\/(\d+)\/merge$/)?.[1];
  if (prNumber && process.env.GITHUB_REPOSITORY) {
    let state;
    try {
      const result = JSON.parse(fs.readFileSync(path.join(run, 'result.json'), 'utf8'));
      state = externalReviewState({ repo: process.env.GITHUB_REPOSITORY, prNumber, headSha: result.source?.commit });
    } catch (error) {
      state = { state: 'unknown', reason: error.message };
    }
    content += `\n---\n\n${reviewStateLine(state)}\n`;
  }
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, content);
  else console.log(content);
}
