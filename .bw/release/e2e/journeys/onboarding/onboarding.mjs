// 用例六件事：
// 1. 保护规则：从真实桌面接入远端项目后，GitHub、本地 Git 工作树与 Orca 处处可独立读回；
//    加 --weekplan 后接续周一屏旅程：定版本计划自动化真实指向 week-plan 常驻树、
//    该树真的出现会话文件、周一屏页面的修改真的保存到常驻树。
//    测试只收走本次运行创建的对象，不动沙箱既有内容。
// 2. 环境与数据：Windows、本机已登录 gh、Orca 桌面已打开、固定沙箱仓 yuzhup/bw-e2e-sandbox
//    （repository id 由 desktop.ps1 传入并核验），Playwright 通过 CDP 附着真实壳；
//    --weekplan 另需本机 python 与已构建的 bw-engine/bw 示例。
// 3. 真实动作：接入项目 → 克隆远端仓 → 填写基础信息 → 完成接入 → 项目墙；
//    --weekplan 再接：打开项目触发 BW 写 Orca 自动化 → 以开工同款 RPC 启动真实会话 →
//    planning.py 在 week-plan 常驻树起服务，无头浏览器修改目标。
// 4. 独立读回：gh 读回 Issue/PR/分支内容，git 读回项目工作树，bw-engine 示例读回 Orca 自动化
//    与会话文件；周一屏修改直接读回常驻树磁盘 data.json 与 git status。
// 5. 证据：每条用例的截图与 JSON 读回，全部写入本步骤输出目录。
// 6. 清理：只关闭/删除带本次 run-id 标记的 Issue、PR、远端分支与项目工作树；探针会话进程只按
//    本次归属标记匹配清理；周一屏写入的 .bw/planning 版本目录整体移除并读回工作树恢复干净；
//    身份不明即失败并保留。PR/Issue 打标一段未纳入自动化，出包时由版本报告人工补充。
import { chromium, expect } from 'playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
const startedAt = Date.now();
const weekplan = argv.includes('--weekplan');
const shortId = runId.slice(0, 8);
const projectName = `BW E2E ${shortId}`;
const clone = path.join(sandboxRoot, repo.split('/').at(-1));
const weekPlanTree = path.join(clone, '.bw', 'worktrees', 'week-plan');
const planVersion = `vE2E-${shortId}`;
const sessionMarker = `bw-e2e-session:${runId}`;
const py = process.env.BW_PLANNING_PYTHON || 'python';
const cases = [
  { id: 'onboarding-project', title: '从真实桌面接入 GitHub 沙箱项目', path: '接入项目 → 克隆远端仓 → 填写基础信息 → 完成接入 → 项目墙', expect: '项目墙出现本项目名片，横幅含本次接入打开的 MR 编号；远端读单次网络抖动失败时按真人行为点刷新重试', status: 'not_run', evidence: [] },
  { id: 'onboarding-readback', title: '从 GitHub、Git 和项目名片读回接入结果', path: 'gh 读回 Issue/PR/分支内容；git 读回项目工作树', expect: '项目约定 Issue 打开且挂 bw:status:inreview；bw/project PR 打开；远端与本地 project.toml 一致且含本次 run-id', status: 'not_run', evidence: [] },
  { id: 'onboarding-orca', title: 'Orca 登记沙箱仓并保留三条关闭的自动化', path: 'bw-engine 示例独立读回 Orca 的项目与自动化列表', expect: '沙箱项目已登记，三条 Workbench 自动化各存在一条且均为关闭', status: 'not_run', evidence: [] },
  { id: 'onboarding-cleanup', title: '只收掉本次远端对象和项目约定工作树', path: '关闭本次 PR/Issue → 删除远端 bw/project → 移除项目工作树与本地分支', expect: '清理回执全为真；沙箱主仓、其余工作树与三条自动化保留', status: 'not_run', evidence: [] },
];
if (weekplan) cases.splice(3, 0,
  { id: 'weekplan-automation', title: '打开项目后，定版本计划自动化指向 week-plan 常驻树', path: 'BW 打开沙箱项目触发写入 → bw-engine 示例独立读回自动化明细', expect: '定版本计划（Workbench）唯一且关闭，执行目录是本项目 week-plan 常驻树，提示词含 bw/week-plan、周一屏与 planning.py 指引，updatedAt 不早于本次旅程开始', status: 'not_run', evidence: [] },
  { id: 'weekplan-session', title: 'week-plan 常驻树里真实出现一个会话', path: '以 BW 开工同款 RPC 启动会话 → 等待新的 Claude 会话文件 → 读回内容 → 按归属标记清理进程', expect: '出现不属于基线的新会话 jsonl 且非空；进程清理回执无残留', status: 'not_run', evidence: [] },
  { id: 'weekplan-html', title: '周一屏页面的修改真实保存到 week-plan 常驻树', path: '部署真实 Skill → planning.py 在常驻树起服务 → 无头浏览器修改目标 → 读回磁盘 data.json 与 git status', expect: '磁盘 JSON 与页面输入一致；清理后常驻树恢复干净', status: 'not_run', evidence: [] },
);
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
let issueOwned = false;
let failed = false;
let planFixture = null;
let planBrowser = null;
let planPack = null;
// 只清理命令行含本次归属标记的进程；标记唯一到 run-id，不碰任何身份不明进程。
const killMarked = () => {
  const script = '$m=$env:BW_E2E_MARKER;'
    + '$procs=@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($m) });'
    + '$found=@($procs | ForEach-Object ProcessId);'
    + 'foreach($p in $procs){ taskkill.exe /PID $p.ProcessId /T /F 2>&1 | Out-Null };'
    + 'Start-Sleep -Milliseconds 800;'
    + '$left=@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($m) } | ForEach-Object ProcessId);'
    + 'ConvertTo-Json -Compress @{found=$found;remaining=$left}';
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 60000,
    env: { ...process.env, BW_E2E_MARKER: sessionMarker },
  }).trim();
  return JSON.parse(raw);
};
const planCli = (...args) => JSON.parse(run(py, ['-B', '-X', 'utf8', path.join(planPack, 'scripts', 'planning.py'), '--workspace', weekPlanTree, '--version', planVersion, ...args]));

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
    // 总览的远端读是一次性 gather：单次网络抖动（如 TLS 握手超时）失败后横幅不会自己出现，
    // 真人的行为是看到顶部读失败横幅后点刷新。用例照这个行为重试，不空等一个不会出现的结果。
    for (let attempt = 1; ; attempt += 1) {
      try {
        await expect(page.locator('.ov-banner')).toContainText(/MR !\d+/, { timeout: 40000 });
        break;
      } catch (error) {
        if (attempt >= 3) throw error;
        try {
          await page.getByRole('button', { name: '刷新', exact: true }).click({ timeout: 5000 });
        } catch {
          throw error;
        }
      }
    }
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
    issueOwned = true;
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

  if (weekplan) {
    // —— 周一屏真实旅程：自动化 → 真实会话 → HTML 保存。PR/Issue 打标一段未自动化，出包时人工补充。 ——
    try {
      const expectedWs = path.resolve(weekPlanTree).toLowerCase();
      const deadline = Date.now() + 180000;
      let audit = null;
      let matched = null;
      for (;;) {
        audit = JSON.parse(run('cargo', ['run', '--locked', '--quiet', '-p', 'bw-engine', '--example', 'orca_automation_readback', '--', clone]).trim());
        const rows = audit.automations.filter(x => x.name === '定版本计划（Workbench）');
        matched = rows.length === 1 ? rows[0] : null;
        if (matched
          && path.resolve(matched.workspace || '').toLowerCase() === expectedWs
          && matched.prompt.includes('bw/week-plan')
          && matched.prompt.includes('周一屏')
          && matched.prompt.includes('planning.py')
          && matched.prompt.toLowerCase().includes(expectedWs)
          // 每次打开项目都会无条件 automation.update，updatedAt 必须晚于旅程开始（留 60 秒时钟偏差）。
          && Number(matched.updatedAt) >= startedAt - 60000) break;
        if (Date.now() > deadline) throw new Error(`180 秒内定版本计划自动化未指向本项目 week-plan 常驻树：${JSON.stringify(matched ?? audit.automations.map(x => x.name))}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      save('weekplan-automation.json', audit);
      item('weekplan-automation').evidence.push('weekplan-automation.json');
      item('weekplan-automation').status = 'passed';
    } catch (error) {
      fail(item('weekplan-automation'), error);
    }

    try {
      if (!fs.existsSync(weekPlanTree)) throw new Error('week-plan 常驻树不存在，无法启动会话');
      const probe = JSON.parse(run('cargo', ['run', '--locked', '--quiet', '-p', 'bw-engine', '--example', 'orca_session_probe', '--', weekPlanTree, sessionMarker, '180'], { timeout: 600000 }).trim());
      if (!probe.sessionId || !probe.jsonlPath) throw new Error('探针没有读回新会话');
      const head = fs.readFileSync(probe.jsonlPath, 'utf8').slice(0, 4096);
      JSON.parse(head.split(/\r?\n/).find(line => line.trim()) ?? 'null');
      if (!head.trim()) throw new Error('会话文件为空');
      save('weekplan-session.json', probe);
      fs.writeFileSync(path.join(out, 'weekplan-session-jsonl-head.txt'), head);
      item('weekplan-session').evidence.push('weekplan-session.json', 'weekplan-session-jsonl-head.txt');
    } catch (error) {
      fail(item('weekplan-session'), error);
    } finally {
      if (weekplan) {
        try {
          const receipt = killMarked();
          save('weekplan-session-kill.json', receipt);
          const entry = item('weekplan-session');
          if (!entry.evidence.includes('weekplan-session-kill.json')) entry.evidence.push('weekplan-session-kill.json');
          if (receipt.remaining.length) fail(entry, new Error(`本次探针会话进程仍有残留：${receipt.remaining.join(',')}`));
          else if (entry.status === 'not_run') entry.status = 'passed';
        } catch (error) {
          fail(item('weekplan-session'), error);
        }
      }
    }

    let bwDirExisted = false;
    try {
      const status0 = git(['status', '--porcelain'], weekPlanTree).trim();
      if (status0) throw new Error(`week-plan 常驻树不干净，拒绝写入：${status0}`);
      bwDirExisted = fs.existsSync(path.join(weekPlanTree, '.bw'));
      planFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-weekplan-e2e-'));
      run('cargo', ['run', '--locked', '--quiet', '-p', 'bw', '--example', 'planning_smoke', '--', planFixture], { timeout: 600000 });
      const deployment = JSON.parse(fs.readFileSync(path.join(planFixture, 'deployment.json'), 'utf8'));
      planPack = path.join(deployment.skills, 'week-planning');
      planCli('init');
      const dataFile = path.join(weekPlanTree, '.bw', 'planning', planVersion, 'data.json');
      const seed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      seed.project = projectName;
      seed.results.goals = [{ id: 'G1', label: 'G1', title: '周一屏旅程种子目标', metric: '旅程段', target: '3', reading: '1', progress: null, status: { label: '未达', tone: 'warning' } }];
      fs.writeFileSync(dataFile, JSON.stringify(seed, null, 2));
      const service = planCli('start');
      planBrowser = await chromium.launch({ channel: 'msedge', headless: true });
      const planPage = await planBrowser.newPage({ viewport: { width: 1440, height: 1000 } });
      await planPage.goto(service.url);
      const goalTitle = `周一屏旅程真实保存 ${shortId}`;
      const goal = planPage.locator('.pane-1 [data-list="results.goals"] [data-bind="title"]');
      await expect(goal).toHaveText('周一屏旅程种子目标');
      await goal.fill(goalTitle);
      await planPage.locator('.pane-1 h2').first().click();
      await expect.poll(() => JSON.parse(fs.readFileSync(dataFile, 'utf8')).results.goals[0].title, { timeout: 15000 }).toBe(goalTitle);
      await planPage.screenshot({ path: path.join(out, 'weekplan-html.png'), fullPage: true });
      fs.copyFileSync(dataFile, path.join(out, 'weekplan-data.json'));
      fs.writeFileSync(path.join(out, 'weekplan-worktree-git-status.txt'), git(['status', '--porcelain'], weekPlanTree));
      item('weekplan-html').evidence.push('weekplan-html.png', 'weekplan-data.json', 'weekplan-worktree-git-status.txt');
    } catch (error) {
      fail(item('weekplan-html'), error);
    } finally {
      if (planBrowser) await planBrowser.close().catch(() => { /* 清理回执优先 */ });
      try {
        if (planPack) run(py, ['-B', '-X', 'utf8', path.join(planPack, 'scripts', 'planning.py'), '--workspace', weekPlanTree, 'stop'], { timeout: 60000 });
      } catch { /* stop 失败由下面的干净读回暴露 */ }
      try {
        // 只移除本次写入的规划目录（版本目录、本地状态、服务模板与 .gitignore）；常驻树必须读回为干净，否则如实失败。
        const planRoot = path.join(weekPlanTree, '.bw', 'planning');
        if (fs.existsSync(planRoot) && fs.readdirSync(planRoot).every(name => name === planVersion || name === '.local' || name === '.gitignore' || name === 'template')) {
          fs.rmSync(planRoot, { recursive: true, force: true });
        }
        if (!fs.existsSync(path.join(weekPlanTree, '.bw', 'planning')) && !bwDirExisted) fs.rmSync(path.join(weekPlanTree, '.bw'), { recursive: true, force: true });
        const status1 = git(['status', '--porcelain'], weekPlanTree).trim();
        save('weekplan-html-cleanup.json', { version: planVersion, planningDirRemoved: !fs.existsSync(path.join(weekPlanTree, '.bw', 'planning')), worktreeClean: !status1, status: status1 });
        const entry = item('weekplan-html');
        entry.evidence.push('weekplan-html-cleanup.json');
        if (status1) fail(entry, new Error(`清理后 week-plan 常驻树仍有改动：${status1}`));
        else if (entry.status === 'not_run') entry.status = 'passed';
      } catch (error) {
        fail(item('weekplan-html'), error);
      }
      if (planFixture) {
        try {
          const resolved = fs.realpathSync(planFixture);
          const temp = fs.realpathSync(os.tmpdir());
          if (path.dirname(resolved) !== temp || !path.basename(resolved).startsWith('bw-weekplan-e2e-')) throw new Error('Unexpected fixture cleanup path');
          fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        } catch (error) {
          save('weekplan-fixture-cleanup-error.txt', String(error));
        }
        planFixture = null;
      }
    }
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
    if (!issueOwned && createdIssue) {
      try {
        // 与分支同款的归属回补：读回本次运行打的评论标记；读不到就不动这个 Issue。
        // gh issue view --json 返回对象（{ comments: [...] }），不是 issue list 的数组形状。
        const comments = ghJson(['issue', 'view', String(createdIssue.number), '--repo', repo, '--json', 'comments']).comments;
        issueOwned = Array.isArray(comments) && comments.some(x => String(x.body ?? '').includes(`bw-e2e-run:${runId}`));
      } catch { /* retain unknown issue */ }
    }
    if (createdIssue) {
      if (!issueOwned) throw new Error('Refusing to close issue without this run marker');
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
    } else {
      // 接入在克隆完成前失败时，本地没有需要清理的对象；「无需清理」不得记成清理失败，否则遮蔽首因。
      cleanup.projectWorktreeRemoved = true;
      cleanup.projectBranchRemoved = true;
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
