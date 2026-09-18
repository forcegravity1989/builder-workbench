// Explicit GitHub adapter: publish verified evidence without modifying the feature index/worktree.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inside, sha256, sourceSnapshot, storeEvidenceBlob } from './verify.mjs';

const JOURNEY_DIR = /^\.bw\/release\/e2e\/journeys\/([a-z0-9-]+)\//;
const JOURNEY_SCRIPT = /^\.bw\/release\/e2e\/([a-z0-9-]+)\.mjs$/;
const SUITE_FILE = /^\.bw\/release\/e2e\/suites\/[a-z0-9-]+\.json$/;

// PR 评论只内嵌本次改动涉及旅程的用例截图。旅程归属按 e2e 目录约定判定：
// journeys/<name>/ 与 e2e/<name>.mjs 属于 id 含 <name> 的套件；suites/*.json 除 profiles
// 以外的注册内容（标题、命令、expectedCases 等）变化也算该套件的改动。共享脚本、
// verify 入门和 Rust 源码变化不把存量旅程标成增量，其结果仍完整出现在四块摘要里。
export function incrementalSuiteIds(steps, changedFiles, readSuite) {
  const names = new Set();
  for (const file of changedFiles) {
    const hit = file.match(JOURNEY_DIR) ?? file.match(JOURNEY_SCRIPT);
    if (hit) names.add(hit[1]);
  }
  const ids = new Set();
  for (const step of steps) {
    if (!step.cases?.length) continue;
    if ([...names].some(name => step.id.includes(name))) ids.add(step.id);
  }
  const withoutProfiles = suite => {
    if (!suite) return null;
    const { profiles, ...rest } = suite;
    return rest;
  };
  for (const file of changedFiles) {
    if (!SUITE_FILE.test(file)) continue;
    const current = withoutProfiles(readSuite(file, false));
    const before = withoutProfiles(readSuite(file, true));
    if (JSON.stringify(current) !== JSON.stringify(before)) {
      const id = current?.id ?? before?.id;
      if (id) ids.add(id);
    }
  }
  return ids;
}

function publishFromCli() {
  const args = process.argv.slice(2);
  const command = (exe, argv, options = {}) => execFileSync(exe, argv, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 180000, ...options }).trim();
  const git = (...argv) => command('git', argv);
  const gh = (...argv) => command('gh', argv);
  const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  if (args.length !== 4 || args[0] !== '--pr' || !/^[1-9][0-9]*$/.test(args[1]) || args[2] !== '--run') throw new Error('用法：node .bw/release/verify/publish-review.mjs --pr <号> --run <本次结果目录>');
  const root = git('rev-parse', '--show-toplevel');
  const out = inside(root, path.relative(root, path.resolve(args[3])));
  const allowed = path.resolve(root, '.bw/release/out/verify');
  if (path.dirname(out) !== allowed) throw new Error('只发布当前仓库 verify 目录中的单次结果');
  const result = json(path.join(out, 'result.json'));
  const manifest = json(path.join(out, 'manifest.json'));
  if (result.runId !== path.basename(out) || !/^[\w.-]+$/.test(result.runId)) throw new Error('执行编号与结果目录不一致');
  if (result.v !== 1 || !['pr', 'pr-onboarding'].includes(result.profile) || result.status !== 'passed' || result.source.dirty || !result.sourceUnchanged) throw new Error('只发布完整通过、源码未变且来自干净检出的 PR 验证；失败结果在 CI Summary 查看');
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
  const readPr = () => JSON.parse(gh('pr', 'view', number, '--repo', repo, '--json', 'headRefOid,headRefName,state,url,baseRefOid'));
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
        const file = inside(out, name);
        const blob = storeEvidenceBlob(root, file);
        const stored = execFileSync('git', ['cat-file', 'blob', blob], { maxBuffer: 32 * 1024 * 1024 });
        if (sha256(stored) !== sha256(fs.readFileSync(file))) throw new Error(`Git 归档改变了文件字节：${name}`);
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
    // 增量判定：对比 PR 与 main 的差异。baseRefOid 是远端 main 实时头，不依赖本地跟踪引用
    // （单分支克隆没有 origin/main）；偏旧只会多列文件，不会漏掉真实改动。
    const mergeBase = git('merge-base', current.commit, pr.baseRefOid);
    const changedFiles = git('diff', '--name-only', '-z', mergeBase, current.commit).split('\0').filter(Boolean);
    const readSuite = (file, atBase) => {
      try {
        const content = atBase ? git('show', `${mergeBase}:${file}`) : fs.readFileSync(inside(root, file), 'utf8');
        return JSON.parse(content);
      } catch { return null; }
    };
    const incremental = incrementalSuiteIds(result.steps, changedFiles, readSuite);
    const journeys = result.steps.filter(step => incremental.has(step.id));
    const encodePath = file => file.split('/').map(encodeURIComponent).join('/');
    const pictureSections = journeys.map(step => {
      const rows = step.cases.map(item => {
        const shot = item.evidence.find(x => /\.png$/i.test(x));
        const image = shot
          ? `![${item.id}](https://github.com/${repo}/raw/${commit}/${encodePath(`${result.runId}/${step.id}/${shot}`)})`
          : `本用例无截图，证据文件：${item.evidence.join(', ') || '见证据目录'}`;
        return `#### ${item.title}\n\n- 用例：${item.title}（${item.id}）\n- 执行路径：${item.path ?? '见报告'}\n- 期望结果：${item.expect ?? '见报告'}\n- 结果：${item.status === 'passed' ? '通过' : '未通过'}\n\n${image}\n`;
      }).join('\n');
      return `### ${step.title}\n\n${rows}`;
    }).join('\n');
    const journeyList = journeys.length ? journeys.map(x => x.title).join('、') : '无';
    const body = `${marker}\n${fs.readFileSync(path.join(out, 'review.md'), 'utf8')}\n\n执行命令：\n\n\`\`\`powershell\nnode .bw/release/verify/verify.mjs --profile ${result.profile}\n\`\`\`\n\n本次改动涉及的旅程：${journeyList}。只内嵌这些旅程的用例截图（每条含用例名、执行路径、期望结果；desktop 通过 CDP 附着本次构建的真实桌面壳，browser 使用真实浏览器验证对应页面，remote 会独立读回 GitHub、Git、Orca 与清理结果；浏览器证据不代表 Orca 模型会话已运行）；其余用例截图与全部证据见证据目录。\n${pictureSections}\n[完整证据目录](https://github.com/${repo}/tree/${commit}/${result.runId})\n`;
    const request = path.join(out, 'github-review-request.json');
    fs.writeFileSync(request, JSON.stringify({ commit_id: current.commit, event: 'COMMENT', body }));
    const response = JSON.parse(gh('api', '--method', 'POST', `repos/${repo}/pulls/${number}/reviews`, '--input', request));
    const readback = JSON.parse(gh('api', `repos/${repo}/pulls/${number}/reviews/${response.id}`));
    if (readback.commit_id !== current.commit || !readback.body.includes(marker)) throw new Error('Review 独立读回未匹配，不能声称发布成功');
    fs.writeFileSync(path.join(out, 'github-review.json'), JSON.stringify({ v: 1, pr: pr.url, source: current.commit, shotsCommit: commit, review: readback.html_url }, null, 2));
    console.log(`验证 Review：${readback.html_url}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    publishFromCli();
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
