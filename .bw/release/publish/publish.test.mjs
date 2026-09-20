import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBindings } from './publish.mjs';

const revision = 'f'.repeat(40);
const artifactSha = 'a'.repeat(64);
const version = 'v9.9.9';
const base = () => ({
  version,
  artifactSha256: artifactSha,
  allowDirty: false,
  packResult: { v: 1, ok: true, artifact: `BuildersWorkbench-${version}-Setup.exe`, sha256: artifactSha, revision, dirty: false, source_unchanged: true, packed_at: '2026-09-20T15:00:00Z' },
  packRun: { v: 1, profile: 'pack', status: 'passed', runId: 'run-pack', sourceUnchanged: true, source: { commit: revision, dirty: false } },
  installerRun: { v: 1, profile: 'installer', status: 'passed', runId: 'run-inst', sourceUnchanged: true, source: { commit: revision } },
  installerSetupIdentity: { sha256: artifactSha },
});

test('complete binding chain passes with zero refusals', () => {
  assert.deepEqual(validateBindings(base()), []);
});

test('every missing or mismatched record refuses with a human-readable reason', () => {
  const cases = [
    ['出包记录缺失', b => { b.packResult = null; }, /出包记录/],
    ['产物名不是版本串派生', b => { b.packResult.artifact = 'Renamed-Setup.exe'; }, /产物名/],
    ['现场哈希与记录不一致', b => { b.artifactSha256 = 'b'.repeat(64); }, /SHA-256/],
    ['构建修订缺失即 unknown', b => { delete b.packResult.revision; }, /构建修订/],
    ['出包期间源码变过', b => { b.packResult.source_unchanged = false; }, /source_unchanged/],
    ['脏树出包默认拒', b => { b.packResult.dirty = true; }, /脏/],
    ['门禁记录不是 pack 完整通过', b => { b.packRun.profile = 'pr'; }, /门禁验证/],
    ['门禁 run 源码已变化', b => { b.packRun.sourceUnchanged = false; }, /失效/],
    ['门禁与构建不同源', b => { b.packRun.source.commit = 'e'.repeat(40); }, /≠ 构建修订/],
    ['验包记录缺失', b => { b.installerRun = null; }, /验包记录/],
    ['验包与构建不同源', b => { b.installerRun.source.commit = 'e'.repeat(40); }, /≠ 构建修订/],
    ['验包测的不是这个包', b => { b.installerSetupIdentity.sha256 = 'b'.repeat(64); }, /验的不是这个包|不一致/],
    ['验包身份记录缺失', b => { b.installerSetupIdentity = null; }, /不一致或缺失/],
  ];
  for (const [name, mutate, pattern] of cases) {
    const input = base();
    mutate(input);
    const refuse = validateBindings(input);
    assert.ok(refuse.length > 0, `${name}: 必须拒发`);
    assert.match(refuse.join('；'), pattern, `${name}: 原因要能定位`);
  }
});

test('allow-dirty is an explicit human override, recorded not hidden', () => {
  const input = base();
  input.packResult.dirty = true;
  input.packRun.source.dirty = true;
  assert.ok(validateBindings(input).length > 0);
  input.allowDirty = true;
  assert.deepEqual(validateBindings(input), []);
});
