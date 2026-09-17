// The provider adapter publishes an existing result; it never infers success from logs.
import fs from 'node:fs';
import path from 'node:path';

const base = '.bw/release/out/verify';
const runs = fs.existsSync(base) ? fs.readdirSync(base).filter(name => fs.existsSync(path.join(base, name, 'review.md'))) : [];
if (runs.length !== 1) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '交付验证没有生成唯一的完整报告。请查看前置步骤的失败原因；不能判为通过。\n');
  process.exitCode = 1;
} else {
  const content = fs.readFileSync(path.join(base, runs[0], 'review.md'), 'utf8');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, content);
  else console.log(content);
}
