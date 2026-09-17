// Explicit GitHub adapter: publish verified evidence without modifying the feature index/worktree.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { inside, sha256, sourceSnapshot } from './verify.mjs';

const args = process.argv.slice(2);
const command = (exe, argv, options = {}) => execFileSync(exe, argv, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 180000, ...options }).trim();
const git = (...argv) => command('git', argv);
const gh = (...argv) => command('gh', argv);
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
try {
  if (args.length !== 4 || args[0] !== '--pr' || !/^[1-9][0-9]*$/.test(args[1]) || args[2] !== '--run') throw new Error('用法：node .bw/release/verify/publish-review.mjs --pr <号> --run <本次结果目录>');
  const root = git('rev-parse', '--show-toplevel');
  const out = inside(root, path.relative(root, path.resolve(args[3])));
  const allowed = path.resolve(root, '.bw/release/out/verify');
  if (path.dirname(out) !== allowed) throw new Error('只发布当前仓库 verify 目录中的单次结果');
  const result = json(path.join(out, 'result.json'));
  const manifest = json(path.join(out, 'manifest.json'));
  if (result.runId !== path.basename(out) || !/^[\w.-]+$/.test(result.runId)) throw new Error('执行编号与结果目录不一致');
  if (result.v !== 1 || result.profile !== 'pr' || result.status !== 'passed' || result.source.dirty || !result.sourceUnchanged) throw new Error('只发布完整通过、源码未变且来自干净检出的 PR 验证；失败结果在 CI Summary 查看');
  const current = sourceSnapshot(root);
  if (current.dirty || current.fingerprint !== result.source.fingerprint || manifest.source.fingerprint !== current.fingerprint || manifest.runId !== result.runId) throw new Error('工作树已变化或证据清单与执行结果不一致，请重新验证');
  for (const item of manifest.artifacts) {
    const file = inside(out, item.path);
    if (fs.statSync(file).size !== item.bytes || sha256(fs.readFileSync(file)) !== item.sha256) throw new Error(`文件校验失败：${item.path}`);
  }
  const origin = git('remote', 'get-url', 'origin');
  const repo = origin.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/)?.[1];
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('无法识别 GitHub 仓库');
  const number = args[1];
  const readPr = () => JSON.parse(gh('pr', 'view', number, '--repo', repo, '--json', 'headRefOid,headRefName,state,url'));
  const pr = readPr();
  if (pr.state !== 'OPEN' || pr.headRefOid !== current.commit) throw new Error('PR 必须打开且最新提交必须等于所验源码');
  const marker = `<!-- bw-verification:${result.runId} -->`;
  const existing = gh('api', `repos/${repo}/pulls/${number}/reviews`, '--paginate', '--jq', `.[] | select(.body | contains(${JSON.stringify(marker)})) | .html_url`);
  if (existing) {
    fs.writeFileSync(path.join(out, 'github-review.json'), JSON.stringify({ v: 1, pr: pr.url, source: current.commit, review: existing.split('\n')[0], reused: true }, null, 2));
    console.log(`验证 Review 已存在：${existing}`);
  }
  else {
    const branch = `shots/${pr.headRefName}`;
    git('check-ref-format', `refs/heads/${branch}`);
    const remote = git('ls-remote', 'origin', `refs/heads/${branch}`).split(/\s+/)[0];
    if (remote) git('fetch', '--quiet', 'origin', `refs/heads/${branch}`);
    const index = path.join(out, `.publish-index-${crypto.randomUUID()}`);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    const indexedGit = (...argv) => command('git', argv, { env });
    let commit;
    try {
      indexedGit('read-tree', '--empty');
      for (const name of [...manifest.artifacts.map(x => x.path), 'manifest.json']) {
        const blob = git('hash-object', '-w', '--', inside(out, name));
        indexedGit('update-index', '--add', '--cacheinfo', `100644,${blob},${result.runId}/${name}`);
      }
      const tree = indexedGit('write-tree');
      commit = command('git', ['commit-tree', tree, ...(remote ? ['-p', remote] : [])], { input: `验证证据：PR #${number} / ${current.commit} / ${result.runId}\n` });
      git('push', 'origin', `${commit}:refs/heads/${branch}`);
      if (git('ls-remote', 'origin', `refs/heads/${branch}`).split(/\s+/)[0] !== commit) throw new Error('shots 远端分支读回不匹配');
    } finally {
      for (const file of [index, `${index}.lock`]) if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    if (readPr().headRefOid !== current.commit) throw new Error('上传证据期间 PR 更新了；保留已上传证据，但不发过时 Review');
    const encodePath = file => file.split('/').map(encodeURIComponent).join('/');
    const pictureSections = result.steps.flatMap(step => step.cases.flatMap(item => item.evidence.filter(x => /\.png$/i.test(x)).map(file => `\n### ${item.id}\n\n![${item.id}](https://github.com/${repo}/raw/${commit}/${encodePath(`${result.runId}/${step.id}/${file}`)})\n`))).join('');
    const body = `${marker}\n${fs.readFileSync(path.join(out, 'review.md'), 'utf8')}\n\n执行命令：\n\n\`\`\`powershell\nnode .bw/release/verify/verify.mjs --profile pr\n\`\`\`\n\n真壳截图（固定脚本通过 CDP 附着本次构建的桌面壳，BW_VIEW=settings；含保存读回、跳转、重启）：\n${pictureSections}\n[完整证据目录](https://github.com/${repo}/tree/${commit}/${result.runId})\n`;
    const request = path.join(out, 'github-review-request.json');
    fs.writeFileSync(request, JSON.stringify({ commit_id: current.commit, event: 'COMMENT', body }));
    const response = JSON.parse(gh('api', '--method', 'POST', `repos/${repo}/pulls/${number}/reviews`, '--input', request));
    const readback = JSON.parse(gh('api', `repos/${repo}/pulls/${number}/reviews/${response.id}`));
    if (readback.commit_id !== current.commit || !readback.body.includes(marker)) throw new Error('Review 独立读回未匹配，不能声称发布成功');
    fs.writeFileSync(path.join(out, 'github-review.json'), JSON.stringify({ v: 1, pr: pr.url, source: current.commit, shotsCommit: commit, review: readback.html_url }, null, 2));
    console.log(`验证 Review：${readback.html_url}`);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
