import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const { PR_NUMBER: number, PR_HEAD_SHA: sha, GITHUB_REPOSITORY: repo } = process.env;
if (!/^[1-9][0-9]*$/.test(number) || !/^[0-9a-f]{40}$/.test(sha) || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Missing PR identity');
const out = '.bw/release/out/code-review';
fs.mkdirSync(out, { recursive: true });
const receipt = { v: 1, pr: `${repo}#${number}`, headSha: sha, status: 'failed' };
try {
  const pages = JSON.parse(execFileSync('gh', ['api', `repos/${repo}/issues/${number}/comments`, '--paginate', '--slurp'], { encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 }));
  const marker = `<!-- bw-code-review:${sha} -->`;
  const found = pages.flat().filter(comment => comment.user?.login === 'claude[bot]' && comment.body?.trimStart().startsWith(marker)).at(-1);
  if (!found) throw new Error('No published code-review conclusion for this commit; an old comment or model success log is insufficient');
  receipt.status = 'passed';
  receipt.commentId = found.id;
  receipt.url = found.html_url;
  receipt.meaning = '当前提交的审查结论已交付；有无待修问题由人或工作会话阅读结论判断，此回执不是批准合入。';
  console.log(receipt.url);
} catch (error) { receipt.error = error.message; console.error(error.message); process.exitCode = 1; }
finally { fs.writeFileSync(path.join(out, `${sha}.json`), JSON.stringify(receipt, null, 2)); }
