import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { inside, readCases, readPlan, runVerification, sha256, storeEvidenceBlob, expand, featureCoverage } from './verify.mjs';
import { incrementalSuiteIds } from './publish-review.mjs';
import { externalReviewState, reviewStateLine } from './review-state.mjs';

function fixture(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'bw-verify-tests-'));
  t.after(() => {
    const relative = path.relative(parent, root);
    assert.match(relative, /^bw-verify-tests-[^\\/]+$/);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '--quiet');
  fs.writeFileSync(path.join(root, '.gitignore'), '.bw/release/out/\n');
  fs.writeFileSync(path.join(root, 'README.md'), 'fixture\n');
  git('add', '.');
  git('-c', 'user.name=Verification Test', '-c', 'user.email=verify@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Fixture');
  return root;
}
const step = (id, code, extra = {}) => ({ id, title: id, command: [process.execPath, '-e', code], timeoutSeconds: 10, ...extra });
const run = (root, steps) => runVerification({ root, profile: 'test', steps });

test('write-capable onboarding stays out of the ordinary PR profile', () => {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const ordinary = readPlan(root, 'pr').map(x => x.id);
  const onboarding = readPlan(root, 'pr-onboarding').map(x => x.id);
  const pack = readPlan(root, 'pack').map(x => x.id);
  assert.ok(ordinary.includes('desktop-core'));
  assert.ok(!ordinary.includes('desktop-onboarding'));
  assert.ok(onboarding.includes('desktop-core'));
  assert.ok(onboarding.includes('desktop-onboarding'));
  for (const id of ordinary) assert.ok(onboarding.includes(id), `pr-onboarding must retain ordinary PR step ${id}`);
  assert.ok(pack.includes('desktop-core'));
  assert.ok(pack.includes('version-planning'));
  assert.ok(pack.includes('week-plan-journey'));
  // week-plan-journey 复用接入旅程脚本并已包含其全部用例，pack 不再重复跑一遍添加项目。
  assert.ok(!pack.includes('desktop-onboarding'));
  for (const id of ordinary) assert.ok(pack.includes(id), `pack must retain ordinary PR step ${id}`);
});

test('nonzero exit cannot be hidden by a success-looking log; later steps do not run', async t => {
  const root = fixture(t);
  const { report } = await run(root, [step('fails', 'console.log(JSON.stringify({ok:true}));process.exit(7)'), step('later', 'throw Error("must not run")')]);
  assert.equal(report.status, 'failed');
  assert.equal(report.steps[0].exitCode, 7);
  assert.equal(report.steps[1].status, 'not_run');
});

test('missing executable and timeout both produce a finished failure report', async t => {
  const root = fixture(t);
  const missing = await run(root, [{ ...step('missing', ''), command: ['bw-nonexistent-test-command'] }]);
  assert.equal(missing.report.status, 'failed');
  const timeout = await run(root, [step('timeout', 'setInterval(()=>{},1000)', { timeoutSeconds: 0.2 })]);
  assert.equal(timeout.report.status, 'failed');
  assert.match(timeout.report.steps[0].message, /超时/);
});

test('changed source invalidates an otherwise green run', async t => {
  const root = fixture(t);
  const { report } = await run(root, [step('mutates', 'require("node:fs").writeFileSync("README.md","changed")')]);
  assert.equal(report.steps[0].status, 'passed');
  assert.equal(report.sourceUnchanged, false);
  assert.equal(report.status, 'failed');
});

test('zero-exit E2E with missing expected case cannot pass', async t => {
  const root = fixture(t);
  const code = 'require("node:fs").writeFileSync(process.argv[1]+"/result.json",JSON.stringify({v:1,cases:[]}))';
  const spec = step('incomplete', code, { layer: 'desktop', expectedCases: ['required'] });
  spec.command.push('{out}');
  const { report } = await run(root, [spec]);
  assert.equal(report.status, 'failed');
  assert.equal(report.steps[0].cases[0].status, 'not_run');
});

test('E2E failure retains setup/cleanup and individual case reasons in the PR summary', async t => {
  const root = fixture(t);
  const spec = step('failed-case', 'require("node:fs").writeFileSync(process.argv[1]+"/result.json",JSON.stringify({v:1,error:"cleanup still locked",cases:[{id:"required",title:"Required journey",status:"failed",message:"remote readback timed out",evidence:[]}]}));process.exit(1)', { layer: 'desktop', expectedCases: ['required'] });
  spec.command.push('{out}');
  const { out, report } = await run(root, [spec]);
  assert.equal(report.status, 'failed');
  assert.match(report.steps[0].message, /cleanup still locked/);
  const summary = fs.readFileSync(path.join(out, 'review.md'), 'utf8');
  assert.match(summary, /cleanup still locked/);
  assert.match(summary, /remote readback timed out/);
});

test('evidence needs known status, exact cases, nonempty owned files, and no path escape', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'proof.txt'), 'readback');
  const save = (status, evidence, id = 'one') => fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify({ v: 1, cases: [{ id, title: 'one', status, evidence }] }));
  save('passed', ['proof.txt']);
  assert.equal(readCases(root, ['one'])[0].status, 'passed');
  save('green', ['proof.txt']);
  assert.throws(() => readCases(root, ['one']), /格式/);
  save('passed', []);
  assert.throws(() => readCases(root, ['one']), /证据/);
  save('passed', ['../proof.txt']);
  assert.throws(() => readCases(root, ['one']), /越界/);
  assert.throws(() => inside(root, path.parse(root).root), /相对路径/);
  save('passed', ['missing.txt']);
  assert.throws(() => readCases(root, ['one']));
  fs.writeFileSync(path.join(root, 'proof.txt'), '');
  save('passed', ['proof.txt']);
  assert.throws(() => readCases(root, ['one']), /为空/);
});

test('case path and expect are optional but must be nonempty strings', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'proof.txt'), 'readback');
  const save = extra => fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify({ v: 1, cases: [{ id: 'one', title: 'one', status: 'passed', evidence: ['proof.txt'], ...extra }] }));
  save({ path: '设置 → 保存', expect: '目录读回一致' });
  const cases = readCases(root, ['one']);
  assert.equal(cases[0].path, '设置 → 保存');
  assert.equal(cases[0].expect, '目录读回一致');
  save({ path: '   ' });
  assert.throws(() => readCases(root, ['one']), /格式/);
  save({ expect: 7 });
  assert.throws(() => readCases(root, ['one']), /格式/);
});

test('review.md groups results into four blocks and names the profile', async t => {
  const root = fixture(t);
  const code = 'require("node:fs").writeFileSync(process.argv[1]+"/proof.txt","ok");require("node:fs").writeFileSync(process.argv[1]+"/result.json",JSON.stringify({v:1,cases:[{id:"one",title:"旅程用例",path:"A → B",expect:"B 可读回",status:"passed",evidence:["proof.txt"]}]}));process.exit(0)';
  const spec = step('case-step', code, { layer: 'browser', expectedCases: ['one'], title: '示例旅程' });
  spec.command.push('{out}');
  const { out } = await run(root, [spec]);
  const summary = fs.readFileSync(path.join(out, 'review.md'), 'utf8');
  assert.match(summary, /### 基础检查 · 检查 0\/0 通过/);
  assert.match(summary, /### 单元测试 · 检查 0\/0 通过/);
  assert.match(summary, /### 知识库检查 · 检查 0\/0 通过/);
  assert.match(summary, /### E2E 用例（按旅程） · 用例 1\/1 通过/);
  assert.match(summary, /执行范围：test ·/);
  assert.match(summary, /示例旅程 · 1\/1 通过/);
  const page = fs.readFileSync(path.join(out, 'report.html'), 'utf8');
  assert.ok(page.includes('<h2>基础检查</h2>'));
  assert.ok(page.includes('<h2>E2E 用例（按旅程）</h2>'));
  assert.ok(page.includes('执行路径</b> A → B'));
  assert.ok(page.includes('期望结果</b> B 可读回'));
});

test('installer profile registers the packaged-app suite and {version} expands with a guard', () => {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const ids = readPlan(root, 'installer').map(x => x.id);
  assert.ok(ids.includes('installer'));
  assert.ok(!ids.includes('desktop-core')); // 源码级套件不进验包 profile，两层各自证明各自的对象
  assert.deepEqual(
    expand(['powershell.exe', '-Version', '{version}', '-OutDir', '{out}'], { node: 'N', root: 'R', shared: 'S', out: 'O', version: 'v9.9.9' }),
    ['powershell.exe', '-Version', 'v9.9.9', '-OutDir', 'O'],
  );
  assert.throws(() => expand(['{version}'], { node: 'N', root: 'R', shared: 'S', out: 'O' }), /占位符/);
});

test('incremental suites come from journey paths and registry content, not profiles', () => {
  const steps = [
    { id: 'desktop-core', cases: [{ id: 'a' }] },
    { id: 'version-planning', cases: [{ id: 'b' }] },
    { id: 'desktop-onboarding', cases: [{ id: 'c' }] },
  ];
  const coreBase = { id: 'desktop-core', title: 't', command: ['c'], expectedCases: ['x'] };
  const withProfiles = { ...coreBase, profiles: ['pr', 'pr-onboarding'] };
  assert.deepEqual(
    incrementalSuiteIds(steps, ['.bw/release/e2e/journeys/onboarding/onboarding.mjs', '.bw/release/e2e/suites/core.json'], (file, atBase) => (atBase ? coreBase : withProfiles)),
    new Set(['desktop-onboarding']),
  );
  const changedCases = { ...coreBase, expectedCases: ['x', 'y'] };
  assert.deepEqual(
    incrementalSuiteIds(steps, ['.bw/release/e2e/suites/core.json'], (file, atBase) => (atBase ? coreBase : changedCases)),
    new Set(['desktop-core']),
  );
  assert.deepEqual(incrementalSuiteIds(steps, ['.bw/release/e2e/planning.mjs'], () => null), new Set(['version-planning']));
  assert.equal(incrementalSuiteIds(steps, ['.bw/release/verify/report.mjs', 'crates/bw/src/lib.rs', '.bw/release/e2e/desktop.ps1'], () => null).size, 0);
});

test('evidence roundtrip preserves CRLF and binary bytes even with Git text conversion enabled', t => {
  const root = fixture(t);
  execFileSync('git', ['config', 'core.autocrlf', 'true'], { cwd: root });
  fs.writeFileSync(path.join(root, '.gitattributes'), '* text\n');
  const before = execFileSync('git', ['write-tree'], { cwd: root });
  for (const bytes of [Buffer.from('{\r\n  "v": 1\r\n}\r\n'), Buffer.from([0, 255, 13, 10, 128])]) {
    const file = path.join(root, 'evidence.json');
    fs.writeFileSync(file, bytes);
    const blob = storeEvidenceBlob(root, file);
    assert.deepEqual(execFileSync('git', ['cat-file', 'blob', blob], { cwd: root }), bytes);
  }
  assert.deepEqual(execFileSync('git', ['write-tree'], { cwd: root }), before);
});

test('successful runs remain separate, escaped reports have verifiable artifact hashes', async t => {
  const root = fixture(t);
  const spec = step('pass', 'console.log("verified")', { title: '<script>bad()</script>' });
  const first = await run(root, [spec]);
  const second = await run(root, [spec]);
  assert.notEqual(first.out, second.out);
  assert.equal(first.report.status, 'passed');
  const content = fs.readFileSync(path.join(first.out, 'report.html'), 'utf8');
  assert.ok(content.includes('&lt;script&gt;'));
  assert.ok(!content.includes('<script>bad()'));
  const manifest = JSON.parse(fs.readFileSync(path.join(first.out, 'manifest.json'), 'utf8'));
  for (const artifact of manifest.artifacts) assert.equal(sha256(fs.readFileSync(path.join(first.out, artifact.path))), artifact.sha256);
});

test('external review state honors only the current-commit marker; failures stay unknown, never green', () => {
  const pages = comments => () => JSON.stringify([comments]);
  const head = '0123456789abcdef0123456789abcdef01234567';
  const staleSha = 'ffffffffffffffffffffffffffffffffffffffff';
  const reviewed = externalReviewState({ repo: 'o/r', prNumber: '7', headSha: head, runCommand: pages([{ user: { login: 'claude[bot]' }, body: `<!-- bw-code-review:${head} -->\n结论`, html_url: 'https://gh/7#ic-1' }]) });
  assert.deepEqual(reviewed, { state: 'reviewed', url: 'https://gh/7#ic-1' });
  assert.match(reviewStateLine(reviewed), /当前提交的评审结论/);
  const stale = externalReviewState({
    repo: 'o/r', prNumber: '7', headSha: head, runCommand: pages([
      { user: { login: 'claude[bot]' }, body: `<!-- bw-code-review:${staleSha} -->\n旧结论` },
      { user: { login: 'someone-else' }, body: `<!-- bw-code-review:${head} -->\n冒充` },
    ]),
  });
  assert.equal(stale.state, 'none'); // 旧 SHA 的结论、非评审机器人的标记都不算数
  assert.match(reviewStateLine(stale), /未召唤（灰）/);
  const failed = externalReviewState({ repo: 'o/r', prNumber: '7', headSha: head, runCommand: () => { throw new Error('gh 不可用'); } });
  assert.equal(failed.state, 'unknown');
  assert.match(reviewStateLine(failed), /状态读取失败（灰）.*gh 不可用/);
  assert.equal(externalReviewState({ repo: 'o/r', prNumber: '7', headSha: '' }).state, 'unknown');
});

test('CI summary locates this run via the last-run pointer, not a directory-count assumption', async t => {
  const root = fixture(t);
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const script = path.join(repoRoot, '.bw/release/verify/github-summary.mjs');
  const spec = step('pass', 'console.log("verified")');
  await run(root, [spec]);
  const second = await run(root, [spec]); // 复跑留下两个 run 目录，数量假设会误报
  const summaryFile = path.join(root, 'summary.md');
  const env = { ...process.env, GITHUB_STEP_SUMMARY: summaryFile };
  for (const key of ['GITHUB_REF', 'GITHUB_REPOSITORY', 'GITHUB_TOKEN', 'GH_TOKEN']) delete env[key];
  const spawnSummary = () => execFileSync(process.execPath, [script], { cwd: root, env, stdio: 'pipe' });
  assert.equal(fs.readFileSync(path.join(root, '.bw/release/out/verify/last-run.txt'), 'utf8'), path.basename(second.out));
  spawnSummary();
  assert.match(fs.readFileSync(summaryFile, 'utf8'), /执行范围：test/);
  fs.rmSync(path.join(root, '.bw/release/out/verify/last-run.txt'));
  try {
    spawnSummary();
    assert.fail('指针缺失时不能把 Summary 当成功');
  } catch { /* 非零退出即预期 */ }
  assert.match(fs.readFileSync(summaryFile, 'utf8'), /没有生成本次运行的完整报告/);
});

test('every registered suite carries feature attribution across profiles', () => {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  for (const profile of ['pr', 'pr-onboarding', 'pack', 'installer']) {
    for (const step of readPlan(root, profile)) {
      if (step.expectedCases) assert.ok(step.feature, `${profile}/${step.id} 缺 feature 归属`);
    }
  }
});

test('suite without feature attribution is rejected at plan load', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, '.bw/release/verify'), { recursive: true });
  fs.mkdirSync(path.join(root, '.bw/release/e2e/suites'), { recursive: true });
  fs.writeFileSync(path.join(root, '.bw/release/verify/plan.json'), JSON.stringify({ v: 1, profiles: { mini: ['g'] }, steps: [{ id: 'g', title: 'g', command: ['node', '-e', ''], timeoutSeconds: 5 }] }));
  const suite = { id: 'x-suite', title: 'x', layer: 'local', profiles: ['mini'], command: ['node', '-e', ''], timeoutSeconds: 5, expectedCases: ['c'] };
  fs.writeFileSync(path.join(root, '.bw/release/e2e/suites/x.json'), JSON.stringify(suite));
  assert.throws(() => readPlan(root, 'mini'), /feature 归属/);
  fs.writeFileSync(path.join(root, '.bw/release/e2e/suites/x.json'), JSON.stringify({ ...suite, feature: 'Demo_Feature' }));
  assert.throws(() => readPlan(root, 'mini'), /feature 归属/); // 大写/下划线不是合法 id
  fs.writeFileSync(path.join(root, '.bw/release/e2e/suites/x.json'), JSON.stringify({ ...suite, feature: 'demo-feature' }));
  assert.equal(readPlan(root, 'mini').find(s => s.id === 'x-suite').feature, 'demo-feature');
});

test('feature coverage groups registered cases per feature; unattributed stays visible', () => {
  const coverage = featureCoverage([
    { id: 's1', feature: 'project-onboarding', cases: [{ id: 'a', status: 'passed' }, { id: 'b', status: 'failed' }] },
    { id: 's2', feature: 'project-onboarding', cases: [{ id: 'c', status: 'passed' }] },
    { id: 's3', feature: 'version-planning', cases: [{ id: 'd', status: 'passed' }] },
    { id: 's4', cases: [{ id: 'e', status: 'passed' }] },
    { id: 's5', feature: 'no-cases', cases: [] },
  ]);
  assert.deepEqual(coverage.map(x => [x.feature, x.passed, x.cases]), [['project-onboarding', 2, 3], ['version-planning', 1, 1], ['未归属', 1, 1]]);
  assert.deepEqual(coverage[0].suites, ['s1', 's2']);
  assert.deepEqual(coverage[0].caseList[1], { id: 'b', suite: 's1', status: 'failed' });
  assert.deepEqual(featureCoverage([]), []);
});

test('review.md and report.html carry the per-feature coverage list with the mapping caveat', async t => {
  const root = fixture(t);
  const code = 'require("node:fs").writeFileSync(process.argv[1]+"/proof.txt","ok");require("node:fs").writeFileSync(process.argv[1]+"/result.json",JSON.stringify({v:1,cases:[{id:"one",title:"旅程用例",status:"passed",evidence:["proof.txt"]}]}));process.exit(0)';
  const spec = step('case-step', code, { layer: 'browser', expectedCases: ['one'], title: '示例旅程', feature: 'demo-feature' });
  spec.command.push('{out}');
  const { out, report } = await run(root, [spec]);
  assert.equal(report.featureCoverage[0].feature, 'demo-feature');
  assert.equal(report.featureCoverage[0].passed, 1);
  const summary = fs.readFileSync(path.join(out, 'review.md'), 'utf8');
  assert.match(summary, /### 按特性覆盖清单（注册用例归属）/);
  assert.match(summary, /demo-feature/);
  assert.match(summary, /双向映射为唯一口径/);
  const page = fs.readFileSync(path.join(out, 'report.html'), 'utf8');
  assert.ok(page.includes('按特性覆盖清单'));
  assert.ok(page.includes('demo-feature'));
});
