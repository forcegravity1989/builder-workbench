// 用例六件事：
// 1. 保护规则：从真实桌面接入远端项目后，GitHub、本地 Git 工作树与 Orca 处处可独立读回；
//    测试只收走本次运行创建的对象，不动沙箱既有内容。
// 2. 环境与数据：Windows、本机已登录 gh、Orca 桌面已打开、固定沙箱仓 yuzhup/bw-e2e-sandbox
//    （repository id 由 desktop.ps1 传入并核验），Playwright 通过 CDP 附着真实壳。
// 3. 真实动作：接入项目 → 克隆远端仓 → 填写基础信息 → 完成接入 → 项目墙。
// 4. 独立读回：gh 读回 Issue/PR/分支内容，git 读回项目工作树，bw-engine 示例读回 Orca 自动化。
// 5. 证据：每条用例的截图与 JSON 读回，全部写入本步骤输出目录。
// 6. 清理：只关闭/删除带本次 run-id 标记的 Issue、PR、远端分支与项目工作树；身份不明即失败并保留。
import { chromium, expect } from 'playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = name => {
  const index = argv.indexOf(`--${name}`);
  if (index < 0 || !argv[index + 1]) throw new Error(`Missing --${name}`);
  return argv[index + 1];
};
const out = path.resolve(arg('out'));
const root = path.resolve(arg('root'));
const sandboxRoot = path.resolve(arg('sandbox-root'));
const repo = arg('repo');
const repoId = Number(arg('repo-id'));
const runId = arg('run-id');
const shortId = runId.slice(0, 8);
const projectName = `BW E2E ${shortId}`;
const clone = path.join(sandboxRoot, repo.split('/').at(-1));
const cases = [
  { id: 'onboarding-project', title: '从真实桌面接入 GitHub 沙箱项目', status: 'not_run', evidence: [] },
  { id: 'onboarding-readback', title: '从 GitHub、Git 和项目名片读回接入结果', status: 'not_run', evidence: [] },
  { id: 'onboarding-orca', title: 'Orca 登记沙箱仓并保留三条关闭的自动化', status: 'not_run', evidence: [] },
  { id: 'onboarding-cleanup', title: '只收掉本次远端对象和项目约定工作树', status: 'not_run', evidence: [] },
];
const item = id => cases.find(x => x.id === id);
const save = (name, value) => fs.writeFileSync(path.join(out, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
const run = (file, args, options = {}) => execFileSync(file, args, { encoding: 'utf8', cwd: options.cwd || root, maxBuffer: 16 * 1024 * 1024, windowsHide: true, ...options });
const ghJson = args => JSON.parse(run('gh', args));
const git = (args, cwd = clone) => run('git', args, { cwd });
const worktreePaths = raw => raw.split(/\r?\n/).filter(line => line.startsWith('worktree ')).map(line => path.resolve(line.slice('worktree '.length)).toLowerCase());
const remoteIssues = () => ghJson(['issue', 'list', '--repo', repo, '--state', 'all', '--limit', '100', '--json', 'number,title,state,url']);
const remotePrs = () => ghJson(['pr', 'list', '--repo', repo, '--state', 'all', '--limit', '100', '--json', 'number,title,state,url,headRefName,headRefOid']);
const refExists = () => {
  const probe = spawnSync('gh', ['api', `repos/${repo}/git/ref/heads/bw%2Fproject`], { encoding: 'utf8', windowsHide: true });
  if (probe.status === 0) return true;
  const output = `${probe.stderr ?? ''}${probe.stdout ?? ''}`;
  // gh 对网络、凭据等任何失败都返回非零；只有明确的 404 才代表分支不存在，其余失败必须暴露而不是当作已清理。
  if (!/HTTP 404/.test(output)) throw new Error(`无法确认远端分支状态（gh 退出码 ${probe.status}）：${output.trim()}`);
  return false;
};
const exactNew = (after, before, predicate, kind) => {
  const old = new Set(before.map(x => x.number));
  const rows = after.filter(x => !old.has(x.number) && predicate(x));
  if (rows.length !== 1) throw new Error(`Expected one new ${kind}, got ${rows.length}`);
  return rows[0];
};
const fail = (entry, error) => {
  entry.status = 'failed';
  entry.message = error instanceof Error ? error.message : String(error);
};

let browser;
let page;
let baselineIssues = [];
let baselinePrs = [];
let createdIssue;
let createdPr;
let branchOwned = false;
let failed = false;

try {
  const repository = ghJson(['api', `repos/${repo}`]);
  if (repository.id !== repoId || repository.full_name !== repo || repository.private !== true) throw new Error('Sandbox repository identity mismatch');
  const labels = ghJson(['label', 'list', '--repo', repo, '--limit', '100', '--json', 'name']).map(x => x.name);
  for (const required of ['bw:status:backlog', 'bw:status:inprogress', 'bw:status:inreview']) {
    if (!labels.includes(required)) throw new Error(`Sandbox fixture label missing: ${required}`);
  }
  baselineIssues = remoteIssues();
  baselinePrs = remotePrs();
  if (baselineIssues.some(x => x.state === 'OPEN' && x.title === '项目约定')) throw new Error('Sandbox has an open 项目约定 issue; finish its cleanup first');
  if (baselinePrs.some(x => x.state === 'OPEN' && x.headRefName === 'bw/project')) throw new Error('Sandbox has an open bw/project PR; finish its cleanup first');
  if (refExists()) throw new Error('Sandbox still has remote branch bw/project; refusing to reuse unknown state');
  if (fs.existsSync(clone)) {
    const origin = git(['remote', 'get-url', 'origin']).trim();
    if (!origin.toLowerCase().includes(`${repo.toLowerCase()}.git`)) throw new Error(`Existing sandbox clone has unexpected origin: ${origin}`);
    if (git(['status', '--porcelain']).trim()) throw new Error('Existing sandbox clone is dirty');
    if (git(['branch', '--show-current']).trim() !== 'main') throw new Error('Existing sandbox clone is not on main');
    git(['fetch', 'origin', 'main']);
    if (git(['rev-parse', 'HEAD']).trim() !== git(['rev-parse', 'origin/main']).trim()) throw new Error('Existing sandbox clone is not at origin/main');
    if (worktreePaths(git(['worktree', 'list', '--porcelain'])).includes(path.resolve(clone, '.bw', 'worktrees', 'project').toLowerCase())) throw new Error('Existing project worktree was not cleaned');
  }

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${arg('port')}`, { timeout: 30000 });
  const context = browser.contexts()[0];
  if (!context) throw new Error('No real WebView2 context');
  page = context.pages()[0] || await context.waitForEvent('page', { timeout: 30000 });
  page.setDefaultTimeout(45000);

  try {
    await expect(page.getByRole('heading', { name: '接入项目', exact: true })).toBeVisible();
    await page.getByText('克隆远端仓', { exact: true }).click();
    await page.locator('.field').filter({ hasText: '远端仓' }).locator('input').fill(repo);
    await page.locator('.field').filter({ hasText: '父文件夹' }).locator('input').fill(sandboxRoot);
    await page.getByRole('button', { name: '下一步:基础信息 →', exact: true }).click();
    await expect(page.getByRole('heading', { name: '基础信息', exact: true })).toBeVisible();
    await page.locator('.field').filter({ hasText: '项目名称' }).locator('input').fill(projectName);
    await page.locator('.field').filter({ hasText: '你想做什么' }).locator('textarea').fill(`验证真实接入 ${runId}`);
    await page.locator('.field').filter({ hasText: '最像的对标' }).locator('input').fill('Workbench E2E sandbox');
    await page.locator('.field').filter({ hasText: '目标方向' }).locator('textarea').fill('接入结果可独立读回');
    await page.getByRole('button', { name: '完成接入', exact: true }).click();
    await page.locator('[data-screen="overview"]').waitFor({ timeout: 240000 });
    await expect(page.getByText(projectName, { exact: true }).first()).toBeVisible();
    await expect(page.locator('.ov-banner')).toContainText(/MR !\d+/, { timeout: 120000 });
    await page.screenshot({ path: path.join(out, 'onboarding-project.png'), fullPage: true });
    item('onboarding-project').evidence.push('onboarding-project.png');
    item('onboarding-project').status = 'passed';
  } catch (error) {
    try {
      await page.screenshot({ path: path.join(out, 'onboarding-project-failed.png'), fullPage: true });
      item('onboarding-project').evidence.push('onboarding-project-failed.png');
    } catch { /* the shell may have exited */ }
    fail(item('onboarding-project'), error);
  }

  try {
    createdIssue = exactNew(remoteIssues(), baselineIssues, x => x.title === '项目约定', '项目约定 issue');
    createdPr = exactNew(remotePrs(), baselinePrs, x => x.headRefName === 'bw/project', 'bw/project PR');
    const issue = ghJson(['issue', 'view', String(createdIssue.number), '--repo', repo, '--json', 'number,title,state,labels,url,body']);
    const pr = ghJson(['pr', 'view', String(createdPr.number), '--repo', repo, '--json', 'number,title,state,url,headRefName,headRefOid']);
    const issueLabels = issue.labels.map(x => x.name);
    if (issue.state !== 'OPEN' || !issueLabels.includes('bw:status:inreview')) throw new Error(`项目约定 issue state/labels wrong: ${issue.state} ${issueLabels.join(',')}`);
    if (pr.state !== 'OPEN' || pr.headRefName !== 'bw/project') throw new Error(`Project PR state/head wrong: ${pr.state} ${pr.headRefName}`);
    const content = ghJson(['api', '--method', 'GET', `repos/${repo}/contents/.bw/project.toml`, '-f', 'ref=bw/project']);
    const projectFile = Buffer.from(content.content.replace(/\s/g, ''), 'base64').toString('utf8');
    if (!projectFile.includes(projectName) || !projectFile.includes(runId)) throw new Error('Remote project.toml does not identify this run');
    branchOwned = true;
    const localProjectFile = path.join(clone, '.bw', 'worktrees', 'project', '.bw', 'project.toml');
    const localText = fs.readFileSync(localProjectFile, 'utf8');
    if (localText !== projectFile) throw new Error('Local project worktree and remote branch project.toml differ');
    const worktrees = git(['worktree', 'list', '--porcelain']);
    if (!worktreePaths(worktrees).includes(path.resolve(clone, '.bw', 'worktrees', 'project').toLowerCase())) throw new Error('Project worktree missing from git worktree list');
    run('gh', ['issue', 'comment', String(issue.number), '--repo', repo, '--body', `bw-e2e-run:${runId}`]);
    run('gh', ['pr', 'comment', String(pr.number), '--repo', repo, '--body', `bw-e2e-run:${runId}`]);
    save('github-issue.json', issue);
    save('github-pr.json', pr);
    save('project-file.toml', projectFile);
    save('git-worktrees.txt', worktrees);
    item('onboarding-readback').evidence.push('github-issue.json', 'github-pr.json', 'project-file.toml', 'git-worktrees.txt');
    item('onboarding-readback').status = 'passed';
  } catch (error) {
    fail(item('onboarding-readback'), error);
  }

  try {
    const raw = run('cargo', ['run', '--locked', '--quiet', '-p', 'bw-engine', '--example', 'orca_automation_readback', '--', clone]);
    const audit = JSON.parse(raw.trim());
    const expected = ['定版本计划（Workbench）', '资产盘点（Workbench）', '每日指标采集（Workbench）'];
    if (!audit.projectId) throw new Error('Orca did not return the sandbox project id');
    for (const name of expected) {
      const rows = audit.automations.filter(x => x.name === name);
      if (rows.length !== 1 || rows[0].enabled !== false) throw new Error(`Orca automation is missing, duplicated or enabled: ${name}`);
    }
    save('orca-automations.json', audit);
    item('onboarding-orca').evidence.push('orca-automations.json');
    item('onboarding-orca').status = 'passed';
  } catch (error) {
    fail(item('onboarding-orca'), error);
  }
} catch (error) {
  fail(item('onboarding-project'), error);
} finally {
  try {
    if (browser) await browser.close();
  } catch { /* CDP 断开不得阻断远端清理与回执写出 */ }
  const cleanup = { v: 1, runId, issue: null, pr: null, remoteBranchDeleted: false, projectWorktreeRemoved: false, projectBranchRemoved: false, errors: [] };
  try {
    if (!createdIssue) {
      const found = remoteIssues().filter(x => !baselineIssues.some(old => old.number === x.number) && x.title === '项目约定');
      if (found.length === 1) createdIssue = found[0];
    }
    if (!createdPr) {
      const found = remotePrs().filter(x => !baselinePrs.some(old => old.number === x.number) && x.headRefName === 'bw/project');
      if (found.length === 1) createdPr = found[0];
    }
    if (!branchOwned && refExists()) {
      try {
        const content = ghJson(['api', '--method', 'GET', `repos/${repo}/contents/.bw/project.toml`, '-f', 'ref=bw/project']);
        branchOwned = Buffer.from(content.content.replace(/\s/g, ''), 'base64').toString('utf8').includes(runId);
      } catch { /* retain unknown branch */ }
    }
    if (createdPr) {
      if (!branchOwned) throw new Error('Refusing to close PR or delete branch without this run marker');
      run('gh', ['pr', 'close', String(createdPr.number), '--repo', repo, '--delete-branch']);
      cleanup.pr = createdPr.number;
    }
    if (createdIssue) {
      run('gh', ['issue', 'close', String(createdIssue.number), '--repo', repo]);
      cleanup.issue = createdIssue.number;
    }
    if (refExists()) {
      if (!branchOwned) throw new Error('Refusing to delete unowned remote bw/project branch');
      run('gh', ['api', '--method', 'DELETE', `repos/${repo}/git/refs/heads/bw%2Fproject`]);
    }
    cleanup.remoteBranchDeleted = !refExists();
    if (fs.existsSync(clone)) {
      const projectTree = path.join(clone, '.bw', 'worktrees', 'project');
      if (fs.existsSync(projectTree)) {
        const marker = git(['show', 'bw/project:.bw/project.toml']);
        if (!marker.includes(runId)) throw new Error('Refusing to remove project worktree without this run marker');
        git(['worktree', 'remove', '--force', projectTree]);
      }
      cleanup.projectWorktreeRemoved = !fs.existsSync(projectTree);
      const branch = spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/bw/project'], { cwd: clone, windowsHide: true });
      if (branch.status === 0) git(['branch', '-D', 'bw/project']);
      cleanup.projectBranchRemoved = spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/bw/project'], { cwd: clone, windowsHide: true }).status !== 0;
    }
    if (!cleanup.remoteBranchDeleted || !cleanup.projectWorktreeRemoved || !cleanup.projectBranchRemoved) throw new Error('Cleanup postcondition failed');
    item('onboarding-cleanup').status = 'passed';
  } catch (error) {
    cleanup.errors.push(error instanceof Error ? error.message : String(error));
    fail(item('onboarding-cleanup'), error);
  }
  save('remote-cleanup.json', cleanup);
  item('onboarding-cleanup').evidence.push('remote-cleanup.json');
  for (const entry of cases) {
    if (entry.status !== 'passed') failed = true;
  }
  save('initial.json', { v: 1, cases });
}
process.exitCode = failed ? 1 : 0;
