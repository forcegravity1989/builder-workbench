import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { inside, readCases, runVerification, sha256, storeEvidenceBlob } from './verify.mjs';

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
