import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeReports } from './report.mjs';

export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const storeEvidenceBlob = (root, file) => execFileSync('git', ['hash-object', '--no-filters', '-w', '--', file], { cwd: root, encoding: 'utf8' }).trim();
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const safeId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
const statuses = new Set(['passed', 'failed', 'not_run', 'not_applicable']);

export function inside(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('需要相对路径');
  const target = path.resolve(root, relative);
  const rel = path.relative(root, target);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error(`路径越界：${relative}`);
  // Evidence and configuration may not escape through a symlink or junction.
  let cursor = target;
  while (cursor !== path.resolve(root)) {
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error(`不接受链接：${relative}`);
    cursor = path.dirname(cursor);
  }
  return target;
}

export function sourceSnapshot(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  const commit = git('rev-parse', 'HEAD').toString().trim();
  const diff = git('diff', '--binary', 'HEAD', '--');
  const untracked = git('ls-files', '--others', '--exclude-standard', '-z').toString().split('\0').filter(Boolean).sort();
  const extras = untracked.map(name => {
    const file = inside(root, name);
    return [name, sha256(fs.readFileSync(file))];
  });
  return { commit, dirty: diff.length > 0 || extras.length > 0, fingerprint: sha256(Buffer.concat([Buffer.from(commit), diff, Buffer.from(JSON.stringify(extras))])) };
}

function validateStep(step) {
  if (!safeId(step.id) || typeof step.title !== 'string' || !step.title.trim()) throw new Error('步骤需要稳定 id 和标题');
  if (!Array.isArray(step.command) || !step.command.length || step.command.some(x => typeof x !== 'string' || x.includes('\0'))) throw new Error(`${step.id}: command 必须是参数数组`);
  if (!Number.isFinite(step.timeoutSeconds) || step.timeoutSeconds <= 0 || step.timeoutSeconds > 7200) throw new Error(`${step.id}: 需要 1–7200 秒超时`);
  if (step.expectedCases) {
    if (!['desktop', 'browser', 'remote', 'local'].includes(step.layer)) throw new Error(`${step.id}: 用例需要声明验证层次`);
    if (!step.expectedCases.length || step.expectedCases.some(x => !safeId(x)) || new Set(step.expectedCases).size !== step.expectedCases.length) throw new Error(`${step.id}: 用例 id 为空或重复`);
  }
  if (step.feature !== undefined && !safeId(step.feature)) throw new Error(`${step.id}: feature 归属须是小写 id（05 特性目录 id 或方法资产名）`);
}

export function readPlan(root, profile) {
  const plan = json(inside(root, '.bw/release/verify/plan.json'));
  if (plan.v !== 1 || !Object.hasOwn(plan.profiles, profile)) throw new Error(`未知 profile：${profile}`);
  const ids = plan.profiles[profile];
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('profile 步骤为空或重复');
  const steps = ids.map(id => {
    const step = plan.steps.find(x => x.id === id);
    if (!step) throw new Error(`缺少步骤：${id}`);
    return step;
  });
  if (profile !== 'headless') {
    const dir = inside(root, '.bw/release/e2e/suites');
    for (const name of fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort()) {
      const suite = json(inside(dir, name));
      if (!suite.expectedCases) throw new Error(`${name}: 专项需要列出 expectedCases`);
      if (!safeId(suite.feature)) throw new Error(`${name}: 套件必须登记 feature 归属（产品特性=05 目录 id；开发方法资产=资产名）——缺归属无法按特性出覆盖清单`);
      const profiles = suite.profiles || ['pr'];
      if (!Array.isArray(profiles) || profiles.some(x => typeof x !== 'string')) throw new Error(`${name}: profiles 格式不对`);
      const inheritedPrSuite = profile === 'pr-onboarding' && profiles.includes('pr');
      if (!profiles.includes(profile) && !inheritedPrSuite) continue;
      steps.push(suite);
    }
  }
  steps.forEach(validateStep);
  if (new Set(steps.map(x => x.id)).size !== steps.length) throw new Error('步骤 id 重复');
  return steps;
}

export function readCases(dir, expected) {
  const result = json(inside(dir, 'result.json'));
  if (result.v !== 1 || !Array.isArray(result.cases)) throw new Error('用例 result.json 格式不对');
  const ids = result.cases.map(x => x.id);
  if (ids.length !== expected.length || new Set(ids).size !== ids.length || expected.some(x => !ids.includes(x))) throw new Error('实际用例与 expectedCases 不一致，不能把少跑当通过');
  for (const item of result.cases) {
    if (!statuses.has(item.status) || typeof item.title !== 'string') throw new Error(`用例格式不对：${item.id}`);
    // path / expect 是发布验证 Review 用的可选描述字段；出现就必须是非空字符串。
    for (const field of ['path', 'expect']) if (item[field] !== undefined && (typeof item[field] !== 'string' || !item[field].trim())) throw new Error(`用例格式不对：${item.id}`);
    if (!Array.isArray(item.evidence) || (item.status === 'passed' && !item.evidence.length)) throw new Error(`通过的用例必须有证据：${item.id}`);
    for (const evidence of item.evidence) {
      const file = inside(dir, evidence);
      if (!fs.statSync(file).isFile() || fs.statSync(file).size === 0) throw new Error(`证据缺失或为空：${evidence}`);
    }
  }
  return result.cases;
}

function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 });
    else process.kill(-child.pid, 'SIGKILL');
  } catch {
    // A denied process-tree operation must not leave the runner waiting forever.
    child.kill('SIGKILL');
  }
}

export async function execute(command, options) {
  const fd = fs.openSync(options.log, 'wx');
  const started = Date.now();
  let interrupted = false;
  let timedOut = false;
  let spawnError;
  let timer;
  let child;
  const interrupt = () => { interrupted = true; if (child) killTree(child); };
  try {
    child = spawn(command[0], command.slice(1), {
      cwd: options.root, env: { ...process.env, CARGO_TARGET_DIR: path.join(options.root, 'target'), ...options.env },
      shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', fd, fd],
    });
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', interrupt);
    const code = await new Promise(resolve => {
      child.on('error', error => { spawnError = error.message; });
      child.on('close', resolve);
      timer = setTimeout(() => { timedOut = true; killTree(child); }, options.timeoutSeconds * 1000);
    });
    return { exitCode: code, seconds: Math.round((Date.now() - started) / 100) / 10, error: spawnError || (timedOut ? '执行超时，已请求停止本步骤进程；清理结果另看回执' : interrupted ? '执行被取消' : null), passed: code === 0 && !spawnError && !timedOut && !interrupted };
  } finally {
    clearTimeout(timer);
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    fs.closeSync(fd);
  }
}

export function expand(command, values) {
  return command.map(arg => {
    const expanded = arg.replace(/\{(node|root|shared|out|version)\}/g, (match, key) => (values[key] === undefined ? match : values[key]));
    // 占位符没给值必须炸，不能静默留空串拼进命令。
    if (/\{(node|root|shared|out|version)\}/.test(expanded)) throw new Error(`命令占位符没有给值：${expanded}`);
    return expanded;
  });
}

// 按特性覆盖清单（02 §6.2 环5）：机器侧半张映射——特性 × 本次实际执行的注册用例，现算自 steps。
// 验收点↔用例的对应在各特性 spec.md 回记；覆盖率以双向映射为唯一口径，本清单不得单独反推验收点覆盖。
// 有用例而无归属的步骤如实列「未归属」，不静默丢弃（readPlan 已在加载时强制套件登记归属）。
export function featureCoverage(steps) {
  const groups = new Map();
  for (const step of steps) {
    if (!Array.isArray(step.cases) || !step.cases.length) continue;
    const feature = step.feature || '未归属';
    if (!groups.has(feature)) groups.set(feature, []);
    groups.get(feature).push(step);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] === '未归属') - (b[0] === '未归属') || a[0].localeCompare(b[0]))
    .map(([feature, suiteSteps]) => ({
      feature,
      suites: suiteSteps.map(x => x.id),
      cases: suiteSteps.flatMap(x => x.cases).length,
      passed: suiteSteps.flatMap(x => x.cases).filter(c => c.status === 'passed').length,
      caseList: suiteSteps.flatMap(x => x.cases.map(c => ({ id: c.id, suite: x.id, status: c.status }))),
    }));
}

function artifacts(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const rel = prefix + entry.name;
    const file = inside(dir, entry.name);
    if (entry.isDirectory()) return artifacts(file, `${rel}/`);
    return [{ path: rel, bytes: fs.statSync(file).size, sha256: sha256(fs.readFileSync(file)) }];
  });
}

export async function runVerification({ root, profile, steps = readPlan(root, profile), version }) {
  steps.forEach(validateStep);
  const source = sourceSnapshot(root);
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
  const parent = inside(root, '.bw/release/out/verify');
  fs.mkdirSync(parent, { recursive: true });
  const out = path.join(parent, runId);
  fs.mkdirSync(out);
  // 指针先落盘：即使本次运行中途失败，CI Summary 也能定位到这份不完整的 run 如实报错。
  fs.writeFileSync(path.join(parent, 'last-run.txt'), runId);
  const commonGitDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim();
  const shared = path.dirname(path.resolve(root, commonGitDir));
  const report = {
    v: 1, runId, profile, source, startedAt: new Date().toISOString(),
    environment: { platform: process.platform, release: os.release(), arch: process.arch, node: process.version },
    status: 'running', steps: steps.map(x => ({ id: x.id, title: x.title, feature: x.feature, layer: x.layer || 'gate', status: 'not_run', cases: (x.expectedCases || []).map(id => ({ id, title: id, status: 'not_run', evidence: [], message: '尚未执行' })) })),
    limits: ['仅证明表中实际执行的检查；专项覆盖是否充分及代码 Review 仍须审查。', '源码验证不能证明安装包或正式发布；远端写入与 Orca 会话仅以明确列出的专项用例为准。核心桌面用例由固定脚本执行，不调用模型。'],
  };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
  let blocked = false;
  for (let index = 0; index < steps.length; index++) {
    const spec = steps[index];
    const step = report.steps[index];
    if (blocked) { step.message = '前置步骤失败，未执行'; continue; }
    const dir = path.join(out, step.id);
    fs.mkdirSync(dir);
    step.command = expand(spec.command, { node: process.execPath, root, shared, out: dir, version });
    step.log = `${step.id}/command.log`;
    console.log(`[${step.id}] ${step.title}`);
    try {
      const outcome = await execute(step.command, { root, log: path.join(dir, 'command.log'), timeoutSeconds: spec.timeoutSeconds });
      step.seconds = outcome.seconds;
      step.exitCode = outcome.exitCode;
      step.status = outcome.passed ? 'passed' : 'failed';
      step.message = outcome.error || (outcome.passed ? '执行通过' : `进程退出码：${outcome.exitCode}`);
      if (spec.expectedCases) {
        step.cases = readCases(dir, spec.expectedCases);
        const detail = json(path.join(dir, 'result.json')).error;
        if (!outcome.passed && typeof detail === 'string' && detail) step.message = detail;
        if (step.cases.some(x => x.status !== 'passed')) {
          step.status = 'failed';
          step.message = [outcome.error, detail, '必跑用例存在失败、未跑或不适用'].filter(Boolean).join('；');
        }
      }
    } catch (error) {
      step.status = 'failed';
      step.message = error.message;
    }
    if (spec.expectedCases && !step.cases.length) step.cases = spec.expectedCases.map(id => ({ id, title: id, status: 'not_run', evidence: [], message: '没有可验证的用例结果' }));
    blocked = step.status !== 'passed';
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
    console.log(`[${step.id}] ${step.status}: ${step.message}`);
  }
  try {
    report.sourceAfter = sourceSnapshot(root);
    report.sourceUnchanged = source.fingerprint === report.sourceAfter.fingerprint;
  } catch (error) { report.sourceUnchanged = false; report.sourceError = error.message; }
  report.status = !blocked && report.sourceUnchanged ? 'passed' : 'failed';
  report.finishedAt = new Date().toISOString();
  report.seconds = Math.round((Date.parse(report.finishedAt) - Date.parse(report.startedAt)) / 100) / 10;
  report.featureCoverage = featureCoverage(report.steps);
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
  writeReports(out, report);
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ v: 1, runId, source, artifacts: artifacts(out) }, null, 2));
  console.log(`报告：${path.join(out, 'report.html')}`);
  return { out, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const usage = '用法：在仓根运行 node .bw/release/verify/verify.mjs --profile headless|pr|pr-onboarding|pack|installer [--version <tag串>]';
    let profile = null;
    let version;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--profile' && i + 1 < args.length) { profile = args[++i]; continue; }
      if (args[i] === '--version' && i + 1 < args.length) { version = args[++i]; continue; }
      throw new Error(usage);
    }
    if (!['headless', 'pr', 'pr-onboarding', 'pack', 'installer'].includes(profile)) throw new Error(usage);
    // installer 验的是 out/<版本>/ 里的候选包，必须知道验哪个版本；版本串规则同 ADR 0005。
    if (profile === 'installer') {
      if (typeof version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(version)) throw new Error('installer profile 需要 --version <tag串>：首字符须字母或数字，其余只用字母、数字和 . _ + -');
    } else if (version !== undefined) {
      throw new Error('--version 只配合 --profile installer 使用');
    }
    if (profile !== 'headless' && process.platform !== 'win32') throw new Error('完整 PR 桌面验证当前需要 Windows；Linux 用 headless，macOS 尚未接入');
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    const { report } = await runVerification({ root, profile, version });
    process.exitCode = report.status === 'passed' ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
